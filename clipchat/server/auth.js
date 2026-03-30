// Authentication middleware and session management
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('./db');
const { deriveKey, generateSalt } = require('./crypto');

const BCRYPT_ROUNDS = 12;
const SESSION_TTL_DAYS = parseInt(process.env.SESSION_TTL_DAYS || '30', 10);
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

// Rate limiting state for login attempts
const loginAttempts = new Map(); // ip -> { count, resetAt }

// In-memory encryption key (derived from password on login/setup)
let encryptionKey = null;

/**
 * Get current encryption key
 */
function getEncryptionKey() {
  return encryptionKey;
}

/**
 * Set encryption key (used during login/setup)
 */
function setEncryptionKey(key) {
  encryptionKey = key;
}

/**
 * Setup initial password (first run only)
 */
async function setupPassword(password) {
  if (db.isInitialized()) {
    throw new Error('Already initialized');
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const salt = generateSalt();
  const key = deriveKey(password, salt);

  db.setSetting('password_hash', hash);
  db.setSetting('encryption_salt', salt);
  db.setSetting('initialized', 'true');

  encryptionKey = key;
  return true;
}

/**
 * Verify password and create session
 */
async function login(password, userAgent) {
  const hash = db.getSetting('password_hash');
  if (!hash) throw new Error('Not initialized');

  const valid = await bcrypt.compare(password, hash);
  if (!valid) return null;

  // Derive encryption key
  const salt = db.getSetting('encryption_salt');
  encryptionKey = deriveKey(password, salt);

  // Create session
  const sessionId = crypto.randomUUID();
  db.createSession(sessionId, userAgent);

  return sessionId;
}

/**
 * Change password and re-encrypt all data
 */
async function changePassword(oldPassword, newPassword) {
  const hash = db.getSetting('password_hash');
  const valid = await bcrypt.compare(oldPassword, hash);
  if (!valid) throw new Error('Invalid current password');

  const oldSalt = db.getSetting('encryption_salt');
  const oldKey = deriveKey(oldPassword, oldSalt);

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const newSalt = generateSalt();
  const newKey = deriveKey(newPassword, newSalt);

  const cryptoModule = require('./crypto');

  // Re-encrypt all messages
  const messages = db.getAllMessages();
  const dbInstance = db.getDb();
  const transaction = dbInstance.transaction(() => {
    for (const msg of messages) {
      // Decrypt with old key
      const decrypted = cryptoModule.decrypt(msg.content, msg.iv, oldKey);
      // Encrypt with new key
      const { encrypted, iv } = cryptoModule.encrypt(decrypted, newKey);
      db.updateMessageContent(msg.id, encrypted, iv);

      // Re-encrypt filename if present
      if (msg.filename) {
        const decFilename = cryptoModule.decrypt(Buffer.from(msg.filename, 'hex'), msg.iv, oldKey);
        const encFilename = cryptoModule.encrypt(decFilename, newKey);
        db.updateMessageFilename(msg.id, encFilename.encrypted.toString('hex'));
      }
    }

    db.setSetting('password_hash', newHash);
    db.setSetting('encryption_salt', newSalt);
  });

  transaction();
  encryptionKey = newKey;

  // Re-encrypt uploaded files on disk
  const fs = require('fs');
  const path = require('path');
  const uploadsDir = path.join(db.DATA_DIR, 'uploads');
  for (const msg of messages) {
    if (msg.type === 'file') {
      const filePath = path.join(uploadsDir, msg.id);
      if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath);
        const decrypted = cryptoModule.decryptFile(fileData, msg.iv, oldKey);
        // Re-read fresh IV from DB after re-encryption
        const updated = db.getMessage(msg.id);
        const { encrypted } = cryptoModule.encryptFile(decrypted, newKey);
        // Update file IV in DB
        db.updateMessageContent(updated.id, updated.content, updated.iv);
        fs.writeFileSync(filePath, encrypted);
      }
    }
  }

  return true;
}

/**
 * Check rate limit for login attempts
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }

  if (entry.count >= 5) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Auth middleware — validates session cookie
 */
function authMiddleware(req, res, next) {
  // Allow unauthenticated access to auth endpoints
  if (req.path.startsWith('/api/auth/')) {
    return next();
  }

  const sessionId = req.cookies?.session;
  if (!sessionId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const session = db.getSession(sessionId);
  if (!session) {
    res.clearCookie('session');
    return res.status(401).json({ error: 'Invalid session' });
  }

  // Check session TTL
  const now = Math.floor(Date.now() / 1000);
  if (now - session.last_active > SESSION_TTL_SECONDS) {
    db.deleteSession(sessionId);
    res.clearCookie('session');
    return res.status(401).json({ error: 'Session expired' });
  }

  // Touch session
  db.touchSession(sessionId);
  req.sessionId = sessionId;
  next();
}

/**
 * Parse cookies from request (simple parser)
 */
function cookieParser(req, res, next) {
  req.cookies = {};
  const header = req.headers.cookie;
  if (header) {
    header.split(';').forEach((cookie) => {
      const [name, ...rest] = cookie.trim().split('=');
      req.cookies[name] = decodeURIComponent(rest.join('='));
    });
  }
  next();
}

// Clean expired sessions periodically
function startSessionCleanup() {
  setInterval(() => {
    try {
      db.cleanExpiredSessions(SESSION_TTL_SECONDS);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] Session cleanup error:`, e.message);
    }
  }, 60 * 60 * 1000); // Every hour
}

module.exports = {
  setupPassword,
  login,
  changePassword,
  checkRateLimit,
  authMiddleware,
  cookieParser,
  getEncryptionKey,
  setEncryptionKey,
  startSessionCleanup,
};
