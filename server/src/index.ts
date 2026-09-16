import { createApp } from './app';
import { connectDB, supportsTransactions } from './config/db';
import { env } from './config/env';
import { logger } from './utils/logger';
import { startJobs } from './jobs';

async function bootstrap() {
  await connectDB();
  await supportsTransactions();

  const app = createApp();
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`AcademyOS API listening on http://0.0.0.0:${env.PORT} [${env.NODE_ENV}]`);
  });

  startJobs();

  const shutdown = (signal: string) => {
    logger.info(`${signal} received — shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
