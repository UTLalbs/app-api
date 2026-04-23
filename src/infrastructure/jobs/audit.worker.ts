import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import Redis from 'ioredis';
import { ObjectId } from 'mongodb';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getAuditCollection } from '../../modules/audit/audit.model';
import type {
  AuditDocument,
  CreateAuditDto,
} from '../../modules/audit/audit.types';
import { getRetentionDays } from '../../modules/audit/audit.types';

import { AUDIT_QUEUE_NAME } from './audit.queue';

let workerConnection: Redis | null = null;
let worker: Worker<CreateAuditDto> | null = null;

function getWorkerConnection(): Redis {
  if (!workerConnection) {
    workerConnection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }
  return workerConnection;
}

// Processor — inserta el evento en Mongo con expiresAt calculado
// y los IDs convertidos a ObjectId.
//
// Si el string de un ID no es un ObjectId válido se guarda `undefined` en vez
// de explotar: el evento sigue llegando aunque el caller haya pasado algo raro.
async function processJob(job: Job<CreateAuditDto>): Promise<void> {
  const dto = job.data;
  const now = new Date();
  const retentionMs = getRetentionDays(dto.action) * 24 * 60 * 60 * 1000;

  const doc: Omit<AuditDocument, '_id'> = {
    category: dto.category,
    action: dto.action,
    actor: {
      id: toOidOrThrow(dto.actor.id, 'actor.id'),
      email: dto.actor.email,
      displayName: dto.actor.displayName,
    },
    target: dto.target
      ? {
          type: dto.target.type,
          id: toOidOrThrow(dto.target.id, `target[${dto.target.type}].id`),
          displayName: dto.target.displayName,
        }
      : undefined,
    diff: dto.diff,
    metadata: dto.metadata,
    ip: dto.ip ?? undefined,
    userAgent: dto.userAgent ?? undefined,
    orgId: dto.orgId && ObjectId.isValid(dto.orgId)
      ? new ObjectId(dto.orgId)
      : undefined,
    requestId: dto.requestId,
    impersonating: dto.impersonating && ObjectId.isValid(dto.impersonating.orgId)
      ? {
          orgId: new ObjectId(dto.impersonating.orgId),
          orgName: dto.impersonating.orgName,
        }
      : undefined,
    createdAt: now,
    expiresAt: new Date(now.getTime() + retentionMs),
  };

  await getAuditCollection().insertOne(doc as AuditDocument);
}

function toOidOrThrow(id: string, label: string): ObjectId {
  if (!ObjectId.isValid(id)) {
    throw new Error(`Audit event received invalid ${label}: "${id}"`);
  }
  return new ObjectId(id);
}

export function startAuditWorker(): Worker<CreateAuditDto> {
  if (worker) return worker;

  worker = new Worker<CreateAuditDto>(AUDIT_QUEUE_NAME, processJob, {
    connection: getWorkerConnection(),
    concurrency: 5,
  });

  worker.on('completed', (job) => {
    logger.debug(
      { jobId: job.id, action: job.data.action },
      'Audit event persisted',
    );
  });

  worker.on('failed', (job, err) => {
    // Log con contexto mínimo — NO incluir el diff (podría contener PII).
    logger.error(
      {
        err,
        jobId: job?.id,
        action: job?.data.action,
        actorId: job?.data.actor.id,
        attemptsMade: job?.attemptsMade,
      },
      'Audit worker job failed',
    );
  });

  logger.info('✅  Audit worker started');
  return worker;
}

export async function stopAuditWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (workerConnection) {
    await workerConnection.quit();
    workerConnection = null;
  }
}
