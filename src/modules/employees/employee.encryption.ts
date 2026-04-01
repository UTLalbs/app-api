import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { env } from '../../config/env';

// ── Config ─────────────────────────────────────────────────────────────────
// AES-256-GCM — autenticado, más seguro que CBC
// IV: 12 bytes (96 bits) — recomendado para GCM
// Auth tag: 16 bytes

const ALGORITHM  = 'aes-256-gcm';
const IV_LENGTH  = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, 'utf8');
}

// ── Formato del texto cifrado ──────────────────────────────────────────────
// iv(12 bytes) + authTag(16 bytes) + encrypted — todo en hex
// Ejemplo: "a1b2c3...{24 chars iv}{32 chars tag}{encrypted}"

export function encrypt(plaintext: string): string {
  const iv         = randomBytes(IV_LENGTH);
  const key        = getKey();
  const cipher     = createCipheriv(ALGORITHM, key, iv);

  const encrypted  = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Concatenar iv + authTag + encrypted en hex
  return Buffer.concat([iv, authTag, encrypted]).toString('hex');
}

export function decrypt(ciphertext: string): string {
  const buf      = Buffer.from(ciphertext, 'hex');

  const iv       = buf.subarray(0, IV_LENGTH);
  const authTag  = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const key      = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8');
}

// ── Helpers para cuentas bancarias ─────────────────────────────────────────

export function encryptAccountNumber(accountNumber: string): string {
  return encrypt(accountNumber);
}

export function decryptAccountNumber(encrypted: string): string {
  return decrypt(encrypted);
}

export function encryptClabe(clabe: string): string {
  return encrypt(clabe);
}

export function decryptClabe(encrypted: string): string {
  return decrypt(encrypted);
}

export function getLastFour(accountNumber: string): string {
  return accountNumber.slice(-4);
}