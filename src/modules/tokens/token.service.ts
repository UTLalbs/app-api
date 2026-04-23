import { ObjectId } from 'mongodb';

import { logger } from '../../config/logger';

import {
  consumeTokenAtomic,
  findValidTokenByValue,
  insertToken,
  invalidateTokensByUser,
  markPreviousTokensUsed,
} from './token.repository';
import type { CreateTokenDto, Token, TokenDocument, TokenType } from './token.types';
import { TokenTTL } from './token.types';

// ── Crear token ────────────────────────────────────────────────────────────

export async function createToken(dto: CreateTokenDto): Promise<Token> {
  const now = new Date();
  const ttl = TokenTTL[dto.type];

  // Invalidar tokens anteriores del mismo tipo para este usuario
  await markPreviousTokensUsed(dto.userId, dto.type, now);

  const token =
    crypto.randomUUID().replace(/-/g, '') +
    crypto.randomUUID().replace(/-/g, '');

  const doc: Omit<TokenDocument, '_id'> = {
    userId: new ObjectId(dto.userId),
    orgId: dto.orgId ? new ObjectId(dto.orgId) : null,
    token,
    type: dto.type,
    expiresAt: new Date(now.getTime() + ttl * 1000),
    usedAt: null,
    createdAt: now,
  };

  const created = await insertToken(doc);

  logger.info({ userId: dto.userId, type: dto.type }, 'Token created');

  return created;
}

// ── Consumir token ─────────────────────────────────────────────────────────

export async function consumeToken(
  token: string,
  type: TokenType,
): Promise<Token | null> {
  return consumeTokenAtomic(token, type);
}

// ── Buscar token válido ────────────────────────────────────────────────────

export async function findValidToken(
  token: string,
  type: TokenType,
): Promise<Token | null> {
  return findValidTokenByValue(token, type);
}

// ── Invalidar todos los tokens de un usuario ───────────────────────────────

export async function invalidateUserTokens(
  userId: string,
  type?: TokenType,
): Promise<void> {
  await invalidateTokensByUser(userId, type);
}
