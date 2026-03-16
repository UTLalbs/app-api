import { ObjectId } from 'mongodb';

import { logger } from '../../config/logger';

import { getTokenCollection } from './token.model';
import type { CreateTokenDto, Token, TokenDocument, TokenType } from './token.types';
import { TokenTTL } from './token.types';

// ── Conversión ─────────────────────────────────────────────────────────────

function toToken(doc: TokenDocument): Token {
  return {
    id: doc._id.toHexString(),
    userId: doc.userId.toHexString(),
    orgId: doc.orgId ? doc.orgId.toHexString() : null,
    token: doc.token,
    type: doc.type,
    expiresAt: doc.expiresAt,
    usedAt: doc.usedAt,
    createdAt: doc.createdAt,
  };
}

// ── Crear token ────────────────────────────────────────────────────────────

export async function createToken(dto: CreateTokenDto): Promise<Token> {
  const now = new Date();
  const ttl = TokenTTL[dto.type];

  // Invalidar tokens anteriores del mismo tipo para este usuario
  await getTokenCollection().updateMany(
    {
      userId: new ObjectId(dto.userId),
      type: dto.type,
      usedAt: null,
    },
    { $set: { usedAt: now } },
  );

  const token = crypto.randomUUID().replace(/-/g, '') +
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

  const result = await getTokenCollection().insertOne(doc as TokenDocument);

  logger.info({ userId: dto.userId, type: dto.type }, 'Token created');

  return {
    id: result.insertedId.toHexString(),
    userId: dto.userId,
    orgId: dto.orgId ?? null,
    token: doc.token,
    type: doc.type,
    expiresAt: doc.expiresAt,
    usedAt: null,
    createdAt: doc.createdAt,
  };
}

// ── Consumir token ─────────────────────────────────────────────────────────

export async function consumeToken(
  token: string,
  type: TokenType,
): Promise<Token | null> {
  const doc = await getTokenCollection().findOneAndUpdate(
    {
      token,
      type,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { returnDocument: 'after' },
  );

  if (!doc) return null;

  return toToken(doc as TokenDocument);
}

// ── Buscar token válido ────────────────────────────────────────────────────

export async function findValidToken(
  token: string,
  type: TokenType,
): Promise<Token | null> {
  const doc = await getTokenCollection().findOne({
    token,
    type,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });

  return doc ? toToken(doc as TokenDocument) : null;
}

// ── Invalidar todos los tokens de un usuario ───────────────────────────────

export async function invalidateUserTokens(
  userId: string,
  type?: TokenType,
): Promise<void> {
  const filter: Record<string, unknown> = {
    userId: new ObjectId(userId),
    usedAt: null,
  };

  if (type) filter.type = type;

  await getTokenCollection().updateMany(
    filter,
    { $set: { usedAt: new Date() } },
  );
}