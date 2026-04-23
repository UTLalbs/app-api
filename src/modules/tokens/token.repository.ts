import { ObjectId } from 'mongodb';

import { getTokenCollection } from './token.model';
import type { Token, TokenDocument, TokenType } from './token.types';

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

// ── Mutaciones ─────────────────────────────────────────────────────────────

export async function insertToken(
  doc: Omit<TokenDocument, '_id'>,
): Promise<Token> {
  const result = await getTokenCollection().insertOne(doc as TokenDocument);

  return {
    id: result.insertedId.toHexString(),
    userId: doc.userId.toHexString(),
    orgId: doc.orgId ? doc.orgId.toHexString() : null,
    token: doc.token,
    type: doc.type,
    expiresAt: doc.expiresAt,
    usedAt: doc.usedAt,
    createdAt: doc.createdAt,
  };
}

export async function markPreviousTokensUsed(
  userId: string,
  type: TokenType,
  at: Date = new Date(),
): Promise<void> {
  if (!ObjectId.isValid(userId)) return;

  await getTokenCollection().updateMany(
    {
      userId: new ObjectId(userId),
      type,
      usedAt: null,
    },
    { $set: { usedAt: at } },
  );
}

export async function consumeTokenAtomic(
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

  return doc ? toToken(doc as TokenDocument) : null;
}

// ── Lecturas ───────────────────────────────────────────────────────────────

export async function findValidTokenByValue(
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

// ── Invalidación masiva ────────────────────────────────────────────────────

export async function invalidateTokensByUser(
  userId: string,
  type?: TokenType,
): Promise<void> {
  if (!ObjectId.isValid(userId)) return;

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
