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

  const fs = require('fs');
  const path = require('path');
  const uploadsDir = path.join(db.DATA_DIR, 'uploads');

  const messages = db.getAllMessages();

  // Phase 1: Re-encrypt file blobs on disk first, keeping old-key backups.
  // If anything fails here, the originals are untouched.
  const fileOps = []; // { filePath, newData, backupPath }
  for (const msg of messages) {
    if (msg.type === 'file') {
      const filePath = path.join(uploadsDir, msg.id);
      if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath);
        const decFile = cryptoModule.decryptFile(fileData, msg.iv, oldKey);
        const { encrypted: encFile, iv: newFileIv } = cryptoModule.encryptFile(decFile, newKey);
        const backupPath = filePath + '.bak';
        fileOps.push({ filePath, newData: encFile, newFileIv, backupPath, msgId: msg.id });
      }
    }
  }

  // Create backups of all files before modifying anything
  for (const op of fileOps) {
    fs.copyFileSync(op.filePath, op.backupPath);
  }

  // Phase 2: Write new encrypted files to disk
  try {
    for (const op of fileOps) {
      fs.writeFileSync(op.filePath, op.newData);
    }
  } catch (diskErr) {
    // Restore backups on failure
    for (const op of fileOps) {
      if (fs.existsSync(op.backupPath)) {
        fs.copyFileSync(op.backupPath, op.filePath);
        fs.unlinkSync(op.backupPath);
      }
    }
    throw new Error('Failed to re-encrypt files on disk: ' + diskErr.message);
  }

  // Phase 3: Update DB in a transaction (file blobs are already written with new key)
  const dbInstance = db.getDb();
  try {
    const transaction = dbInstance.transaction(() => {
      // Build a lookup of new file IVs
      const newFileIvs = new Map();
      for (const op of fileOps) {
        newFileIvs.set(op.msgId, op.newFileIv);
      }

      for (const msg of messages) {
        if (msg.type === 'file') {
          // Re-encrypt content (self-contained "iv:data_hex")
          const contentStr = msg.content.toString('utf8');
          const [cIv, cData] = contentStr.split(':');
          const decContent = cryptoModule.decrypt(Buffer.from(cData, 'hex'), cIv, oldKey);
          const { encrypted: encContent, iv: newCIv } = cryptoModule.encrypt(decContent, newKey);
          const newContentBlob = Buffer.from(`${newCIv}:${encContent.toString('hex')}`);

          // Re-encrypt filename
          if (msg.filename) {
            const [fnIv, fnData] = msg.filename.split(':');
            const decFilename = cryptoModule.decrypt(Buffer.from(fnData, 'hex'), fnIv, oldKey);
            const { encrypted: encFn, iv: newFnIv } = cryptoModule.encrypt(decFilename, newKey);
            db.updateMessageFilename(msg.id, `${newFnIv}:${encFn.toString('hex')}`);
          }

          const fileIv = newFileIvs.get(msg.id) || msg.iv;
          db.updateMessageContent(msg.id, newContentBlob, fileIv);
        } else {
          // Text/clip messages
          const decrypted = cryptoModule.decrypt(msg.content, msg.iv, oldKey);
          const { encrypted, iv } = cryptoModule.encrypt(decrypted, newKey);
          db.updateMessageContent(msg.id, encrypted, iv);
        }
      }

      db.setSetting('password_hash', newHash);
      db.setSetting('encryption_salt', newSalt);
    });

    transaction();
  } catch (dbErr) {
    // DB transaction failed and rolled back — restore file backups to match old key
    for (const op of fileOps) {
      if (fs.existsSync(op.backupPath)) {
        fs.copyFileSync(op.backupPath, op.filePath);
        fs.unlinkSync(op.backupPath);
      }
    }
    throw new Error('Failed to update database: ' + dbErr.message);
  }

  // Phase 4: Clean up backups on success
  for (const op of fileOps) {
    if (fs.existsSync(op.backupPath)) {
      fs.unlinkSync(op.backupPath);
    }
  }

  encryptionKey = newKey;

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
  // Allow unauthenticated access to public auth endpoints only
  const publicAuthPaths = ['/api/auth/setup', '/api/auth/login', '/api/auth/logout', '/api/auth/check'];
  if (publicAuthPaths.includes(req.path)) {
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
