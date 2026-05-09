import {
	PutObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	CopyObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppError } from '../../shared/errors/AppError';

import { getS3Client } from './s3.client';

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface UploadResult {
  key:      string;
  url:      string;
  fileSize: number;
  mimeType: string;
}

export interface PresignedUrlResult {
  url:       string;
  expiresAt: Date;
}

// ── Validación ─────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function validateFile(mimeType: string, fileSize: number): void {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new AppError(
      'Tipo de archivo no permitido. Solo PDF, JPG y PNG.',
      400,
      'INVALID_FILE_TYPE',
    );
  }

  if (fileSize > MAX_FILE_SIZE) {
    throw new AppError(
      'El archivo excede el tamaño máximo de 10MB.',
      400,
      'FILE_TOO_LARGE',
    );
  }
}

// ── Key generator ──────────────────────────────────────────────────────────
// Patrón: {module}/{orgId}/{entityId}/{category}/{timestamp}_{filename}
// Ejemplo: employees/org123/user456/licenses/1712345678_licencia.pdf
//          units/org123/unit789/documents/1712345678_seguro.pdf

export function generateS3Key(
  module:   string,
  orgId:    string,
  entityId: string,
  category: string,
  filename: string,
): string {
  const timestamp = Date.now();
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${module}/${orgId}/${entityId}/${category}/${timestamp}_${sanitized}`;
}

// ── Upload ─────────────────────────────────────────────────────────────────

export async function uploadFile(
  key:      string,
  buffer:   Buffer,
  mimeType: string,
): Promise<UploadResult> {
  try {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket:      env.S3_BUCKET_NAME,
        Key:         key,
        Body:        buffer,
        ContentType: mimeType,
      }),
    );

    const url = `https://${env.S3_BUCKET_NAME}.s3.${env.S3_REGION}.amazonaws.com/${key}`;

    logger.info({ key, fileSize: buffer.length }, 'File uploaded to S3');

    return { key, url, fileSize: buffer.length, mimeType };
  } catch (err) {
    logger.error({ err, key }, 'S3 upload failed');
    throw new AppError(
      'Error al subir el archivo. Intenta de nuevo.',
      502,
      'S3_UPLOAD_ERROR',
    );
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────

export async function deleteFile(key: string): Promise<void> {
  try {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key:    key,
      }),
    );
    logger.info({ key }, 'File deleted from S3');
  } catch (err) {
    // No lanzar error si el archivo no existe
    logger.warn({ err, key }, 'S3 delete failed — continuing');
  }
}

// ── Presigned URL ──────────────────────────────────────────────────────────

export async function getPresignedUrl(
  key:              string,
  expiresInSeconds: number = 3600,
): Promise<PresignedUrlResult> {
  try {
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key:    key,
    });

    const url = await getSignedUrl(getS3Client(), command, {
      expiresIn: expiresInSeconds,
    });

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    logger.info({ key, expiresAt }, 'Presigned URL generated');

    return { url, expiresAt };
  } catch (err) {
    logger.error({ err, key }, 'S3 presign failed');
    throw new AppError(
      'Error al generar el enlace de descarga.',
      502,
      'S3_PRESIGN_ERROR',
    );
  }
}

// ── Copy (server-side, no descarga ni resube) ─────────────────────────────

export async function copyFile(
  sourceKey: string,
  destKey: string,
): Promise<UploadResult> {
  try {
    await getS3Client().send(
      new CopyObjectCommand({
        Bucket:     env.S3_BUCKET_NAME,
        CopySource: `${env.S3_BUCKET_NAME}/${encodeURIComponent(sourceKey)}`,
        Key:        destKey,
      }),
    );

    // Para devolver fileSize/mimeType del nuevo objeto, hacemos HEAD
    const head = await getS3Client().send(
      new HeadObjectCommand({ Bucket: env.S3_BUCKET_NAME, Key: destKey }),
    );

    const url = `https://${env.S3_BUCKET_NAME}.s3.${env.S3_REGION}.amazonaws.com/${destKey}`;
    const fileSize = head.ContentLength ?? 0;
    const mimeType = head.ContentType ?? 'application/octet-stream';

    logger.info({ sourceKey, destKey, fileSize }, 'File copied in S3');

    return { key: destKey, url, fileSize, mimeType };
  } catch (err) {
    logger.error({ err, sourceKey, destKey }, 'S3 copy failed');
    throw new AppError(
      'Error al asociar el archivo. Intenta de nuevo.',
      502,
      'S3_COPY_ERROR',
    );
  }
}

// ── List (paginado, para cleanup) ─────────────────────────────────────────

export interface ListedObject {
  key:          string;
  size:         number;
  lastModified: Date;
}

export async function listObjects(prefix: string): Promise<ListedObject[]> {
  const all: ListedObject[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket:            env.S3_BUCKET_NAME,
        Prefix:            prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of result.Contents ?? []) {
      if (!obj.Key || !obj.LastModified) continue;
      all.push({
        key:          obj.Key,
        size:         obj.Size ?? 0,
        lastModified: obj.LastModified,
      });
    }

    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return all;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function extractKeyFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\//, '');
  } catch {
    return url;
  }
}