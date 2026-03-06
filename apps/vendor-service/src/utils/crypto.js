import crypto from 'crypto';
import config from '../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(config.encryptionKey, 'hex');

// ─── AES-256-GCM Encryption ───────────────────────────────────────────────
//
// Used exclusively for bank account details.
// Returns { ciphertext, iv, tag } — all three must be stored together.
// The IV is random per encryption — never reuse an IV with the same key.

export function encrypt(plaintext) {
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(plaintext), 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decrypt(ciphertext, iv, tag) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(iv, 'base64'),
  );

  decipher.setAuthTag(Buffer.from(tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}

// ─── SHA-256 Hashing for Blacklist ────────────────────────────────────────
//
// PAN / GSTIN / bank account numbers in the blacklist are hashed —
// we never store them plaintext so even a DB dump exposes nothing.

export function hashIdentifier(value) {
  return crypto
    .createHash('sha256')
    .update(value.trim().toUpperCase())
    .digest('hex');
}
