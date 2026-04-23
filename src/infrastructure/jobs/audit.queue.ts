import { Queue } from 'bullmq';
import Redis from 'ioredis';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import type { CreateAuditDto } from '../../modules/audit/audit.types';

export const AUDIT_QUEUE_NAME = 'audit';

// BullMQ requiere connection con maxRetriesPerRequest: null para blocking ops.
// Por eso creamos una conexión ioredis dedicada (distinta a la global de cache).
let producerConnection: Redis | null = null;

function getProducerConnection(): Redis {
  if (!producerConnection) {
    producerConnection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    producerConnection.on('error', (err) => {
      logger.error({ err }, 'Audit queue Redis connection error');
    });
  }
  return producerConnection;
}

let queue: Queue<CreateAuditDto> | null = null;

export function getAuditQueue(): Queue<CreateAuditDto> {
  if (!queue) {
    queue = new Queue<CreateAuditDto>(AUDIT_QUEUE_NAME, {
      connection: getProducerConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        // Mantener jobs completados solo 100 para no inflar Redis
        removeOnComplete: 100,
        // Los fallidos quedan para inspección manual
        removeOnFail: false,
      },
    });
  }
  return queue;
}

export async function enqueueAuditEvent(dto: CreateAuditDto): Promise<void> {
  try {
    await getAuditQueue().add('write', dto);
  } catch (err) {
    // Si Redis cae, el evento se pierde silenciosamente — NO tumbar el flujo principal.
    // Se loggea para que ops lo vea en Pino.
    logger.error(
      { err, action: dto.action, actorId: dto.actor.id },
      'Failed to enqueue audit event — event lost',
    );
  }
}

export async function closeAuditQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (producerConnection) {
    await producerConnection.quit();
    producerConnection = null;
  }
}
