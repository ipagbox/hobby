// Messages CRUD routes
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { encrypt, decrypt } = require('../crypto');
const { getEncryptionKey } = require('../auth');

const router = express.Router();

// GET /api/messages — list messages with cursor pagination
router.get('/', (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '50', 10) || 50, 100));
    const before = req.query.before || null;
    const pinned = req.query.pinned === 'true';

    let messages;
    if (pinned) {
      messages = db.getPinnedMessages();
    } else {
      messages = db.getMessages(limit, before);
    }

    const key = getEncryptionKey();
    if (!key) {
      return res.status(500).json({ error: 'Encryption key not available' });
    }

    // Decrypt messages for response
    const decrypted = messages.map((msg) => {
      try {
        let content;
        let filename = null;

        if (msg.type === 'file') {
          // File messages store content and filename as self-contained "iv:data_hex"
          try {
            const contentStr = msg.content.toString('utf8');
            const [cIv, cData] = contentStr.split(':');
            content = decrypt(Buffer.from(cData, 'hex'), cIv, key).toString('utf8');
          } catch {
            content = '[file]';
          }
          if (msg.filename) {
            try {
              const [fnIv, fnData] = msg.filename.split(':');
              filename = decrypt(Buffer.from(fnData, 'hex'), fnIv, key).toString('utf8');
            } catch {
              filename = msg.filename;
            }
          }
        } else {
          // Text/clip messages: content blob + iv stored directly
          content = decrypt(msg.content, msg.iv, key).toString('utf8');
        }
        return {
          id: msg.id,
          type: msg.type,
          content,
          filename,
          filesize: msg.filesize,
          mimetype: msg.mimetype,
          device: msg.device,
          pinned: !!msg.pinned,
          created_at: msg.created_at,
          updated_at: msg.updated_at,
        };
      } catch (e) {
        console.error(`[${new Date().toISOString()}] Failed to decrypt message ${msg.id}:`, e.message);
        return {
          id: msg.id,
          type: msg.type,
          content: '[Decryption failed]',
          device: msg.device,
          pinned: !!msg.pinned,
          created_at: msg.created_at,
        };
      }
    });

    res.json({ messages: decrypted });
  } catch (e) {
    console.error(`[${new Date().toISOString()}] GET /api/messages error:`, e.message);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/messages — create message
router.post('/', (req, res) => {
  try {
    const { type, content, device } = req.body;

    if (!type || !content) {
      return res.status(400).json({ error: 'type and content are required' });
    }

    if (!['text', 'clip'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Use "text" or "clip"' });
    }

    const key = getEncryptionKey();
    if (!key) {
      return res.status(500).json({ error: 'Encryption key not available' });
    }

    const id = uuidv4();
    const { encrypted, iv } = encrypt(content, key);

    db.createMessage({
      id,
      type,
      content: encrypted,
      iv,
      device: device || req.headers['user-agent'],
    });

    const msg = {
      id,
      type,
      content,
      device: device || req.headers['user-agent'],
      pinned: false,
      created_at: Math.floor(Date.now() / 1000),
    };

    // Broadcast via WebSocket
    if (req.app.locals.broadcast) {
      req.app.locals.broadcast('new_message', msg);
    }

    res.status(201).json(msg);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] POST /api/messages error:`, e.message);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

// DELETE /api/messages/:id — delete single message
router.delete('/:id', (req, res) => {
  try {
    const msg = db.deleteMessage(req.params.id);
    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Delete associated file if exists
    if (msg.type === 'file') {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(db.DATA_DIR, 'uploads', msg.id);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    if (req.app.locals.broadcast) {
      req.app.locals.broadcast('delete_message', { id: req.params.id });
    }

    res.json({ success: true });
  } catch (e) {
    console.error(`[${new Date().toISOString()}] DELETE /api/messages error:`, e.message);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// PATCH /api/messages/:id/pin — toggle pin
router.patch('/:id/pin', (req, res) => {
  try {
    const msg = db.togglePin(req.params.id);
    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (req.app.locals.broadcast) {
      req.app.locals.broadcast('pin_message', { id: req.params.id, pinned: !!msg.pinned });
    }

    res.json({ id: msg.id, pinned: !!msg.pinned });
  } catch (e) {
    console.error(`[${new Date().toISOString()}] PATCH pin error:`, e.message);
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
});

// DELETE /api/messages — delete all messages
router.delete('/', (req, res) => {
  try {
    // Clean up all uploaded files
    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.join(db.DATA_DIR, 'uploads');
    if (fs.existsSync(uploadsDir)) {
      for (const file of fs.readdirSync(uploadsDir)) {
        fs.unlinkSync(path.join(uploadsDir, file));
      }
    }

    db.deleteAllMessages();

    if (req.app.locals.broadcast) {
      req.app.locals.broadcast('clear_messages', {});
    }

    res.json({ success: true });
  } catch (e) {
    console.error(`[${new Date().toISOString()}] DELETE all messages error:`, e.message);
    res.status(500).json({ error: 'Failed to delete messages' });
  }
});

module.exports = router;
