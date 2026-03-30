// SQLite database initialization and queries
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'clipchat.db');

let db = null;

/**
 * Initialize database connection and create tables
 */
function init() {
  // Ensure data directory exists
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      last_active INTEGER NOT NULL,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content BLOB NOT NULL,
      iv TEXT NOT NULL,
      filename TEXT,
      filesize INTEGER,
      mimetype TEXT,
      device TEXT,
      pinned INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(pinned, created_at DESC);
  `);

  return db;
}

/**
 * Get raw database instance
 */
function getDb() {
  if (!db) throw new Error('Database not initialized. Call init() first.');
  return db;
}

// --- Settings ---

function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function isInitialized() {
  return getSetting('initialized') === 'true';
}

// --- Sessions ---

function createSession(id, userAgent) {
  const now = Math.floor(Date.now() / 1000);
  getDb().prepare(
    'INSERT INTO sessions (id, created_at, last_active, user_agent) VALUES (?, ?, ?, ?)'
  ).run(id, now, now, userAgent || null);
}

function getSession(id) {
  return getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

function touchSession(id) {
  const now = Math.floor(Date.now() / 1000);
  getDb().prepare('UPDATE sessions SET last_active = ? WHERE id = ?').run(now, id);
}

function deleteSession(id) {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

function cleanExpiredSessions(ttlSeconds) {
  const cutoff = Math.floor(Date.now() / 1000) - ttlSeconds;
  getDb().prepare('DELETE FROM sessions WHERE last_active < ?').run(cutoff);
}

// --- Messages ---

function getMessages(limit = 50, beforeId = null) {
  if (beforeId) {
    const ref = getDb().prepare('SELECT created_at FROM messages WHERE id = ?').get(beforeId);
    if (!ref) return [];
    return getDb().prepare(
      'SELECT * FROM messages WHERE created_at < ? ORDER BY created_at DESC LIMIT ?'
    ).all(ref.created_at, limit);
  }
  return getDb().prepare(
    'SELECT * FROM messages ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
}

function getPinnedMessages() {
  return getDb().prepare(
    'SELECT * FROM messages WHERE pinned = 1 ORDER BY created_at DESC'
  ).all();
}

function getMessage(id) {
  return getDb().prepare('SELECT * FROM messages WHERE id = ?').get(id);
}

function createMessage(msg) {
  getDb().prepare(`
    INSERT INTO messages (id, type, content, iv, filename, filesize, mimetype, device, pinned, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(msg.id, msg.type, msg.content, msg.iv, msg.filename || null,
    msg.filesize || null, msg.mimetype || null, msg.device || null,
    Math.floor(Date.now() / 1000));
}

function deleteMessage(id) {
  const msg = getMessage(id);
  getDb().prepare('DELETE FROM messages WHERE id = ?').run(id);
  return msg;
}

function togglePin(id) {
  const msg = getMessage(id);
  if (!msg) return null;
  const newPinned = msg.pinned ? 0 : 1;
  getDb().prepare('UPDATE messages SET pinned = ?, updated_at = ? WHERE id = ?')
    .run(newPinned, Math.floor(Date.now() / 1000), id);
  return { ...msg, pinned: newPinned };
}

function deleteAllMessages() {
  getDb().prepare('DELETE FROM messages').run();
}

function getAllMessages() {
  return getDb().prepare('SELECT * FROM messages ORDER BY created_at ASC').all();
}

function updateMessageContent(id, content, iv) {
  getDb().prepare('UPDATE messages SET content = ?, iv = ?, updated_at = ? WHERE id = ?')
    .run(content, iv, Math.floor(Date.now() / 1000), id);
}

function updateMessageFilename(id, filename) {
  getDb().prepare('UPDATE messages SET filename = ?, updated_at = ? WHERE id = ?')
    .run(filename, Math.floor(Date.now() / 1000), id);
}

/**
 * Close database connection
 */
function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  init,
  getDb,
  getSetting,
  setSetting,
  isInitialized,
  createSession,
  getSession,
  touchSession,
  deleteSession,
  cleanExpiredSessions,
  getMessages,
  getPinnedMessages,
  getMessage,
  createMessage,
  deleteMessage,
  togglePin,
  deleteAllMessages,
  getAllMessages,
  updateMessageContent,
  updateMessageFilename,
  close,
  get DATA_DIR() { return DATA_DIR; },
};
