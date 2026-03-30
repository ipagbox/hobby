// Encryption module — AES-256-GCM with PBKDF2 key derivation
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256 bits

/**
 * Derive encryption key from password + salt using PBKDF2
 */
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
}

/**
 * Generate a random salt for key derivation
 */
function generateSalt() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Encrypt plaintext with AES-256-GCM
 * Returns { encrypted: Buffer, iv: string }
 */
function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const input = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Store as: authTag (16 bytes) + encrypted data
  const combined = Buffer.concat([authTag, encrypted]);

  return {
    encrypted: combined,
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypt ciphertext with AES-256-GCM
 * Returns Buffer of decrypted data
 */
function decrypt(encryptedData, iv, key) {
  const ivBuffer = Buffer.from(iv, 'hex');
  const data = Buffer.isBuffer(encryptedData) ? encryptedData : Buffer.from(encryptedData);

  // Extract authTag (first 16 bytes) and ciphertext
  const authTag = data.subarray(0, AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Encrypt a file buffer
 */
function encryptFile(fileBuffer, key) {
  return encrypt(fileBuffer, key);
}

/**
 * Decrypt a file buffer
 */
function decryptFile(encryptedData, iv, key) {
  return decrypt(encryptedData, iv, key);
}

module.exports = {
  deriveKey,
  generateSalt,
  encrypt,
  decrypt,
  encryptFile,
  decryptFile,
};
