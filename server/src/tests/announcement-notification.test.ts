import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Application } from 'express';
import { Announcement, Notification } from '../models';
import {
  connectTestDB, clearTestDB, closeTestDB, testApp, createTenant, login, TenantFixture,
} from './helpers/fixture';

/**
 * Announcement notifications and the announcement detail endpoint.
 *
 * Regression cover for the "clicking an announcement notification opens a 404"
 * bug. The stored notification link is portal-less (`/announcements`) because a
 * single announcement is delivered to admins, teachers, students and parents at
 * once, and each portal mounts its pages under a different prefix — so no one
 * hardcoded prefix can be right for every recipient. The client resolves the
 * link against the signed-in portal and deep-links using `entityId`.
 *
 * These tests pin the half of that contract the backend owns:
 *  - every announcement notification carries the ids the client needs to build
 *    a working link (`entity` + `entityId`);
 *  - `GET /comm/announcements/:id` exists and returns the announcement;
 *  - it is scoped exactly like the list, so the deep link can never become a
 *    cross-tenant or unauthorised read.
 */
describe('Announcement notifications: link target resolves', () => {
  let app: Application;
  let A: TenantFixture;
  let B: TenantFixture;
  let adminA: string[];
  let studentA: string[];
  let teacherA: string[];
  let parentA: string[];
  let adminB: string[];

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();
    app = testApp();
    A = await createTenant('annA');
    B = await createTenant('annB');
    adminA = await login(app, A.adminEmail, 'admin');
    studentA = await login(app, A.studentEmail, 'student');
    teacherA = await login(app, A.teacherEmail, 'teacher');
    parentA = await login(app, A.parentEmail, 'parent');
    adminB = await login(app, B.adminEmail, 'admin');
  });

  afterAll(async () => {
    await clearTestDB();
    await closeTestDB();
  });

  describe('notification payload carries a resolvable target', () => {
    it('publishing an announcement notifies recipients with entity + entityId', async () => {
      const res = await request(app)
        .post('/api/comm/announcements')
        .set('Cookie', adminA)
        .send({
          title: 'Holiday notice',
          body: 'The academy is closed on Friday.',
          audience: 'ALL',
          priority: 'NORMAL',
          status: 'PUBLISHED',
          notify: true,
        });

      expect(res.status).toBe(201);
      const announcementId = String(res.body.data.announcement._id);
      expect(res.body.data.notified).toBeGreaterThan(0);

      const notif = await Notification.findOne({
        organizationId: A.orgId,
        entity: 'Announcement',
        entityId: announcementId,
      }).lean();

      expect(notif).toBeTruthy();
      // The id is what makes a portal-correct deep link possible client-side.
      expect(notif!.entityId).toBe(announcementId);
      expect(notif!.entity).toBe('Announcement');
    });

    it('the stored link is portal-less, so it must never be navigated to raw', async () => {
      const notif = await Notification.findOne({
        organizationId: A.orgId,
        entity: 'Announcement',
      }).lean();

      expect(notif!.link).toBe('/announcements');
      // Guard the assumption the client fix is built on: the link has no portal
      // prefix, so PortalLayout must resolve it rather than navigate directly.
      expect(notif!.link!.startsWith('/admin')).toBe(false);
      expect(notif!.link!.startsWith('/student')).toBe(false);
    });

    it('one announcement reaches several portals at once', async () => {
      const notifs = await Notification.find({
        organizationId: A.orgId,
        entity: 'Announcement',
      }).lean();

      // More than one recipient means a single server-side prefix could not be
      // correct for all of them — the reason the link stays portal-less.
      expect(notifs.length).toBeGreaterThan(1);
    });
  });

  describe('GET /comm/announcements/:id', () => {
    it('returns the announcement for an admin', async () => {
      const res = await request(app)
        .get(`/api/comm/announcements/${A.announcementId}`)
        .set('Cookie', adminA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(String(res.body.data._id)).toBe(String(A.announcementId));
      expect(res.body.data.title).toBeTruthy();
    });

    it('is readable by every portal role the announcement targets', async () => {
      for (const cookie of [studentA, teacherA, parentA]) {
        const res = await request(app)
          .get(`/api/comm/announcements/${A.announcementId}`)
          .set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(String(res.body.data._id)).toBe(String(A.announcementId));
      }
    });

    it('never leaks the raw readBy list', async () => {
      const res = await request(app)
        .get(`/api/comm/announcements/${A.announcementId}`)
        .set('Cookie', studentA);

      expect(res.status).toBe(200);
      expect(res.body.data.readBy).toBeUndefined();
      expect(typeof res.body.data.isRead).toBe('boolean');
    });

    it('404s for an unknown id', async () => {
      const res = await request(app)
        .get('/api/comm/announcements/64b7f0c2f1a2b3c4d5e6f7a8')
        .set('Cookie', adminA);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('422s for a malformed id rather than throwing', async () => {
      const res = await request(app)
        .get('/api/comm/announcements/not-an-object-id')
        .set('Cookie', adminA);

      expect(res.status).toBe(422);
    });

    it('requires authentication', async () => {
      const res = await request(app).get(`/api/comm/announcements/${A.announcementId}`);
      expect(res.status).toBe(401);
    });
  });

  describe('tenant isolation on the deep link', () => {
    it("org B's admin cannot read org A's announcement", async () => {
      const res = await request(app)
        .get(`/api/comm/announcements/${A.announcementId}`)
        .set('Cookie', adminB);

      // 404, not 403 — the endpoint must not confirm the id exists elsewhere.
      expect(res.status).toBe(404);
    });

    it("org A's student cannot read org B's announcement", async () => {
      const res = await request(app)
        .get(`/api/comm/announcements/${B.announcementId}`)
        .set('Cookie', studentA);

      expect(res.status).toBe(404);
    });
  });

  describe('audience scoping matches the list endpoint', () => {
    it('a student cannot deep-link into a TEACHERS-only announcement', async () => {
      const teachersOnly = await Announcement.create({
        organizationId: A.orgId,
        title: 'Staff briefing',
        body: 'Teachers only.',
        audience: 'TEACHERS',
        priority: 'NORMAL',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        createdBy: A.adminId,
      });

      const asStudent = await request(app)
        .get(`/api/comm/announcements/${teachersOnly._id}`)
        .set('Cookie', studentA);
      expect(asStudent.status).toBe(404);

      // ...but the audience it targets can read it.
      const asTeacher = await request(app)
        .get(`/api/comm/announcements/${teachersOnly._id}`)
        .set('Cookie', teacherA);
      expect(asTeacher.status).toBe(200);
    });

    it('a student cannot deep-link into an unpublished draft', async () => {
      const draft = await Announcement.create({
        organizationId: A.orgId,
        title: 'Unpublished draft',
        body: 'Not ready yet.',
        audience: 'ALL',
        priority: 'NORMAL',
        status: 'DRAFT',
        createdBy: A.adminId,
      });

      const asStudent = await request(app)
        .get(`/api/comm/announcements/${draft._id}`)
        .set('Cookie', studentA);
      expect(asStudent.status).toBe(404);

      // Admins manage drafts, so they may open them.
      const asAdmin = await request(app)
        .get(`/api/comm/announcements/${draft._id}`)
        .set('Cookie', adminA);
      expect(asAdmin.status).toBe(200);
    });

    it('a student cannot deep-link into an expired announcement', async () => {
      const expired = await Announcement.create({
        organizationId: A.orgId,
        title: 'Expired notice',
        body: 'This has lapsed.',
        audience: 'ALL',
        priority: 'NORMAL',
        status: 'PUBLISHED',
        publishedAt: new Date(Date.now() - 86_400_000 * 10),
        expiresAt: new Date(Date.now() - 86_400_000),
        createdBy: A.adminId,
      });

      const res = await request(app)
        .get(`/api/comm/announcements/${expired._id}`)
        .set('Cookie', studentA);
      expect(res.status).toBe(404);
    });
  });
});
