import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Application } from 'express';
import {
  connectTestDB, clearTestDB, closeTestDB, testApp, createTenant, createOwner, login, TenantFixture, TEST_PASSWORD,
} from './helpers/fixture';
import { Attendance, TestResult, Student, Payment, Course, User, Organization } from '../models';

/**
 * Role escalation.
 *
 * Every request below is authenticated with a REAL session for the stated role
 * and targets a REAL record inside that same tenant, so a pass can only mean the
 * backend itself refused the action (frontend hiding is irrelevant here).
 */
describe('RBAC: privilege escalation is blocked by the backend', () => {
  let app: Application;
  let T: TenantFixture;
  let other: TenantFixture;
  let student: string[];
  let parent: string[];
  let teacher: string[];
  let counselor: string[];
  let accountant: string[];
  let admin: string[];
  let owner: string[];

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();
    app = testApp();
    await createOwner();
    T = await createTenant('gamma');
    other = await createTenant('delta');
    student = await login(app, T.studentEmail, 'student');
    parent = await login(app, T.parentEmail, 'parent');
    teacher = await login(app, T.teacherEmail, 'teacher');
    counselor = await login(app, T.counselorEmail, 'admin');
    accountant = await login(app, T.accountantEmail, 'admin');
    admin = await login(app, T.adminEmail, 'admin');
    owner = await login(app, 'owner@test.local', 'owner');
  });

  afterAll(async () => {
    await clearTestDB();
    await closeTestDB();
  });

  /* ------------------------------ Portal gating ------------------------------ */

  it('a student cannot log in through the admin portal', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: T.studentEmail, password: TEST_PASSWORD, portal: 'admin' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('a teacher cannot log in through the owner portal', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: T.teacherEmail, password: TEST_PASSWORD, portal: 'owner' });
    expect(res.status).toBe(401);
  });

  it('an org admin cannot log in through the owner portal', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: T.adminEmail, password: TEST_PASSWORD, portal: 'owner' });
    expect(res.status).toBe(401);
  });

  it('a wrong password never authenticates', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: T.adminEmail, password: 'WrongPassword@1', portal: 'admin' });
    expect(res.status).toBe(401);
  });

  it('unauthenticated requests to tenant APIs are rejected', async () => {
    const res = await request(app).get('/api/people/students');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  /* ------------------------------ Student limits ----------------------------- */

  it('a student cannot modify attendance', async () => {
    const res = await request(app)
      .post('/api/academics/attendance')
      .set('Cookie', student)
      .send({
        classSessionId: String(T.classSessionId),
        records: [{ studentId: String(T.studentId), status: 'PRESENT' }],
      });
    expect(res.status).toBe(403);
    const fresh = await Attendance.findById(T.attendanceId).lean();
    expect(fresh?.status).toBe('PRESENT');
  });

  it('a student cannot enter or alter exam results', async () => {
    const res = await request(app)
      .post(`/api/academics/exams/${T.examId}/results`)
      .set('Cookie', student)
      .send({ results: [{ studentId: String(T.studentId), marksObtained: 100 }] });
    expect(res.status).toBe(403);
    const fresh = await TestResult.findById(T.resultId).lean();
    expect(fresh?.marksObtained).toBe(72);
  });

  it('a student cannot delete a result', async () => {
    const res = await request(app).delete(`/api/academics/results/${T.resultId}`).set('Cookie', student);
    expect(res.status).toBe(403);
    expect(await TestResult.countDocuments({ _id: T.resultId })).toBe(1);
  });

  it('a student cannot list all students in the org', async () => {
    const res = await request(app).get('/api/people/students').set('Cookie', student);
    expect(res.status).toBe(403);
  });

  it('a student cannot create a student record', async () => {
    const res = await request(app)
      .post('/api/people/students')
      .set('Cookie', student)
      .send({ name: 'Ghost Student', phone: '9418000077', gender: 'MALE' });
    expect(res.status).toBe(403);
    expect(await Student.countDocuments({ name: 'Ghost Student' })).toBe(0);
  });

  it('a student cannot read finance data or record payments', async () => {
    const list = await request(app).get('/api/finance/payments').set('Cookie', student);
    expect(list.status).toBe(403);
    const create = await request(app)
      .post('/api/finance/payments')
      .set('Cookie', student)
      .send({ studentId: String(T.studentId), feePlanId: String(T.feePlanId), amount: 1, method: 'CASH' });
    expect(create.status).toBe(403);
  });

  /*
   * Regression: STUDENT/PARENT previously held 'payment:read', which let them
   * list every payment, invoice, receipt and fee plan in the organisation.
   * Own-fee access now flows exclusively through /api/portal/me/*.
   */
  it('a student cannot list org-wide invoices, receipts or fee plans', async () => {
    for (const url of ['/api/finance/invoices', '/api/finance/receipts', '/api/finance/fee-plans', '/api/finance/installments', '/api/finance/summary']) {
      const res = await request(app).get(url).set('Cookie', student);
      expect(res.status, `${url} must be forbidden for a student`).toBe(403);
    }
  });

  it('a parent cannot list org-wide payments or fee plans', async () => {
    for (const url of ['/api/finance/payments', '/api/finance/invoices', '/api/finance/receipts', '/api/finance/fee-plans', '/api/finance/summary']) {
      const res = await request(app).get(url).set('Cookie', parent);
      expect(res.status, `${url} must be forbidden for a parent`).toBe(403);
    }
  });

  it('a student CAN still read their own fees through the portal (control case)', async () => {
    const res = await request(app).get('/api/portal/me/fees').set('Cookie', student);
    expect(res.status).toBe(200);
  });

  /*
   * Regression: PARENT previously held 'student:read', which unlocked the
   * org-wide roster (GET /api/people/students) and every classmate's name,
   * e-mail and phone number. A guardian must only ever reach their own
   * children, via /api/portal/me/children*.
   */
  it('a parent cannot enumerate the organisation-wide student roster', async () => {
    for (const url of ['/api/people/students', '/api/people/students/stats']) {
      const res = await request(app).get(url).set('Cookie', parent);
      expect(res.status, `${url} must be forbidden for a parent`).toBe(403);
    }
  });

  it("a parent cannot open another student's full detail record", async () => {
    const res = await request(app)
      .get(`/api/people/students/${T.studentId}`)
      .set('Cookie', parent);
    expect(res.status).toBe(403);
  });

  it('a parent CAN still list their own children (control case)', async () => {
    const res = await request(app).get('/api/portal/me/children').set('Cookie', parent);
    expect(res.status).toBe(200);
  });

  it("a parent CAN still read their child's fees through the portal (control case)", async () => {
    const res = await request(app)
      .get(`/api/portal/me/children/${T.studentId}/fees`)
      .set('Cookie', parent);
    expect(res.status).toBe(200);
  });

  it("a student cannot start an online payment for someone else's fee plan", async () => {
    const res = await request(app)
      .post('/api/finance/online/order')
      .set('Cookie', student)
      .send({ feePlanId: String(other.feePlanId), amount: 100 });
    // Foreign tenant plan => 404; own tenant but other student => 403.
    expect([403, 404]).toContain(res.status);
  });

  it('a student cannot create or edit courses', async () => {
    const res = await request(app)
      .patch(`/api/academics/courses/${T.courseId}`)
      .set('Cookie', student)
      .send({ title: 'Student Renamed This' });
    expect(res.status).toBe(403);
    const fresh = await Course.findById(T.courseId).lean();
    expect(fresh?.title).not.toBe('Student Renamed This');
  });

  it('a student cannot read the CRM pipeline', async () => {
    const res = await request(app).get('/api/crm/leads').set('Cookie', student);
    expect(res.status).toBe(403);
  });

  it('a student cannot reach owner APIs', async () => {
    const res = await request(app).get('/api/owner/organizations').set('Cookie', student);
    expect(res.status).toBe(403);
  });

  it("a student cannot read another student's portal data", async () => {
    // /portal/me/* is always resolved from the session, never from a supplied id.
    const res = await request(app).get('/api/portal/me/results').set('Cookie', student);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body.data);
    expect(body).not.toContain(String(other.studentId));
  });

  /* ------------------------------ Teacher limits ----------------------------- */

  it('a teacher cannot access finance endpoints', async () => {
    const summary = await request(app).get('/api/finance/summary').set('Cookie', teacher);
    expect(summary.status).toBe(403);
    const payments = await request(app).get('/api/finance/payments').set('Cookie', teacher);
    expect(payments.status).toBe(403);
  });

  it('a teacher cannot record a payment', async () => {
    const before = await Payment.countDocuments({ organizationId: T.orgId });
    const res = await request(app)
      .post('/api/finance/payments')
      .set('Cookie', teacher)
      .send({ studentId: String(T.studentId), feePlanId: String(T.feePlanId), amount: 5000, method: 'CASH' });
    expect(res.status).toBe(403);
    expect(await Payment.countDocuments({ organizationId: T.orgId })).toBe(before);
  });

  it('a teacher cannot refund a payment', async () => {
    const res = await request(app)
      .post(`/api/finance/payments/${T.paymentId}/refund`)
      .set('Cookie', teacher)
      .send({ reason: 'test' });
    expect(res.status).toBe(403);
    const fresh = await Payment.findById(T.paymentId).lean();
    expect(fresh?.status).toBe('SUCCESS');
  });

  it('a teacher cannot create users or staff accounts', async () => {
    const res = await request(app)
      .post('/api/people/users')
      .set('Cookie', teacher)
      .send({ name: 'Rogue Admin', email: 'rogue@gamma.test', role: 'ORGANIZATION_ADMIN' });
    expect(res.status).toBe(403);
    expect(await User.countDocuments({ email: 'rogue@gamma.test' })).toBe(0);
  });

  it('a teacher cannot delete a student', async () => {
    const res = await request(app).delete(`/api/people/students/${T.studentId}`).set('Cookie', teacher);
    expect(res.status).toBe(403);
    expect(await Student.countDocuments({ _id: T.studentId })).toBe(1);
  });

  it('a teacher cannot reach owner APIs', async () => {
    const res = await request(app).get('/api/owner/dashboard').set('Cookie', teacher);
    expect(res.status).toBe(403);
  });

  /* ------------------------------- Parent limits ----------------------------- */

  it('a parent cannot modify student records', async () => {
    const res = await request(app)
      .patch(`/api/people/students/${T.studentId}`)
      .set('Cookie', parent)
      .send({ name: 'Parent Renamed' });
    expect(res.status).toBe(403);
    const fresh = await Student.findById(T.studentId).lean();
    expect(fresh?.name).not.toBe('Parent Renamed');
  });

  it('a parent cannot mark attendance or enter results', async () => {
    const att = await request(app)
      .post('/api/academics/attendance')
      .set('Cookie', parent)
      .send({ classSessionId: String(T.classSessionId), records: [{ studentId: String(T.studentId), status: 'ABSENT' }] });
    expect(att.status).toBe(403);
    const res = await request(app)
      .post(`/api/academics/exams/${T.examId}/results`)
      .set('Cookie', parent)
      .send({ results: [{ studentId: String(T.studentId), marksObtained: 99 }] });
    expect(res.status).toBe(403);
  });

  it("a parent cannot read a child that is not linked to them", async () => {
    const res = await request(app)
      .get(`/api/portal/me/children/${other.studentId}/results`)
      .set('Cookie', parent);
    expect([403, 404]).toContain(res.status);
  });

  it('a parent can read their own linked child (control case)', async () => {
    const res = await request(app)
      .get(`/api/portal/me/children/${T.studentId}/results`)
      .set('Cookie', parent);
    expect(res.status).toBe(200);
  });

  /* ----------------------------- Counselor limits ---------------------------- */

  it('a counselor cannot access finance payments', async () => {
    const res = await request(app).get('/api/finance/payments').set('Cookie', counselor);
    expect(res.status).toBe(403);
  });

  it('a counselor cannot mark attendance', async () => {
    const res = await request(app)
      .post('/api/academics/attendance')
      .set('Cookie', counselor)
      .send({ classSessionId: String(T.classSessionId), records: [{ studentId: String(T.studentId), status: 'ABSENT' }] });
    expect(res.status).toBe(403);
  });

  /* ---------------------------- Accountant limits ---------------------------- */

  it('an accountant cannot create courses', async () => {
    const res = await request(app)
      .post('/api/academics/courses')
      .set('Cookie', accountant)
      .send({ title: 'Accountant Course', category: 'Test', price: 1000 });
    expect(res.status).toBe(403);
  });

  it('an accountant cannot enter exam results', async () => {
    const res = await request(app)
      .post(`/api/academics/exams/${T.examId}/results`)
      .set('Cookie', accountant)
      .send({ results: [{ studentId: String(T.studentId), marksObtained: 10 }] });
    expect(res.status).toBe(403);
  });

  it('an accountant can read finance data (control case)', async () => {
    const res = await request(app).get('/api/finance/summary').set('Cookie', accountant);
    expect(res.status).toBe(200);
  });

  /* ------------------------------- Admin limits ------------------------------ */

  it('an org admin cannot reach any owner API', async () => {
    for (const url of [
      '/api/owner/dashboard',
      '/api/owner/organizations',
      '/api/owner/subscriptions',
      '/api/owner/users',
      '/api/owner/audit-logs',
      '/api/owner/reports',
    ]) {
      const res = await request(app).get(url).set('Cookie', admin);
      expect(res.status, `${url} should be forbidden for org admin`).toBe(403);
    }
  });

  it('an org admin cannot create an organization', async () => {
    const before = await Organization.countDocuments();
    const res = await request(app)
      .post('/api/owner/organizations')
      .set('Cookie', admin)
      .send({ name: 'Rogue Academy', slug: 'rogue', code: 'ROGUE', email: 'a@b.test', adminName: 'X', adminEmail: 'x@b.test' });
    expect(res.status).toBe(403);
    expect(await Organization.countDocuments()).toBe(before);
  });

  it('an org admin cannot create a SAAS_OWNER user', async () => {
    const res = await request(app)
      .post('/api/people/users')
      .set('Cookie', admin)
      .send({ name: 'Escalated', email: 'escalated@gamma.test', role: 'SAAS_OWNER' });
    expect([400, 403, 422]).toContain(res.status);
    const created = await User.findOne({ email: 'escalated@gamma.test' }).lean();
    expect(created?.role).not.toBe('SAAS_OWNER');
  });

  it('a user cannot escalate their own role via the profile endpoint', async () => {
    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Cookie', student)
      .send({ name: 'Renamed Student', role: 'ORGANIZATION_ADMIN' });
    expect([200, 400, 422]).toContain(res.status);
    const fresh = await User.findById(T.studentUserId).lean();
    expect(fresh?.role).toBe('STUDENT');
  });

  it('the owner CAN reach owner APIs (control case)', async () => {
    const res = await request(app).get('/api/owner/organizations').set('Cookie', owner);
    expect(res.status).toBe(200);
  });

  /* ------------------------------ Token integrity ---------------------------- */

  it('a tampered auth cookie is rejected', async () => {
    const res = await request(app)
      .get('/api/people/students')
      .set('Cookie', ['aos_at=not.a.real.token']);
    expect(res.status).toBe(401);
  });

  it('a deactivated user loses access immediately', async () => {
    const session = await login(app, T.counselorEmail, 'admin');
    const before = await request(app).get('/api/crm/leads').set('Cookie', session);
    expect(before.status).toBe(200);

    await User.updateOne({ email: T.counselorEmail }, { isActive: false });
    const after = await request(app).get('/api/crm/leads').set('Cookie', session);
    // 401 (session invalid) or 403 (account disabled) - either way access is revoked.
    expect([401, 403]).toContain(after.status);

    await User.updateOne({ email: T.counselorEmail }, { isActive: true });
  });
});
