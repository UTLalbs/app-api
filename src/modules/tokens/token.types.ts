import type { ObjectId } from 'mongodb';

// ── Enums ──────────────────────────────────────────────────────────────────

export type TokenType = 'refresh' | 'reset' | 'verify' | 'invite';

// ── TTLs por tipo (en segundos) ────────────────────────────────────────────

export const TokenTTL: Record<TokenType, number> = {
  invite:  60 * 60 * 72,   // 72 horas
  reset:   60 * 60,         // 1 hora
  verify:  60 * 60 * 24,   // 24 horas
  refresh: 60 * 60 * 24 * 30, // 30 días
};

// ── Documento en MongoDB ───────────────────────────────────────────────────

export interface TokenDocument {
  _id: ObjectId;
  userId: ObjectId;
  orgId: ObjectId | null;
  token: string;
  type: TokenType;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

// ── Tipo de dominio ────────────────────────────────────────────────────────

export interface Token {
  id: string;
  userId: string;
  orgId: string | null;
  token: string;
  type: TokenType;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateTokenDto {
  userId: string;
  orgId?: string | null;
  type: TokenType;
}