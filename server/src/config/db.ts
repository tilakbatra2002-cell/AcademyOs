import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

let transactionsSupported: boolean | null = null;

export async function connectDB(uri = env.MONGO_URI): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  if (mongoose.connection.readyState === 1) return mongoose;
  await mongoose.connect(uri, {
    // Small pool on serverless (many instances x large pool exhausts Atlas),
    // larger pool on an always-on host. See env.MONGO_MAX_POOL_SIZE.
    maxPoolSize: env.MONGO_MAX_POOL_SIZE,
    serverSelectionTimeoutMS: 10000,
  });
  logger.info(`MongoDB connected: ${mongoose.connection.name}`);
  return mongoose;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

/** Detects replica-set/transaction support once per process. */
export async function supportsTransactions(): Promise<boolean> {
  if (transactionsSupported !== null) return transactionsSupported;
  try {
    const admin = mongoose.connection.db!.admin();
    const info = await admin.command({ hello: 1 });
    transactionsSupported = Boolean(info.setName || info.msg === 'isdbgrid');
  } catch {
    transactionsSupported = false;
  }
  logger.info(`MongoDB transactions supported: ${transactionsSupported}`);
  return transactionsSupported;
}

/**
 * Runs `fn` inside a MongoDB transaction when the deployment supports it,
 * otherwise executes it without a session (dev standalone fallback).
 */
export async function withTransaction<T>(
  fn: (session: mongoose.ClientSession | undefined) => Promise<T>,
): Promise<T> {
  const ok = await supportsTransactions();
  if (!ok) return fn(undefined);

  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
