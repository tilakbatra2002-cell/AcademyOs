import type { NotificationItem, PortalKey } from '@/types';

/**
 * Resolves the in-app path a notification should open.
 *
 * Why this exists
 * ---------------
 * Notification links are generated on the server, but the SPA mounts every page
 * under a portal prefix (`/admin/*`, `/student/*`, `/teacher/*`, `/parent/*`).
 * Most backend links already include that prefix (`/student/results`,
 * `/admin/follow-ups`), but announcement notifications cannot: one announcement
 * is delivered to admins, teachers, students and parents simultaneously, so no
 * single hardcoded prefix is correct for every recipient.
 *
 * The announcement link is therefore stored portal-less (`/announcements`) and
 * resolved here against the portal the user is actually signed into. Navigating
 * to the raw value sent the user to `/announcements`, which matches no route and
 * rendered the global Not Found page.
 *
 * Rules, in order:
 *  1. No link at all -> stay put (`null`).
 *  2. External/absolute URL -> returned untouched.
 *  3. Link already addressed to a portal -> used as-is.
 *  4. Otherwise -> prefixed with the current portal, and deep-linked to the
 *     source record when the notification carries one (`entity`/`entityId`).
 */

const PORTAL_PREFIXES: readonly PortalKey[] = ['owner', 'admin', 'teacher', 'student', 'parent'];

/** Entities that have a detail page, mapped to their route segment per portal. */
const DETAIL_ROUTES: Record<string, Partial<Record<PortalKey, string>>> = {
  Announcement: {
    admin: 'announcements',
    teacher: 'announcements',
    student: 'announcements',
    parent: 'announcements',
  },
};

export function notificationPath(
  n: Pick<NotificationItem, 'link' | 'entity' | 'entityId'>,
  portal: PortalKey,
): string | null {
  const link = n.link?.trim();

  // Deep-link to the record's own page when we know how to address it. This
  // takes priority over the generic list link so the user lands on the exact
  // announcement they were notified about.
  if (n.entity && n.entityId) {
    const segment = DETAIL_ROUTES[n.entity]?.[portal];
    if (segment) return `/${portal}/${segment}/${n.entityId}`;
  }

  if (!link) return null;

  // Absolute URLs (mail links, external docs) are never rewritten.
  if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('//')) return link;

  const path = link.startsWith('/') ? link : `/${link}`;
  const [firstSegment] = path.slice(1).split('/');

  // Already portal-addressed (e.g. `/student/results`) — leave it alone.
  if (PORTAL_PREFIXES.includes(firstSegment as PortalKey)) return path;

  return `/${portal}${path}`;
}
