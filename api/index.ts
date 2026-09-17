/**
 * Vercel serverless entrypoint for the AcademyOS Express API.
 *
 * Vercel discovers this file, bundles it with @vercel/node and serves it for
 * every /api/* request (see the rewrite in the root vercel.json). The whole
 * existing Express application is reused as-is — nothing is re-implemented.
 *
 * Three things make this safe in a serverless runtime:
 *
 *  1. `createApp()` only builds the app; `app.listen()` lives in
 *     server/src/index.ts and is never imported here. A Lambda must not bind
 *     a port — the platform owns the socket and hands us (req, res).
 *
 *  2. The Mongo connection promise is cached in module scope. Module scope
 *     survives between warm invocations on the same instance, so we connect
 *     once per container instead of once per request. `connectDB()` itself
 *     also short-circuits when mongoose.readyState === 1.
 *
 *  3. The in-process schedulers (overdueJob, trialExpiryJob, reminderJob,
 *     closeStaleClassesJob) are started by `startJobs()`, which is only called
 *     from server/src/index.ts. They are deliberately NOT started here: a
 *     serverless function is frozen between requests, so setInterval timers
 *     would never fire reliably and would leak work across invocations.
 *     Those jobs are driven by Vercel Cron instead — see api/cron.ts.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server/src/app';
import { connectDB } from '../server/src/config/db';
import { logger } from '../server/src/utils/logger';

// Built once per container, reused by every warm invocation.
const app = createApp();

/**
 * Cached connection promise. We keep the *promise* rather than a boolean so
 * that concurrent cold-start requests all await the same in-flight connect
 * instead of each opening their own.
 */
let connectionPromise: Promise<unknown> | null = null;

function getConnection(): Promise<unknown> {
  if (!connectionPromise) {
    connectionPromise = connectDB().catch((err) => {
      // Reset on failure so the next invocation can retry rather than being
      // stuck awaiting a permanently rejected promise.
      connectionPromise = null;
      throw err;
    });
  }
  return connectionPromise;
}

/**
 * Guarantee Express sees the `/api/...` path its routers are mounted on.
 *
 * Every AcademyOS router is mounted under `/api` (see server/src/app.ts), and
 * the client calls same-origin `/api/...` URLs. Vercel's documented behaviour
 * is that a rewrite does NOT change the path the runtime observes (only an
 * explicit `request.path` transform does), so `req.url` should already be the
 * original `/api/health`. We do not want the whole API to 404 if that ever
 * differs, so we normalise defensively instead of relying on the assumption:
 *
 *   - `/api/health`      -> unchanged (the expected case)
 *   - `/health`          -> `/api/health`   (prefix was stripped)
 *   - `/api/index`       -> `/api`          (destination leaked through)
 *   - `/api/index/x`     -> `/api/x`
 *
 * The query string is preserved in all cases.
 */
export function normalizeApiPath(url: string | undefined): string {
  const raw = url && url.length > 0 ? url : '/';
  const qIndex = raw.indexOf('?');
  let path = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const query = qIndex === -1 ? '' : raw.slice(qIndex);

  // Strip a leaked `/api/index` destination back to a plain `/api` prefix.
  if (path === '/api/index') {
    path = '/api';
  } else if (path.startsWith('/api/index/')) {
    path = `/api/${path.slice('/api/index/'.length)}`;
  }

  // Re-add the mount prefix if the platform stripped it.
  if (path !== '/api' && !path.startsWith('/api/')) {
    path = `/api${path.startsWith('/') ? '' : '/'}${path}`;
  }

  return `${path}${query}`;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  req.url = normalizeApiPath(req.url);

  try {
    await getConnection();
  } catch (err) {
    logger.error('Database connection failed during cold start', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'The service is temporarily unavailable. Please try again.',
          fields: {},
        },
      }),
    );
    return;
  }

  // Express is itself a (req, res) handler — hand the request straight over.
  return (app as unknown as (q: IncomingMessage, s: ServerResponse) => void)(req, res);
}
