#!/usr/bin/env node
/**
 * generate-keys.js
 *
 * Generates an RS256 keypair for JWT signing.
 * Run once: node scripts/generate-keys.js
 *
 * Prints the private + public key as single-line strings (newlines as \n)
 * ready to paste directly into .env
 */

import { generateKeyPairSync } from 'crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength:  2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const escape = (pem) => pem.replace(/\n/g, '\\n');

console.log('\n# ── Paste these into your .env file ──────────────────────\n');
console.log(`JWT_PRIVATE_KEY="${escape(privateKey)}"`);
console.log(`JWT_PUBLIC_KEY="${escape(publicKey)}"`);
console.log('\n# ── Public key for OTHER services ────────────────────────');
console.log('# Set JWT_PUBLIC_KEY in every downstream service to the value above.');
console.log('# They verify tokens; only Auth Service needs JWT_PRIVATE_KEY.\n');
