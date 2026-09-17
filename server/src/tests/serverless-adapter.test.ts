import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Application } from 'express';
import {
  connectTestDB, clearTestDB, closeTestDB, testApp, createTenant, login, TenantFixture,
} from './helpers/fixture';
import { normalizeApiPath } from '../../../api/index';
import { runScheduledJobs } from '../jobs';

/**
 * Serverless adapter behaviour.
 *
 * AcademyOS is deployed as a single Vercel project: the Vite SPA plus this
 * Express app running as one Vercel Function behind `api/index.ts`. These
 * tests lock down the parts that are specific to that deployment shape, so a
 * future refactor cannot silently break production routing:
 *
 *  1. `normalizeApiPath` keeps Express's `/api/...` mount point intact no
 *     matter which path shape the platform hands the function.
 *  2. The app itself never binds a port and never starts the interval-based
 *     schedulers — those are the two things that make a serverless deploy fail.
 *  3. `runScheduledJobs()` (driven by Vercel Cron) runs every job and isolates
 *     individual failures instead of aborting the whole run.
 */
describe('Serverless adapter: request path normalization', () => {
  it('leaves a normal /api path untouched', () => {
    expect(normalizeApiPath('/api/health')).toBe('/api/health');
    expect(normalizeApiPath('/api/auth/login')).toBe('/api/auth/login');
  });

  it('preserves the query string', () => {
    expect(normalizeApiPath('/api/people/students?limit=2&page=1'))
      .toBe('/api/people/students?limit=2&page=1');
  });

  it('re-adds the /api prefix when the platform strips it', () => {
    expect(normalizeApiPath('/health')).toBe('/api/health');
    expect(normalizeApiPath('/auth/me')).toBe('/api/auth/me');
    expect(normalizeApiPath('/people/students?limit=5')).toBe('/api/people/students?limit=5');
  });

  it('collapses a leaked /api/index rewrite destination back to /api', () => {
    expect(normalizeApiPath('/api/index')).toBe('/api');
    expect(normalizeApiPath('/api/index/health')).toBe('/api/health');
    expect(normalizeApiPath('/api/index/auth/me?x=1')).toBe('/api/auth/me?x=1');
  });

  it('handles empty and root urls without throwing', () => {
    expect(normalizeApiPath(undefined)).toBe('/api/');
    expect(normalizeApiPath('')).toBe('/api/');
    expect(normalizeApiPath('/')).toBe('/api/');
  });

  it('never produces a double /api prefix', () => {
    for (const url of ['/api/health', '/health', '/api/index/health', '/api', '/']) {
      expect(normalizeApiPath(url)).not.toContain('/api/api');
    }
  });
});

describe('Serverless adapter: the app is safe to run in a Function', () => {
  let app: Application;
  let A: TenantFixture;
  let adminA: string[];

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();
    app = testApp();
    A = await createTenant('alpha');
    adminA = await login(app, A.adminEmail, 'admin');
  });

  afterAll(async () => {
    await clearTestDB();
    await closeTestDB();
  });

  it('createApp() returns a (req, res) handler, which is what a Function needs', () => {
    // An Express app is itself a (req, res) function — exactly the shape
    // api/index.ts hands back to Vercel. No adapter library is required.
    expect(typeof app).toBe('function');
    expect(app.length).toBeGreaterThanOrEqual(2);
  });

  it('neither app.ts nor the serverless entrypoint ever calls listen()', async () => {
    // The real invariant: binding a port inside a Function breaks the deploy.
    // We assert on the source of the whole import graph reachable from
    // api/index.ts, because a runtime handle check would also catch the
    // ephemeral server supertest opens for each request.
    const { readFile } = await import('fs/promises');
    const { join } = await import('path');
    const root = join(__dirname, '../../..');

    // These files document the no-listen rule in prose, so comments must be
    // stripped before matching or the docs would fail their own test.
    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    const read = async (rel: string) => stripComments(await readFile(join(root, rel), 'utf8'));

    const appSrc = await read('server/src/app.ts');
    expect(appSrc).not.toMatch(/\.listen\s*\(/);

    const fnSrc = await read('api/index.ts');
    expect(fnSrc).not.toMatch(/\.listen\s*\(/);
    // ...and it must not boot the interval schedulers either.
    expect(fnSrc).not.toMatch(/startJobs\s*\(/);

    const cronSrc = await read('api/cron.ts');
    expect(cronSrc).not.toMatch(/\.listen\s*\(/);
    expect(cronSrc).not.toMatch(/startJobs\s*\(/);

    // listen() must still exist in the standalone server entrypoint, so local
    // development and any non-serverless host keep working.
    const indexSrc = await readFile(join(root, 'server/src/index.ts'), 'utf8');
    expect(indexSrc).toMatch(/\.listen\s*\(/);
  });

  it('serves /api/health without any port listener', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('still enforces auth + tenant scoping when invoked as a function', async () => {
    const anon = await request(app).get('/api/people/students');
    expect(anon.status).toBe(401);

    const authed = await request(app).get('/api/people/students?limit=5').set('Cookie', adminA);
    expect(authed.status).toBe(200);
    expect(authed.body.success).toBe(true);
  });

  it('returns the JSON error envelope (never HTML) for unknown /api routes', async () => {
    const res = await request(app).get('/api/no-such-endpoint').set('Cookie', adminA);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('sets httpOnly auth cookies through the function path', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: A.adminEmail, password: 'Password@123', portal: 'admin' });
    expect(res.status).toBe(200);
    const cookies = res.get('Set-Cookie') ?? [];
    expect(cookies.join(' ')).toMatch(/aos_at=/);
    expect(cookies.join(' ')).toMatch(/HttpOnly/i);
  });
});

describe('Serverless adapter: Vercel Cron job runner', () => {
  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();
    await createTenant('cron');
  });

  afterAll(async () => {
    await clearTestDB();
    await closeTestDB();
  });

  it('runs every scheduled job and reports per-job status', async () => {
    const results = await runScheduledJobs();
    const names = results.map((r) => r.job).sort();
    expect(names).toEqual(['closeStaleClasses', 'overdueFees', 'reminders', 'trialExpiry']);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('starts no interval timers (a Function is frozen between invocations)', async () => {
    const spy = vi.spyOn(global, 'setInterval');
    await runScheduledJobs();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
