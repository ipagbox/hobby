// ClipChat — main entry point
const http = require('http');
const express = require('express');
const path = require('path');
const db = require('./db');
const auth = require('./auth');
const ws = require('./ws');
const messagesRouter = require('./routes/messages');
const filesRouter = require('./routes/files');

const PORT = parseInt(process.env.PORT || '3000', 10);

// Initialize database
db.init();
console.log(`[${new Date().toISOString()}] Database initialized`);

const app = express();

// CORS — restrict to LAN
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  const allowed = !origin ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin);

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Middleware
app.use(auth.cookieParser);
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Auth routes (before auth middleware)
app.post('/api/auth/setup', async (req, res) => {
  try {
    if (db.isInitialized()) {
      return res.status(400).json({ error: 'Already initialized' });
    }
    const { password } = req.body;
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    await auth.setupPassword(password);

    // Auto-login after setup
    const sessionId = await auth.login(password, req.headers['user-agent']);
    res.cookie('session', sessionId, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true });
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Setup error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress;
    if (!auth.checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Too many login attempts. Try again in a minute.' });
    }

    if (!db.isInitialized()) {
      return res.status(400).json({ error: 'Not initialized. Set up password first.' });
    }

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const sessionId = await auth.login(password, req.headers['user-agent']);
    if (!sessionId) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    res.cookie('session', sessionId, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true });
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Login error:`, e.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const sessionId = req.cookies?.session;
  if (sessionId) {
    db.deleteSession(sessionId);
  }
  res.clearCookie('session');
  res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
  const sessionId = req.cookies?.session;
  if (!sessionId) {
    return res.json({ authenticated: false, initialized: db.isInitialized() });
  }
  const session = db.getSession(sessionId);
  const authenticated = !!session && !!auth.getEncryptionKey();
  return res.json({ authenticated, initialized: db.isInitialized() });
});

// Auth middleware for protected routes
app.use('/api/messages', auth.authMiddleware);
app.use('/api/files', auth.authMiddleware);

// Change password (protected)
app.post('/api/auth/change-password', auth.authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Both old and new passwords are required' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' });
    }
    await auth.changePassword(oldPassword, newPassword);
    res.json({ success: true });
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Change password error:`, e.message);
    res.status(400).json({ error: e.message });
  }
});

// API routes
app.use('/api/messages', messagesRouter);
app.use('/api/files', filesRouter);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Create HTTP server
const server = http.createServer(app);

// Setup WebSocket
const { broadcast } = ws.setup(server);
app.locals.broadcast = broadcast;

// Start session cleanup
auth.startSessionCleanup();

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] ClipChat server running on http://0.0.0.0:${PORT}`);
  console.log(`[${new Date().toISOString()}] Initialized: ${db.isInitialized()}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n[${new Date().toISOString()}] Shutting down...`);
  db.close();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  server.close();
  process.exit(0);
});
