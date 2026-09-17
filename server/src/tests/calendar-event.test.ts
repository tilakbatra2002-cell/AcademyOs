import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Application } from 'express';
import {
  connectTestDB, clearTestDB, closeTestDB, testApp, createTenant, login, TenantFixture,
} from './helpers/fixture';

/**
 * Calendar event creation and editing.
 *
 * Regression cover for the "Please correct the highlighted fields" bug, where
 * the New Event form could never be submitted successfully:
 *
 *  - the form sent `startAt` as `YYYY-MM-DD` but the schema demanded a full
 *    ISO-8601 datetime, so every submission failed on `startAt`;
 *  - `endAt` was required by the schema although the form treated it as
 *    optional and omitted it, so every submission also failed on `endAt`.
 *
 * These tests pin the agreed contract: date-only OR ISO input is accepted,
 * `endAt` is genuinely optional, and every rejection names the offending field
 * with a human-readable reason rather than a bare generic message.
 */
describe('Calendar events: validation contract', () => {
  let app: Application;
  let A: TenantFixture;
  let adminA: string[];

  const url = '/api/comm/calendar/events';

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();
    app = testApp();
    A = await createTenant('cal');
    adminA = await login(app, A.adminEmail, 'admin');
  });

  afterAll(async () => {
    await clearTestDB();
    await closeTestDB();
  });

  /* ------------------------------ Happy paths ------------------------------ */

  it('accepts a date-only startAt (what <input type="date"> produces)', async () => {
    const res = await request(app).post(url).set('Cookie', adminA)
      .send({ title: 'Parent-teacher meeting', type: 'EVENT', startAt: '2026-10-01', allDay: true });
    expect(res.status).toBe(201);
    expect(res.body.data.startAt).toBe('2026-10-01T00:00:00.000Z');
  });

  it('accepts a full ISO timestamp', async () => {
    const res = await request(app).post(url).set('Cookie', adminA)
      .send({ title: 'ISO event', type: 'EVENT', startAt: '2026-10-02T09:30:00.000Z' });
    expect(res.status).toBe(201);
  });

  it('treats endAt as optional and derives it from the start', async () => {
    const res = await request(app).post(url).set('Cookie', adminA)
      .send({ title: 'Single day', type: 'EVENT', startAt: '2026-10-03', allDay: true });
    expect(res.status).toBe(201);
    // An all-day event runs to the end of its own day.
    expect(res.body.data.endAt).toBe('2026-10-03T23:59:59.999Z');
  });

  it('accepts an explicit multi-day range', async () => {
    const res = await request(app).post(url).set('Cookie', adminA)
      .send({ title: 'Sports week', type: 'EVENT', startAt: '2026-10-05', endAt: '2026-10-09', allDay: true });
    expect(res.status).toBe(201);
  });

  it('does not treat empty optional strings as invalid', async () => {
    const res = await request(app).post(url).set('Cookie', adminA)
      .send({ title: 'Empty optionals', type: 'EVENT', startAt: '2026-10-06', description: '', location: '' });
    expect(res.status).toBe(201);
  });

  /* --------------------------- Field-level errors -------------------------- */

  it('names the missing field instead of only a generic message', async () => {
    const res = await request(app).post(url).set('Cookie', adminA).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields.title).toBe('Title is required');
    expect(res.body.error.fields.startAt).toBe('Start date is required');
  });

  it('reports a too-short title on the title field', async () => {
    const res = await request(app).post(url).set('Cookie', adminA)
      .send({ title: 'X', type: 'EVENT', startAt: '2026-10-01' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.title).toMatch(/at least 2 characters/i);
  });

  it('reports an over-long title on the title field', async () => {
    const res = await request(app).post(url).set('Cookie', adminA)
      .send({ title: 'A'.repeat(161), type: 'EVENT', startAt: '2026-10-01' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.title).toMatch(/160 characters or fewer/i);
  });

  it('reports an over-long description on the description field', async () => {
    const res = await request(app).post(url).set('Cookie', adminA)
      .send({ title: 'Long desc', type: 'EVENT', startAt: '2026-10-01', description: 'B'.repeat(2001) });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.description).toMatch(/2000 characters or fewer/i);
  });

  it('reports an unparseable date on the date field', async () => {
    const res = await request(app).post(url).set('Cookie', adminA)
      .send({ title: 'Bad date', type: 'EVENT', startAt: 'not-a-date' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.startAt).toMatch(/valid date/i);
  });

  it('reports an inverted range on endAt, not startAt', async () => {
    const res = await request(app).post(url).set('Cookie', adminA)
      .send({ title: 'Backwards', type: 'EVENT', startAt: '2026-10-10', endAt: '2026-10-01' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.endAt).toMatch(/on or after the start date/i);
    expect(res.body.error.fields.startAt).toBeUndefined();
  });

  it('rejects an unknown event type with a readable reason', async () => {
    const res = await request(app).post(url).set('Cookie', adminA)
      .send({ title: 'Bad type', type: 'PARTY', startAt: '2026-10-01' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.type).toMatch(/valid event type/i);
  });

  it('always returns a fields map alongside the generic message', async () => {
    const res = await request(app).post(url).set('Cookie', adminA).send({ type: 'EVENT' });
    expect(res.body.error.message).toBe('Please correct the highlighted fields');
    // The generic message is only acceptable because the fields map is populated.
    expect(Object.keys(res.body.error.fields).length).toBeGreaterThan(0);
  });

  /* ---------------------------------- Edit --------------------------------- */

  describe('editing an existing event', () => {
    let id: string;

    beforeAll(async () => {
      const res = await request(app).post(url).set('Cookie', adminA)
        .send({ title: 'Editable', type: 'EVENT', startAt: '2026-11-01', allDay: true });
      id = res.body.data._id;
    });

    it('updates the title', async () => {
      const res = await request(app).patch(`${url}/${id}`).set('Cookie', adminA).send({ title: 'Renamed' });
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Renamed');
    });

    it('moves the start and drags the derived end with it', async () => {
      const res = await request(app).patch(`${url}/${id}`).set('Cookie', adminA).send({ startAt: '2026-11-05' });
      expect(res.status).toBe(200);
      expect(res.body.data.startAt).toBe('2026-11-05T00:00:00.000Z');
      // The original one-day duration is preserved rather than rejected.
      expect(new Date(res.body.data.endAt).getTime())
        .toBeGreaterThanOrEqual(new Date(res.body.data.startAt).getTime());
    });

    it('rejects an endAt that precedes the stored startAt', async () => {
      const res = await request(app).patch(`${url}/${id}`).set('Cookie', adminA).send({ endAt: '2026-01-01' });
      expect(res.status).toBe(422);
      expect(res.body.error.fields.endAt).toMatch(/on or after the start date/i);
    });

    it('still validates field rules on update', async () => {
      const res = await request(app).patch(`${url}/${id}`).set('Cookie', adminA).send({ title: 'X' });
      expect(res.status).toBe(422);
      expect(res.body.error.fields.title).toMatch(/at least 2 characters/i);
    });
  });

  /* ------------------------------ Multi-tenancy ----------------------------- */

  describe('tenant isolation and RBAC are unchanged', () => {
    let B: TenantFixture;
    let adminB: string[];
    let eventA: string;

    beforeAll(async () => {
      B = await createTenant('cal2');
      adminB = await login(app, B.adminEmail, 'admin');
      const res = await request(app).post(url).set('Cookie', adminA)
        .send({ title: 'Org A only', type: 'MEETING', startAt: '2026-12-20', allDay: true });
      eventA = res.body.data._id;
    });

    it('ignores a client-supplied organizationId', async () => {
      const res = await request(app).post(url).set('Cookie', adminA)
        .send({ title: 'Spoof', type: 'EVENT', startAt: '2026-12-22', organizationId: String(B.orgId) });
      expect(res.status).toBe(201);
      expect(String(res.body.data.organizationId)).toBe(String(A.orgId));
    });

    it('hides the event from another tenant', async () => {
      const res = await request(app)
        .get('/api/comm/calendar?from=2026-12-01&to=2026-12-31')
        .set('Cookie', adminB);
      expect(res.status).toBe(200);
      expect(res.body.data.items.some((e: { id: string }) => e.id === eventA)).toBe(false);
    });

    it('shows the event to its owning tenant', async () => {
      const res = await request(app)
        .get('/api/comm/calendar?from=2026-12-01&to=2026-12-31')
        .set('Cookie', adminA);
      expect(res.body.data.items.some((e: { id: string }) => e.id === eventA)).toBe(true);
    });

    it('404s cross-tenant update and delete', async () => {
      const patch = await request(app).patch(`${url}/${eventA}`).set('Cookie', adminB).send({ title: 'Hijacked' });
      expect(patch.status).toBe(404);
      const del = await request(app).delete(`${url}/${eventA}`).set('Cookie', adminB);
      expect(del.status).toBe(404);
    });

    it('forbids a student from creating events', async () => {
      const student = await login(app, A.studentEmail, 'student');
      const res = await request(app).post(url).set('Cookie', student)
        .send({ title: 'Student event', type: 'EVENT', startAt: '2026-12-01' });
      expect(res.status).toBe(403);
    });
  });
});
