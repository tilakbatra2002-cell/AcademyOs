/**
 * Vercel Cron entrypoint for the AcademyOS scheduled jobs.
 *
 * A serverless function is frozen between requests, so the in-process
 * setInterval scheduler in server/src/jobs (used when the API runs as a
 * long-lived process) can never fire on Vercel. Instead Vercel Cron calls this
 * endpoint on the schedule declared in vercel.json, and we run exactly the
 * same job functions once per invocation.
 *
 * Security: Vercel signs cron invocations with the CRON_SECRET environment
 * variable, sent as `Authorization: Bearer <CRON_SECRET>`. We reject anything
 * else so the endpoint cannot be triggered by the public internet. If
 * CRON_SECRET is not configured the endpoint refuses to run at all rather than
 * defaulting to open.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { connectDB } from '../server/src/config/db';
import { runScheduledJobs } from '../server/src/jobs';
import { logger } from '../server/src/utils/logger';

let connectionPromise: Promise<unknown> | null = null;

function getConnection(): Promise<unknown> {
  if (!connectionPromise) {
    connectionPromise = connectDB().catch((err) => {
      connectionPromise = null;
      throw err;
    });
  }
  return connectionPromise;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    logger.error('Cron invoked but CRON_SECRET is not configured — refusing to run');
    return send(res, 503, {
      success: false,
      error: { code: 'CRON_NOT_CONFIGURED', message: 'Scheduled jobs are not configured.', fields: {} },
    });
  }

  if (req.headers.authorization !== `Bearer ${secret}`) {
    return send(res, 401, {
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Invalid cron credentials.', fields: {} },
    });
  }

  try {
    await getConnection();
    const started = Date.now();
    const results = await runScheduledJobs();
    const failed = results.filter((r) => !r.ok);
    logger.info(`Cron run finished in ${Date.now() - started}ms (${failed.length} failed)`);
    return send(res, failed.length ? 500 : 200, {
      success: failed.length === 0,
      data: { durationMs: Date.now() - started, results },
    });
  } catch (err) {
    logger.error('Cron run failed', err);
    return send(res, 500, {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Scheduled job run failed.', fields: {} },
    });
  }
}
