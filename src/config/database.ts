import type { Db } from 'mongodb';
import { MongoClient, ServerApiVersion } from 'mongodb';

import { env } from './env';
import { logger } from './logger';

let client: MongoClient;
let db: Db;

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

export async function connectDatabase(retries = MAX_RETRIES): Promise<void> {
  try {
    client = new MongoClient(env.MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      // Timeouts
      connectTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      // Connection pool
      maxPoolSize: 10,
      minPoolSize: 2,
    });

    await client.connect();

    // Ping para confirmar que la conexión es real
    await client.db('admin').command({ ping: 1 });

    // Extrae el nombre de la DB desde la URI
    // mongodb://localhost:27017/myapp  →  "myapp"
    const dbName = new URL(env.MONGODB_URI).pathname.slice(1);
    db = client.db(dbName);

    logger.info({ dbName }, '✅  MongoDB connected');

    // Monitorear eventos de conexión
    client.on('close', () => logger.warn('MongoDB connection closed'));
    client.on('error', (err) => logger.error({ err }, 'MongoDB client error'));
    client.on('timeout', () => logger.warn('MongoDB connection timeout'));

  } catch (err) {
    if (retries === 0) {
      logger.fatal({ err }, '❌  MongoDB connection failed after all retries');
      process.exit(1);
    }

    logger.warn(
      { retriesLeft: retries - 1 },
      `MongoDB not ready — retrying in ${RETRY_DELAY_MS}ms...`,
    );

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return connectDatabase(retries - 1);
  }
}

// Usado en repositories: getDb().collection('users')
export function getDb(): Db {
  if (!db) {
    throw new Error('Database not initialized — call connectDatabase() first');
  }
  return db;
}

// Usado en /health/ready
export function getMongoClient(): MongoClient {
  if (!client) {
    throw new Error('MongoDB client not initialized');
  }
  return client;
}

export async function disconnectDatabase(): Promise<void> {
  if (client) {
    await client.close();
    logger.info('MongoDB disconnected gracefully');
  }
}