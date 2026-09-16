import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Application } from 'express';
import {
  connectTestDB, clearTestDB, closeTestDB, testApp, createTenant, login, TenantFixture,
} from './helpers/fixture';
import { Student, Lead, Course, Video, Payment, Attendance, TestResult, DocumentFile, Batch } from '../models';

/**
 * Cross-tenant isolation.
 *
 * Every assertion here uses REAL documents that exist in MongoDB and belong to
 * tenant B, requested by an authenticated admin of tenant A. A leak would show
 * up as a 200 instead of 404 — nothing is mocked or stubbed.
 */
describe('Multi-tenant isolation: org A must never reach org B data', () => {
  let app: Application;
  let A: TenantFixture;
  let B: TenantFixture;
  let adminA: string[];
  let adminB: string[];

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();
    app = testApp();
    A = await createTenant('alpha');
    B = await createTenant('beta');
    adminA = await login(app, A.adminEmail, 'admin');
    adminB = await login(app, B.adminEmail, 'admin');
  });

  afterAll(async () => {
    await clearTestDB();
    await closeTestDB();
  });

  /* ------------------------------- Sanity check ------------------------------ */

  it('each admin can read their own tenant records (control case)', async () => {
    const a = await request(app).get(`/api/people/students/${A.studentId}`).set('Cookie', adminA);
    const b = await request(app).get(`/api/people/students/${B.studentId}`).set('Cookie', adminB);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  /* ------------------------------- READ leakage ------------------------------ */

  const readCases: Array<[string, (f: TenantFixture) => string]> = [
    ['student', (f) => `/api/people/students/${f.studentId}`],
    ['parent', (f) => `/api/people/parents/${f.parentId}`],
    ['teacher', (f) => `/api/people/teachers/${f.teacherId}`],
    ['lead', (f) => `/api/crm/leads/${f.leadId}`],
    ['course', (f) => `/api/academics/courses/${f.courseId}`],
    ['video', (f) => `/api/academics/videos/${f.videoId}`],
    ['batch', (f) => `/api/academics/batches/${f.batchId}`],
    ['class session', (f) => `/api/academics/classes/${f.classSessionId}`],
    ['exam', (f) => `/api/academics/exams/${f.examId}`],
    ['assignment', (f) => `/api/academics/assignments/${f.assignmentId}`],
    ['fee plan', (f) => `/api/finance/fee-plans/${f.feePlanId}`],
    ['payment', (f) => `/api/finance/payments/${f.paymentId}`],
    ['invoice', (f) => `/api/finance/invoices/${f.invoiceId}`],
    ['receipt', (f) => `/api/finance/receipts/${f.receiptId}`],
    ['attendance sheet', (f) => `/api/academics/attendance/sheet/${f.classSessionId}`],
    ['document download', (f) => `/api/comm/documents/${f.documentId}/download`],
  ];

  it.each(readCases)("admin A cannot GET org B's %s", async (_label, url) => {
    const res = await request(app).get(url(B)).set('Cookie', adminA);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  /* ------------------------------ WRITE leakage ------------------------------ */

  it("admin A cannot PATCH org B's student", async () => {
    const res = await request(app)
      .patch(`/api/people/students/${B.studentId}`)
      .set('Cookie', adminA)
      .send({ name: 'Hacked By A' });
    expect(res.status).toBe(404);
    const fresh = await Student.findById(B.studentId).lean();
    expect(fresh?.name).not.toBe('Hacked By A');
    expect(String(fresh?.organizationId)).toBe(String(B.orgId));
  });

  it("admin A cannot PATCH org B's lead", async () => {
    const res = await request(app)
      .patch(`/api/crm/leads/${B.leadId}`)
      .set('Cookie', adminA)
      .send({ name: 'Stolen Lead' });
    expect(res.status).toBe(404);
    const fresh = await Lead.findById(B.leadId).lean();
    expect(fresh?.name).not.toBe('Stolen Lead');
  });

  it("admin A cannot change org B's lead pipeline status", async () => {
    const res = await request(app)
      .patch(`/api/crm/leads/${B.leadId}/status`)
      .set('Cookie', adminA)
      .send({ status: 'LOST' });
    expect(res.status).toBe(404);
    const fresh = await Lead.findById(B.leadId).lean();
    expect(fresh?.status).toBe('NEW');
  });

  it("admin A cannot PATCH org B's course", async () => {
    const res = await request(app)
      .patch(`/api/academics/courses/${B.courseId}`)
      .set('Cookie', adminA)
      .send({ title: 'Hijacked Course' });
    expect(res.status).toBe(404);
    const fresh = await Course.findById(B.courseId).lean();
    expect(fresh?.title).not.toBe('Hijacked Course');
  });

  it("admin A cannot PATCH org B's video", async () => {
    const res = await request(app)
      .patch(`/api/academics/videos/${B.videoId}`)
      .set('Cookie', adminA)
      .send({ title: 'Hijacked Video' });
    expect(res.status).toBe(404);
    const fresh = await Video.findById(B.videoId).lean();
    expect(fresh?.title).not.toBe('Hijacked Video');
  });

  it("admin A cannot PATCH org B's batch", async () => {
    const res = await request(app)
      .patch(`/api/academics/batches/${B.batchId}`)
      .set('Cookie', adminA)
      .send({ capacity: 999 });
    expect(res.status).toBe(404);
    const fresh = await Batch.findById(B.batchId).lean();
    expect(fresh?.capacity).toBe(30);
  });

  it("admin A cannot enroll their own student into org B's batch", async () => {
    const res = await request(app)
      .post(`/api/academics/batches/${B.batchId}/enroll`)
      .set('Cookie', adminA)
      .send({ studentIds: [String(A.studentId)] });
    expect(res.status).toBe(404);
  });

  it("admin A cannot mark attendance on org B's class session", async () => {
    const res = await request(app)
      .post('/api/academics/attendance')
      .set('Cookie', adminA)
      .send({
        classSessionId: String(B.classSessionId),
        records: [{ studentId: String(B.studentId), status: 'ABSENT' }],
      });
    expect([403, 404, 422]).toContain(res.status);
    const fresh = await Attendance.findById(B.attendanceId).lean();
    expect(fresh?.status).toBe('PRESENT');
  });

  it("admin A cannot enter results against org B's exam", async () => {
    const res = await request(app)
      .post(`/api/academics/exams/${B.examId}/results`)
      .set('Cookie', adminA)
      .send({ results: [{ studentId: String(B.studentId), marksObtained: 5 }] });
    expect(res.status).toBe(404);
    const fresh = await TestResult.findById(B.resultId).lean();
    expect(fresh?.marksObtained).toBe(72);
  });

  it("admin A cannot record a payment against org B's fee plan", async () => {
    const before = await Payment.countDocuments({ organizationId: B.orgId });
    const res = await request(app)
      .post('/api/finance/payments')
      .set('Cookie', adminA)
      .send({
        studentId: String(B.studentId),
        feePlanId: String(B.feePlanId),
        amount: 500,
        method: 'CASH',
      });
    expect([404, 422]).toContain(res.status);
    const after = await Payment.countDocuments({ organizationId: B.orgId });
    expect(after).toBe(before);
  });

  it("admin A cannot refund org B's payment", async () => {
    const res = await request(app)
      .post(`/api/finance/payments/${B.paymentId}/refund`)
      .set('Cookie', adminA)
      .send({ reason: 'not mine' });
    expect(res.status).toBe(404);
    const fresh = await Payment.findById(B.paymentId).lean();
    expect(fresh?.status).toBe('SUCCESS');
  });

  /* ------------------------------ DELETE leakage ----------------------------- */

  const deleteCases: Array<[string, (f: TenantFixture) => string]> = [
    ['student', (f) => `/api/people/students/${f.studentId}`],
    ['lead', (f) => `/api/crm/leads/${f.leadId}`],
    ['course', (f) => `/api/academics/courses/${f.courseId}`],
    ['video', (f) => `/api/academics/videos/${f.videoId}`],
    ['batch', (f) => `/api/academics/batches/${f.batchId}`],
    ['exam', (f) => `/api/academics/exams/${f.examId}`],
    ['assignment', (f) => `/api/academics/assignments/${f.assignmentId}`],
    ['document', (f) => `/api/comm/documents/${f.documentId}`],
    ['fee plan', (f) => `/api/finance/fee-plans/${f.feePlanId}`],
    ['announcement', (f) => `/api/comm/announcements/${f.announcementId}`],
    ['follow-up', (f) => `/api/crm/follow-ups/${f.followUpId}`],
  ];

  it.each(deleteCases)("admin A cannot DELETE org B's %s", async (_label, url) => {
    const res = await request(app).delete(url(B)).set('Cookie', adminA);
    expect(res.status).toBe(404);
  });

  it("org B's records still exist after every attempted cross-tenant delete", async () => {
    expect(await Student.countDocuments({ _id: B.studentId })).toBe(1);
    expect(await Lead.countDocuments({ _id: B.leadId })).toBe(1);
    expect(await Course.countDocuments({ _id: B.courseId })).toBe(1);
    expect(await Video.countDocuments({ _id: B.videoId })).toBe(1);
    expect(await DocumentFile.countDocuments({ _id: B.documentId })).toBe(1);
  });

  /* ----------------------------- List-level leakage --------------------------- */

  const listCases: Array<[string, string, (f: TenantFixture) => string]> = [
    ['students', '/api/people/students?limit=100', (f) => String(f.studentId)],
    ['leads', '/api/crm/leads?limit=100', (f) => String(f.leadId)],
    ['courses', '/api/academics/courses?limit=100', (f) => String(f.courseId)],
    ['batches', '/api/academics/batches?limit=100', (f) => String(f.batchId)],
    ['videos', '/api/academics/videos?limit=100', (f) => String(f.videoId)],
    ['payments', '/api/finance/payments?limit=100', (f) => String(f.paymentId)],
    ['results', '/api/academics/results?limit=100', (f) => String(f.resultId)],
    ['teachers', '/api/people/teachers?limit=100', (f) => String(f.teacherId)],
    ['announcements', '/api/comm/announcements?limit=100', (f) => String(f.announcementId)],
  ];

  it.each(listCases)('%s list for admin A contains no org B ids', async (_label, url, idOf) => {
    const res = await request(app).get(url).set('Cookie', adminA);
    expect(res.status).toBe(200);
    const items = res.body.data.items as Array<{ _id: string; organizationId?: string }>;
    const ids = items.map((i) => String(i._id));
    expect(ids).not.toContain(idOf(B));
    items.forEach((i) => {
      if (i.organizationId) expect(String(i.organizationId)).toBe(String(A.orgId));
    });
  });

  it('global search never returns another tenant results', async () => {
    const res = await request(app).get('/api/comm/search?q=beta').set('Cookie', adminA);
    expect(res.status).toBe(200);
    const results = res.body.data.results ?? res.body.data.items ?? [];
    // Org B's fixtures are all named "... beta"; none may surface for admin A.
    const ids = JSON.stringify(results);
    expect(ids).not.toContain(String(B.studentId));
    expect(ids).not.toContain(String(B.leadId));
    expect(ids).not.toContain(String(B.courseId));
  });

  /* --------------------- organizationId spoofing from client ------------------ */

  it('a client-supplied organizationId in the body is ignored on create', async () => {
    const res = await request(app)
      .post('/api/crm/leads')
      .set('Cookie', adminA)
      .send({
        name: 'Spoof Attempt',
        phone: '9418000099',
        source: 'WALK_IN',
        organizationId: String(B.orgId),
      });
    expect([200, 201]).toContain(res.status);
    const created = await Lead.findOne({ name: 'Spoof Attempt' }).lean();
    expect(created).toBeTruthy();
    expect(String(created?.organizationId)).toBe(String(A.orgId));
    expect(String(created?.organizationId)).not.toBe(String(B.orgId));
  });

  it('a client-supplied organizationId in the query string is ignored on list', async () => {
    const res = await request(app)
      .get(`/api/people/students?limit=100&organizationId=${B.orgId}`)
      .set('Cookie', adminA);
    expect(res.status).toBe(200);
    const items = res.body.data.items as Array<{ organizationId: string }>;
    expect(items.length).toBeGreaterThan(0);
    items.forEach((i) => expect(String(i.organizationId)).toBe(String(A.orgId)));
  });

  it('reports aggregate only over the caller tenant', async () => {
    const a = await request(app).get('/api/reports/revenue').set('Cookie', adminA);
    const b = await request(app).get('/api/reports/revenue').set('Cookie', adminB);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // Each tenant has exactly one 10,000 payment, so totals must not be summed across tenants.
    expect(a.body.data.totals.collected).toBe(10000);
    expect(b.body.data.totals.collected).toBe(10000);
    expect(a.body.data.totals.payments).toBe(1);
    expect(b.body.data.totals.payments).toBe(1);
    // Course breakdowns must not name the other tenant's course either.
    const coursesA = JSON.stringify(a.body.data.byCourse);
    expect(coursesA).toContain('Course alpha');
    expect(coursesA).not.toContain('Course beta');
  });

  it('CSV export contains only caller tenant rows', async () => {
    const res = await request(app).get('/api/reports/export/students').set('Cookie', adminA);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Student alpha');
    expect(res.text).not.toContain('Student beta');
  });
});
