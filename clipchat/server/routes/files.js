// File upload/download routes
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { encrypt, decrypt, encryptFile, decryptFile } = require('../crypto');
const { getEncryptionKey } = require('../auth');

const router = express.Router();

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10); // 10MB

// Configure multer for temporary storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// POST /api/files — upload file
router.post('/', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const key = getEncryptionKey();
    if (!key) {
      return res.status(500).json({ error: 'Encryption key not available' });
    }

    const id = uuidv4();
    const originalName = req.file.originalname;
    const filesize = req.file.size;
    const mimetype = req.file.mimetype;
    const device = req.body.device || req.headers['user-agent'];

    // Encrypt file content and write to disk
    const { encrypted: encryptedFile, iv: fileIv } = encryptFile(req.file.buffer, key);
    const uploadsDir = path.join(db.DATA_DIR, 'uploads');
    fs.writeFileSync(path.join(uploadsDir, id), encryptedFile);

    // Encrypt filename — stored as "iv_hex:data_hex" (self-contained)
    const { encrypted: encFilename, iv: fnIv } = encrypt(originalName, key);

    // Encrypt placeholder content — stored as "iv_hex:data_hex" (self-contained)
    const { encrypted: encContent, iv: contentIv } = encrypt(`file:${originalName}`, key);

    db.createMessage({
      id,
      type: 'file',
      content: Buffer.from(`${contentIv}:${encContent.toString('hex')}`),
      iv: fileIv, // file blob IV — used to decrypt the on-disk file
      filename: `${fnIv}:${encFilename.toString('hex')}`,
      filesize,
      mimetype,
      device,
    });

    const msg = {
      id,
      type: 'file',
      content: `file:${originalName}`,
      filename: originalName,
      filesize,
      mimetype,
      device,
      pinned: false,
      created_at: Math.floor(Date.now() / 1000),
    };

    if (req.app.locals.broadcast) {
      req.app.locals.broadcast('new_message', msg);
    }

    res.status(201).json(msg);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] POST /api/files error:`, e.message);
    if (e.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` });
    }
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET /api/files/:id — download file (decrypted on the fly)
router.get('/:id', (req, res) => {
  try {
    const msg = db.getMessage(req.params.id);
    if (!msg || msg.type !== 'file') {
      return res.status(404).json({ error: 'File not found' });
    }

    const key = getEncryptionKey();
    if (!key) {
      return res.status(500).json({ error: 'Encryption key not available' });
    }

    const filePath = path.join(db.DATA_DIR, 'uploads', msg.id);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File data not found' });
    }

    // Decrypt filename (stored as "iv_hex:data_hex")
    let filename = 'download';
    if (msg.filename) {
      try {
        const [fnIv, fnData] = msg.filename.split(':');
        filename = decrypt(Buffer.from(fnData, 'hex'), fnIv, key).toString('utf8');
      } catch {
        filename = 'download';
      }
    }

    // Read and decrypt file
    const encryptedData = fs.readFileSync(filePath);
    const decryptedData = decryptFile(encryptedData, msg.iv, key);

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', msg.mimetype || 'application/octet-stream');
    res.setHeader('Content-Length', decryptedData.length);
    res.send(decryptedData);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] GET /api/files/:id error:`, e.message);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Handle multer errors
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large. Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB` });
    }
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
