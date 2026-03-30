// Tests for crypto module
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { deriveKey, generateSalt, encrypt, decrypt, encryptFile, decryptFile } = require('./crypto');

describe('crypto module', () => {
  const password = 'test-password-123';
  const salt = generateSalt();
  const key = deriveKey(password, salt);

  it('deriveKey returns a 32-byte buffer', () => {
    assert.equal(key.length, 32);
    assert.ok(Buffer.isBuffer(key));
  });

  it('deriveKey is deterministic (same password + salt = same key)', () => {
    const key2 = deriveKey(password, salt);
    assert.ok(key.equals(key2));
  });

  it('deriveKey produces different keys for different salts', () => {
    const salt2 = generateSalt();
    const key2 = deriveKey(password, salt2);
    assert.ok(!key.equals(key2));
  });

  it('generateSalt returns unique hex strings', () => {
    const s1 = generateSalt();
    const s2 = generateSalt();
    assert.notEqual(s1, s2);
    assert.equal(s1.length, 64); // 32 bytes = 64 hex chars
  });

  it('encrypt + decrypt roundtrip for text', () => {
    const plaintext = 'Hello, ClipChat! Привет мир! 🎉';
    const { encrypted, iv } = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, iv, key);
    assert.equal(decrypted.toString('utf8'), plaintext);
  });

  it('encrypt produces unique IVs each time', () => {
    const { iv: iv1 } = encrypt('test', key);
    const { iv: iv2 } = encrypt('test', key);
    assert.notEqual(iv1, iv2);
  });

  it('decrypt fails with wrong key', () => {
    const { encrypted, iv } = encrypt('secret', key);
    const wrongKey = deriveKey('wrong-password', salt);
    assert.throws(() => decrypt(encrypted, iv, wrongKey));
  });

  it('decrypt fails with tampered data', () => {
    const { encrypted, iv } = encrypt('secret', key);
    // Tamper with encrypted data
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0xff;
    assert.throws(() => decrypt(tampered, iv, key));
  });

  it('encryptFile + decryptFile roundtrip for binary data', () => {
    const fileBuffer = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x50, 0x4e, 0x47]);
    const { encrypted, iv } = encryptFile(fileBuffer, key);
    const decrypted = decryptFile(encrypted, iv, key);
    assert.ok(fileBuffer.equals(decrypted));
  });

  it('handles empty string', () => {
    const { encrypted, iv } = encrypt('', key);
    const decrypted = decrypt(encrypted, iv, key);
    assert.equal(decrypted.toString('utf8'), '');
  });

  it('handles large text', () => {
    const large = 'A'.repeat(100000);
    const { encrypted, iv } = encrypt(large, key);
    const decrypted = decrypt(encrypted, iv, key);
    assert.equal(decrypted.toString('utf8'), large);
  });
});
