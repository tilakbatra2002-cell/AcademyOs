/**
 * Central RBAC definition.
 * Permissions are `<resource>:<action>` strings. Roles map to permission sets.
 * Backend enforces these on EVERY protected route — the frontend only mirrors them.
 */

export const ROLES = [
  'SAAS_OWNER',
  'ORGANIZATION_ADMIN',
  'COUNSELOR',
  'TEACHER',
  'ACCOUNTANT',
  'STAFF',
  'PARENT',
  'STUDENT',
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  // platform (owner only)
  'platform:manage',
  'organization:create',
  'organization:read',
  'organization:update',
  'organization:suspend',
  'subscription:manage',
  'platform:reports',
  'platform:audit',

  // org-level
  'org:settings:read',
  'org:settings:update',
  'user:create',
  'user:read',
  'user:update',
  'user:deactivate',
  'user:resetPassword',
  'audit:read',

  // CRM
  'lead:create', 'lead:read', 'lead:update', 'lead:delete', 'lead:convert',
  'followup:create', 'followup:read', 'followup:update', 'followup:delete',
  'admission:create', 'admission:read', 'admission:update',

  // people
  'student:create', 'student:read', 'student:update', 'student:delete',
  'parent:create', 'parent:read', 'parent:update', 'parent:delete',
  'teacher:create', 'teacher:read', 'teacher:update', 'teacher:delete',

  // academics
  'course:create', 'course:read', 'course:update', 'course:delete',
  'subject:create', 'subject:read', 'subject:update', 'subject:delete',
  'batch:create', 'batch:read', 'batch:update', 'batch:delete',
  'class:create', 'class:read', 'class:update', 'class:delete',
  'attendance:create', 'attendance:read', 'attendance:update',
  'exam:create', 'exam:read', 'exam:update', 'exam:delete',
  'result:create', 'result:read', 'result:update', 'result:delete',
  'assignment:create', 'assignment:read', 'assignment:update', 'assignment:delete',
  'assignment:grade', 'assignment:submit',

  // LMS
  'lms:manage', 'lms:read',
  'lesson:create', 'lesson:read', 'lesson:update', 'lesson:delete',
  'video:create', 'video:read', 'video:update', 'video:delete',
  'material:create', 'material:read', 'material:update', 'material:delete',
  'quiz:create', 'quiz:read', 'quiz:update', 'quiz:delete', 'quiz:attempt',
  'enrollment:create', 'enrollment:read', 'enrollment:update', 'enrollment:delete',
  'progress:read', 'progress:write',

  // finance
  'feeplan:create', 'feeplan:read', 'feeplan:update', 'feeplan:delete',
  'payment:create', 'payment:read', 'payment:update', 'payment:delete',
  'payment:self', // pay / view only one's OWN fees via the portal, never org-wide finance
  'invoice:read', 'invoice:create',
  'receipt:read',

  // communication
  'announcement:create', 'announcement:read', 'announcement:update', 'announcement:delete',
  'notification:read', 'notification:update',
  'communication:create', 'communication:read',

  // misc
  'document:create', 'document:read', 'document:delete',
  'calendar:read', 'calendar:create', 'calendar:update', 'calendar:delete',
  'report:read',
  'search:global',
  'import:run', 'export:run',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OWNER_PERMS: Permission[] = [
  'platform:manage', 'organization:create', 'organization:read', 'organization:update',
  'organization:suspend', 'subscription:manage', 'platform:reports', 'platform:audit',
  'user:create', 'user:read', 'user:update', 'user:deactivate', 'user:resetPassword', 'audit:read',
];

const ADMIN_PERMS: Permission[] = [
  'org:settings:read', 'org:settings:update',
  'user:create', 'user:read', 'user:update', 'user:deactivate', 'user:resetPassword', 'audit:read',
  'lead:create', 'lead:read', 'lead:update', 'lead:delete', 'lead:convert',
  'followup:create', 'followup:read', 'followup:update', 'followup:delete',
  'admission:create', 'admission:read', 'admission:update',
  'student:create', 'student:read', 'student:update', 'student:delete',
  'parent:create', 'parent:read', 'parent:update', 'parent:delete',
  'teacher:create', 'teacher:read', 'teacher:update', 'teacher:delete',
  'course:create', 'course:read', 'course:update', 'course:delete',
  'subject:create', 'subject:read', 'subject:update', 'subject:delete',
  'batch:create', 'batch:read', 'batch:update', 'batch:delete',
  'class:create', 'class:read', 'class:update', 'class:delete',
  'attendance:create', 'attendance:read', 'attendance:update',
  'exam:create', 'exam:read', 'exam:update', 'exam:delete',
  'result:create', 'result:read', 'result:update', 'result:delete',
  'assignment:create', 'assignment:read', 'assignment:update', 'assignment:delete', 'assignment:grade',
  'lms:manage', 'lms:read',
  'lesson:create', 'lesson:read', 'lesson:update', 'lesson:delete',
  'video:create', 'video:read', 'video:update', 'video:delete',
  'material:create', 'material:read', 'material:update', 'material:delete',
  'quiz:create', 'quiz:read', 'quiz:update', 'quiz:delete',
  'enrollment:create', 'enrollment:read', 'enrollment:update', 'enrollment:delete',
  'progress:read',
  'feeplan:create', 'feeplan:read', 'feeplan:update', 'feeplan:delete',
  'payment:create', 'payment:read', 'payment:update', 'payment:delete',
  'invoice:read', 'invoice:create', 'receipt:read',
  'announcement:create', 'announcement:read', 'announcement:update', 'announcement:delete',
  'notification:read', 'notification:update',
  'communication:create', 'communication:read',
  'document:create', 'document:read', 'document:delete',
  'calendar:read', 'calendar:create', 'calendar:update', 'calendar:delete',
  'report:read', 'search:global', 'import:run', 'export:run',
];

const COUNSELOR_PERMS: Permission[] = [
  'lead:create', 'lead:read', 'lead:update', 'lead:convert',
  'followup:create', 'followup:read', 'followup:update', 'followup:delete',
  'admission:create', 'admission:read', 'admission:update',
  'student:create', 'student:read', 'student:update',
  'parent:create', 'parent:read', 'parent:update',
  'course:read', 'batch:read', 'class:read', 'subject:read',
  'enrollment:create', 'enrollment:read',
  'feeplan:create', 'feeplan:read',
  'announcement:read', 'notification:read', 'notification:update',
  'communication:create', 'communication:read',
  'document:create', 'document:read',
  'calendar:read', 'report:read', 'search:global', 'import:run', 'export:run',
];

const TEACHER_PERMS: Permission[] = [
  'student:read', 'parent:read', 'teacher:read',
  'course:read', 'course:update', 'subject:read', 'batch:read',
  'class:read', 'class:create', 'class:update',
  'attendance:create', 'attendance:read', 'attendance:update',
  'exam:create', 'exam:read', 'exam:update',
  'result:create', 'result:read', 'result:update',
  'assignment:create', 'assignment:read', 'assignment:update', 'assignment:delete', 'assignment:grade',
  'lms:manage', 'lms:read',
  'lesson:create', 'lesson:read', 'lesson:update', 'lesson:delete',
  'video:create', 'video:read', 'video:update', 'video:delete',
  'material:create', 'material:read', 'material:update', 'material:delete',
  'quiz:create', 'quiz:read', 'quiz:update', 'quiz:delete',
  'enrollment:read', 'progress:read',
  'announcement:create', 'announcement:read',
  'notification:read', 'notification:update',
  'communication:create', 'communication:read',
  'document:create', 'document:read',
  'calendar:read', 'report:read', 'search:global',
];

const ACCOUNTANT_PERMS: Permission[] = [
  'student:read', 'parent:read', 'course:read', 'batch:read',
  'feeplan:create', 'feeplan:read', 'feeplan:update', 'feeplan:delete',
  'payment:create', 'payment:read', 'payment:update',
  'invoice:read', 'invoice:create', 'receipt:read',
  'announcement:read', 'notification:read', 'notification:update',
  'communication:create', 'communication:read',
  'report:read', 'search:global', 'export:run', 'calendar:read',
];

const STAFF_PERMS: Permission[] = [
  'student:read', 'parent:read', 'teacher:read', 'lead:read', 'lead:create', 'lead:update',
  'followup:read', 'followup:create', 'followup:update',
  'course:read', 'batch:read', 'class:read', 'attendance:read',
  'announcement:read', 'notification:read', 'notification:update',
  'communication:create', 'communication:read',
  'document:read', 'calendar:read', 'search:global',
];

const STUDENT_PERMS: Permission[] = [
  'course:read', 'batch:read', 'class:read', 'lesson:read', 'video:read', 'material:read',
  'lms:read', 'quiz:read', 'quiz:attempt',
  'enrollment:read', 'progress:read', 'progress:write',
  'attendance:read', 'exam:read', 'result:read',
  'assignment:read', 'assignment:submit',
  // Own fees are served by /api/portal/me/fees; org-wide finance lists stay closed.
  'payment:self',
  'announcement:read', 'notification:read', 'notification:update',
  'document:read', 'calendar:read',
];

const PARENT_PERMS: Permission[] = [
  // NB: no 'student:read'. That permission unlocks the org-wide roster
  // (GET /api/people/students), which would expose every classmate's name,
  // e-mail and phone number to any signed-in parent. A parent's own children
  // are served by /api/portal/me/children and
  // /api/portal/me/children/:studentId/* , which verify the guardian link.
  'course:read', 'batch:read', 'class:read',
  'attendance:read', 'exam:read', 'result:read', 'assignment:read',
  // Children's fees are served by /api/portal/me/children/:studentId/fees.
  'payment:self',
  'announcement:read', 'notification:read', 'notification:update',
  'calendar:read', 'progress:read',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SAAS_OWNER: OWNER_PERMS,
  ORGANIZATION_ADMIN: ADMIN_PERMS,
  COUNSELOR: COUNSELOR_PERMS,
  TEACHER: TEACHER_PERMS,
  ACCOUNTANT: ACCOUNTANT_PERMS,
  STAFF: STAFF_PERMS,
  PARENT: PARENT_PERMS,
  STUDENT: STUDENT_PERMS,
};

export function permissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

/** Roles an ORGANIZATION_ADMIN is allowed to provision. */
export const ADMIN_CREATABLE_ROLES: Role[] = ['COUNSELOR', 'TEACHER', 'ACCOUNTANT', 'STAFF', 'PARENT', 'STUDENT'];

export const STAFF_ROLES: Role[] = ['ORGANIZATION_ADMIN', 'COUNSELOR', 'TEACHER', 'ACCOUNTANT', 'STAFF'];

/** Login portals -> roles allowed to authenticate through them. */
export const PORTAL_ROLES: Record<string, Role[]> = {
  owner: ['SAAS_OWNER'],
  admin: ['ORGANIZATION_ADMIN', 'COUNSELOR', 'ACCOUNTANT', 'STAFF'],
  teacher: ['TEACHER'],
  student: ['STUDENT'],
  parent: ['PARENT'],
};
