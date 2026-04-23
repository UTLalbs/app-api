import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import cron from 'node-cron';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getAuditCollection } from '../../modules/audit/audit.model';
import type { AuditDocument } from '../../modules/audit/audit.types';
import { getS3Client } from '../storage/s3.client';

// Ventana de archivo: los eventos que expiran dentro de los siguientes
// ARCHIVE_HORIZON_DAYS días se archivan antes de que el TTL los elimine.
// Así evitamos una carrera con el barrido TTL de Mongo.
const ARCHIVE_HORIZON_DAYS = 7;

const MAX_DOCS_PER_CHUNK = 5_000;

// S3 Glacier Instant Retrieval — bajo costo, acceso ocasional en <1s.
const STORAGE_CLASS = 'GLACIER_IR';

function archivePrefix(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `audit/${y}/${m}/${d}`;
}

export async function runAuditArchive(): Promise<void> {
  const bucket = env.AUDIT_ARCHIVE_BUCKET;
  if (!bucket) {
    logger.warn('AUDIT_ARCHIVE_BUCKET not set — skipping audit archive');
    return;
  }

  const cutoff = new Date(
    Date.now() + ARCHIVE_HORIZON_DAYS * 24 * 60 * 60 * 1000,
  );

  const collection = getAuditCollection();
  const cursor = collection.find({ expiresAt: { $lt: cutoff } });

  const batch: AuditDocument[] = [];
  let totalArchived = 0;

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;

    const ndjson = batch
      .map((doc) => JSON.stringify(serializeDoc(doc)))
      .join('\n');
    const compressed = gzipSync(Buffer.from(ndjson, 'utf-8'));

    const key = `${archivePrefix(new Date())}/chunk-${randomUUID()}.ndjson.gz`;

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: compressed,
        ContentType: 'application/x-ndjson',
        ContentEncoding: 'gzip',
        StorageClass: STORAGE_CLASS,
      }),
    );

    // Solo eliminar si el upload a S3 fue exitoso
    const ids = batch.map((d) => d._id);
    const del = await collection.deleteMany({ _id: { $in: ids } });

    totalArchived += del.deletedCount ?? 0;
    logger.info(
      { key, docs: batch.length, deleted: del.deletedCount, bucket },
      'Audit archive chunk uploaded',
    );

    batch.length = 0;
  };

  try {
    for await (const doc of cursor) {
      batch.push(doc as AuditDocument);
      if (batch.length >= MAX_DOCS_PER_CHUNK) {
        await flush();
      }
    }
    await flush();

    logger.info({ totalArchived }, 'Audit archive run complete');
  } catch (err) {
    logger.error({ err }, 'Audit archive run failed');
  }
}

function serializeDoc(doc: AuditDocument): Record<string, unknown> {
  return {
    ...doc,
    _id: doc._id.toHexString(),
    orgId: doc.orgId?.toHexString(),
    impersonating: doc.impersonating
      ? {
          orgId: doc.impersonating.orgId.toHexString(),
          orgName: doc.impersonating.orgName,
        }
      : undefined,
    createdAt: doc.createdAt.toISOString(),
    expiresAt: doc.expiresAt.toISOString(),
  };
}

// Programación cron — corre todos los días a las 03:00 UTC.
export function registerAuditArchiveJob(): void {
  cron.schedule(
    '0 3 * * *',
    () => {
      runAuditArchive().catch((err) =>
        logger.error({ err }, 'Unhandled error in audit archive cron'),
      );
    },
    { timezone: 'UTC' },
  );

  logger.info('✅  Audit archive job registered (daily 03:00 UTC)');
}
