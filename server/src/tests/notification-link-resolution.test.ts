import { describe, it, expect } from 'vitest';
import { notificationPath } from '../../../client/src/lib/notificationPath';

/**
 * Unit tests for the client-side notification link resolver.
 *
 * This is the actual fix for the "announcement notification opens a 404" bug:
 * `PortalLayout` used to call `navigate(n.link)` on the raw stored link, and
 * announcement links are portal-less (`/announcements`), which matches no route
 * in a router where every page lives under `/{portal}/*`.
 *
 * The function is pure and framework-free, so it is exercised here in the
 * existing vitest suite rather than requiring a separate browser-env runner.
 */
describe('notificationPath', () => {
  const announcement = { link: '/announcements', entity: 'Announcement', entityId: 'abc123' };

  describe('the reported bug', () => {
    it('never returns the bare /announcements path that produced the 404', () => {
      for (const portal of ['admin', 'teacher', 'student', 'parent'] as const) {
        expect(notificationPath(announcement, portal)).not.toBe('/announcements');
      }
    });

    it('deep-links each portal to its own announcement page', () => {
      expect(notificationPath(announcement, 'admin')).toBe('/admin/announcements/abc123');
      expect(notificationPath(announcement, 'teacher')).toBe('/teacher/announcements/abc123');
      expect(notificationPath(announcement, 'student')).toBe('/student/announcements/abc123');
      expect(notificationPath(announcement, 'parent')).toBe('/parent/announcements/abc123');
    });

    it('resolves the same announcement differently per recipient portal', () => {
      // The core reason the fix cannot live server-side: one announcement, many
      // portals, each needing a different path.
      const admin = notificationPath(announcement, 'admin');
      const student = notificationPath(announcement, 'student');
      expect(admin).not.toBe(student);
    });
  });

  describe('links that are already portal-addressed', () => {
    it('leaves them untouched', () => {
      const cases = [
        '/student/results', '/student/assignments', '/student/fees',
        '/admin/follow-ups', '/student/courses', '/student/schedule',
      ];
      for (const link of cases) {
        expect(notificationPath({ link }, 'student')).toBe(link);
      }
    });

    it('does not double-prefix when portal and link agree', () => {
      expect(notificationPath({ link: '/admin/follow-ups' }, 'admin')).toBe('/admin/follow-ups');
    });

    it('respects an explicit cross-portal link rather than rewriting it', () => {
      expect(notificationPath({ link: '/admin/follow-ups' }, 'student')).toBe('/admin/follow-ups');
    });
  });

  describe('generic portal-less links', () => {
    it('prefixes with the active portal', () => {
      expect(notificationPath({ link: '/fees' }, 'parent')).toBe('/parent/fees');
    });

    it('normalises a link with no leading slash', () => {
      expect(notificationPath({ link: 'fees' }, 'parent')).toBe('/parent/fees');
    });
  });

  describe('edge cases must not crash or navigate somewhere silly', () => {
    it('returns null when there is no link and no entity', () => {
      expect(notificationPath({}, 'admin')).toBeNull();
      expect(notificationPath({ link: '' }, 'admin')).toBeNull();
      expect(notificationPath({ link: '   ' }, 'admin')).toBeNull();
    });

    it('still deep-links when the link is missing but entityId is present', () => {
      expect(notificationPath({ entity: 'Announcement', entityId: 'z9' }, 'student'))
        .toBe('/student/announcements/z9');
    });

    it('falls back to the link when entityId is absent', () => {
      expect(notificationPath({ link: '/announcements', entity: 'Announcement' }, 'student'))
        .toBe('/student/announcements');
    });

    it('leaves absolute URLs alone', () => {
      expect(notificationPath({ link: 'https://example.com/x' }, 'admin')).toBe('https://example.com/x');
      expect(notificationPath({ link: 'mailto:a@b.com' }, 'admin')).toBe('mailto:a@b.com');
    });

    it('does not deep-link an entity it has no route for', () => {
      expect(notificationPath({ link: '/fees', entity: 'Payment', entityId: 'p1' }, 'student'))
        .toBe('/student/fees');
    });

    it('owner has no announcement page, so it uses the plain prefixed link', () => {
      expect(notificationPath(announcement, 'owner')).toBe('/owner/announcements');
    });
  });
});
