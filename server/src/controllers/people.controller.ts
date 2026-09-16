import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler, ok, created, paginated } from '../utils/http';
import { requireAuth, requireOrg } from '../middleware/auth';
import * as studentService from '../services/student.service';
import { recordAudit } from '../services/audit.service';
import {
  Student,
  Parent,
  Teacher,
  User,
  Course,
  Batch,
  Subject,
  BatchEnrollment,
  FeePlan,
  ClassSession,
} from '../models';
import { listScoped, findScoped, assertBelongsToOrg } from '../services/crud.factory';
import { ApiError } from '../utils/ApiError';
import { hashPassword } from '../services/password.service';
import {
  generatePassword,
} from '../utils/ids';
import { assertWithinLimit } from '../services/subscription.service';
import { ADMIN_CREATABLE_ROLES, Permission, PERMISSIONS, Role } from '../config/rbac';
import { effectivePermissions } from '../middleware/auth';

/* --------------------------------- Students -------------------------------- */

export const listStudents = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number };
  const { items, total } = await studentService.listStudents(requireOrg(req), q as never);
  return paginated(res, items, total, q.page, q.limit);
});

export const studentStats = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await studentService.studentCountsByStatus(requireOrg(req)));
});

export const createStudent = asyncHandler(async (req: Request, res: Response) => {
  const result = await studentService.createStudent(requireOrg(req), requireAuth(req), req.body);
  await recordAudit(req, { action: 'STUDENT_CREATED', entity: 'Student', entityId: result.student._id, metadata: { code: result.student.studentCode } });
  return created(res, result);
});

export const getStudent = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await studentService.studentProfile(requireOrg(req), req.params.id));
});

export const updateStudent = asyncHandler(async (req: Request, res: Response) => {
  const s = await studentService.updateStudent(requireOrg(req), req.params.id, req.body);
  await recordAudit(req, { action: 'STUDENT_UPDATED', entity: 'Student', entityId: req.params.id });
  return ok(res, s);
});

export const deactivateStudent = asyncHandler(async (req: Request, res: Response) => {
  const s = await studentService.deactivateStudent(requireOrg(req), req.params.id);
  await recordAudit(req, { action: 'STUDENT_DEACTIVATED', entity: 'Student', entityId: req.params.id });
  return ok(res, s);
});

export const activateStudent = asyncHandler(async (req: Request, res: Response) => {
  const s = await studentService.activateStudent(requireOrg(req), req.params.id);
  await recordAudit(req, { action: 'STUDENT_ACTIVATED', entity: 'Student', entityId: req.params.id });
  return ok(res, s);
});

export const resetStudentLogin = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const student = await Student.findOne({ _id: req.params.id, organizationId: orgId });
  if (!student) throw ApiError.notFound('Student not found');

  const password = generatePassword();
  if (student.userId) {
    await User.updateOne(
      { _id: student.userId, organizationId: orgId },
      { passwordHash: await hashPassword(password), mustChangePassword: true, isActive: true, $inc: { tokenVersion: 1 } },
    );
    const u = await User.findById(student.userId).select('email').lean();
    await recordAudit(req, { action: 'STUDENT_PASSWORD_RESET', entity: 'Student', entityId: student._id });
    return ok(res, { credentials: { email: u?.email, password } });
  }

  const { Organization } = await import('../models/Organization');
  const org = await Organization.findById(orgId).select('slug').lean();
  const email = student.email || `${student.studentCode.toLowerCase()}@${org?.slug ?? 'academy'}.academyos.local`;
  const exists = await User.findOne({ organizationId: orgId, email }).lean();
  if (exists) throw ApiError.conflict('A user with this email already exists', { email: 'Email already in use' });

  const user = await User.create({
    organizationId: orgId, name: student.name, email, phone: student.phone,
    passwordHash: await hashPassword(password), role: 'STUDENT', studentId: student._id, mustChangePassword: true,
  });
  student.userId = user._id;
  await student.save();
  await recordAudit(req, { action: 'STUDENT_LOGIN_CREATED', entity: 'Student', entityId: student._id });
  return created(res, { credentials: { email, password } });
});

/* --------------------------------- Parents --------------------------------- */

export const listParents = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; sort?: string; order?: 'asc' | 'desc' };
  const { items, total } = await listScoped(Parent, {
    organizationId: requireOrg(req),
    page: q.page, limit: q.limit, sort: q.sort, order: q.order, search: q.search,
    searchFields: ['name', 'phone', 'email'],
    populate: [{ path: 'childrenIds', select: 'name studentCode status' }],
  });
  return paginated(res, items, total, q.page, q.limit);
});

export const createParent = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const childrenIds = (req.body.childrenIds ?? []) as string[];
  for (const c of childrenIds) await assertBelongsToOrg(Student, c, orgId, 'Student');

  if (req.body.createLogin) {
    if (!req.body.email) throw ApiError.validation('Email is required to create a parent login', { email: 'Required for login' });
    const exists = await User.findOne({ organizationId: orgId, email: req.body.email }).lean();
    if (exists) throw ApiError.conflict('A user with this email already exists', { email: 'Email already in use' });
  }

  const parent = await Parent.create({
    organizationId: orgId,
    name: req.body.name, phone: req.body.phone, email: req.body.email || undefined,
    alternatePhone: req.body.alternatePhone, occupation: req.body.occupation,
    relation: req.body.relation, address: req.body.address,
    childrenIds: childrenIds.map((c) => new Types.ObjectId(c)),
    notes: req.body.notes, createdBy: auth.userId,
  });
  if (childrenIds.length) {
    await Student.updateMany({ _id: { $in: childrenIds }, organizationId: orgId }, { guardianId: parent._id });
  }

  let credentials: { email: string; password: string } | null = null;
  if (req.body.createLogin) {
    const password = generatePassword();
    const user = await User.create({
      organizationId: orgId, name: req.body.name, email: req.body.email, phone: req.body.phone,
      passwordHash: await hashPassword(password), role: 'PARENT', parentId: parent._id,
      mustChangePassword: true, createdBy: auth.userId,
    });
    parent.userId = user._id;
    await parent.save();
    credentials = { email: req.body.email, password };
  }

  await recordAudit(req, { action: 'PARENT_CREATED', entity: 'Parent', entityId: parent._id });
  return created(res, { parent: parent.toObject(), credentials });
});

export const getParent = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const parent = await findScoped(Parent, req.params.id, orgId, {
    populate: [{ path: 'childrenIds', select: 'name studentCode status primaryCourseId photoUrl' }],
    notFoundMessage: 'Parent not found',
  }) as { _id: Types.ObjectId; childrenIds: { _id: Types.ObjectId }[]; userId?: Types.ObjectId };

  const childIds = (parent.childrenIds ?? []).map((c) => c._id);
  const [fees, account] = await Promise.all([
    FeePlan.find({ organizationId: orgId, studentId: { $in: childIds } }).lean(),
    parent.userId ? User.findById(parent.userId).select('email isActive lastLoginAt').lean() : null,
  ]);
  return ok(res, { parent, account, fees });
});

export const updateParent = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const parent = await Parent.findOne({ _id: req.params.id, organizationId: orgId });
  if (!parent) throw ApiError.notFound('Parent not found');

  if (req.body.childrenIds) {
    for (const c of req.body.childrenIds) await assertBelongsToOrg(Student, c, orgId, 'Student');
    const previous = parent.childrenIds.map(String);
    const next = (req.body.childrenIds as string[]).map(String);
    const removed = previous.filter((p) => !next.includes(p));
    if (removed.length) await Student.updateMany({ _id: { $in: removed }, organizationId: orgId }, { $unset: { guardianId: 1 } });
    await Student.updateMany({ _id: { $in: next }, organizationId: orgId }, { guardianId: parent._id });
  }

  Object.entries(req.body).forEach(([k, v]) => {
    if (v === undefined) return;
    (parent as never as Record<string, unknown>)[k] = v;
  });
  await parent.save();
  if (parent.userId && (req.body.name || req.body.phone)) {
    await User.updateOne({ _id: parent.userId, organizationId: orgId }, {
      ...(req.body.name ? { name: req.body.name } : {}), ...(req.body.phone ? { phone: req.body.phone } : {}),
    });
  }
  await recordAudit(req, { action: 'PARENT_UPDATED', entity: 'Parent', entityId: parent._id });
  return ok(res, parent.toObject());
});

export const deleteParent = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const parent = await Parent.findOne({ _id: req.params.id, organizationId: orgId });
  if (!parent) throw ApiError.notFound('Parent not found');
  parent.isActive = false;
  await parent.save();
  if (parent.userId) await User.updateOne({ _id: parent.userId, organizationId: orgId }, { isActive: false, $inc: { tokenVersion: 1 } });
  await recordAudit(req, { action: 'PARENT_DEACTIVATED', entity: 'Parent', entityId: parent._id });
  return ok(res, parent.toObject());
});

export const resetParentLogin = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const parent = await Parent.findOne({ _id: req.params.id, organizationId: orgId });
  if (!parent) throw ApiError.notFound('Parent not found');
  const password = generatePassword();

  if (parent.userId) {
    await User.updateOne({ _id: parent.userId, organizationId: orgId }, {
      passwordHash: await hashPassword(password), mustChangePassword: true, isActive: true, $inc: { tokenVersion: 1 },
    });
    const u = await User.findById(parent.userId).select('email').lean();
    return ok(res, { credentials: { email: u?.email, password } });
  }
  if (!parent.email) throw ApiError.validation('Add an email address to this parent before creating a login', { email: 'Required' });
  const exists = await User.findOne({ organizationId: orgId, email: parent.email }).lean();
  if (exists) throw ApiError.conflict('A user with this email already exists', { email: 'Email already in use' });
  const user = await User.create({
    organizationId: orgId, name: parent.name, email: parent.email, phone: parent.phone,
    passwordHash: await hashPassword(password), role: 'PARENT', parentId: parent._id, mustChangePassword: true,
  });
  parent.userId = user._id;
  await parent.save();
  await recordAudit(req, { action: 'PARENT_LOGIN_CREATED', entity: 'Parent', entityId: parent._id });
  return created(res, { credentials: { email: parent.email, password } });
});

/* --------------------------------- Teachers -------------------------------- */

export const listTeachers = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; sort?: string; order?: 'asc' | 'desc'; isActive?: string };
  const filter: Record<string, unknown> = {};
  if (q.isActive) filter.isActive = q.isActive === 'true';
  const { items, total } = await listScoped(Teacher, {
    organizationId: requireOrg(req),
    page: q.page, limit: q.limit, sort: q.sort, order: q.order, search: q.search,
    searchFields: ['name', 'email', 'employeeCode', 'specialization'],
    filter,
    populate: [{ path: 'subjectIds', select: 'name code' }, { path: 'courseIds', select: 'title code' }],
  });
  return paginated(res, items, total, q.page, q.limit);
});

export const createTeacher = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  await assertWithinLimit(orgId, 'staff', 1);

  const exists = await User.findOne({ organizationId: orgId, email: req.body.email }).lean();
  if (exists) throw ApiError.conflict('A user with this email already exists in your academy', { email: 'Email already in use' });

  for (const s of req.body.subjectIds ?? []) await assertBelongsToOrg(Subject, s, orgId, 'Subject');
  for (const c of req.body.courseIds ?? []) await assertBelongsToOrg(Course, c, orgId, 'Course');

  const count = await Teacher.countDocuments({ organizationId: orgId });
  const employeeCode = req.body.employeeCode || `EMP${String(count + 1).padStart(4, '0')}`;
  const codeTaken = await Teacher.findOne({ organizationId: orgId, employeeCode }).lean();
  if (codeTaken) throw ApiError.conflict('Employee code already in use', { employeeCode: 'Already in use' });

  const password = req.body.password || generatePassword();
  const user = await User.create({
    organizationId: orgId, name: req.body.name, email: req.body.email, phone: req.body.phone,
    passwordHash: await hashPassword(password), role: 'TEACHER', mustChangePassword: !req.body.password,
    createdBy: auth.userId,
  });

  const teacher = await Teacher.create({
    organizationId: orgId, userId: user._id, employeeCode,
    name: req.body.name, email: req.body.email, phone: req.body.phone,
    qualification: req.body.qualification, specialization: req.body.specialization,
    experienceYears: req.body.experienceYears,
    joiningDate: req.body.joiningDate ? new Date(req.body.joiningDate) : new Date(),
    salary: req.body.salary, subjectIds: req.body.subjectIds ?? [], courseIds: req.body.courseIds ?? [],
    bio: req.body.bio, createdBy: auth.userId,
  });
  user.teacherId = teacher._id;
  await user.save();

  await recordAudit(req, { action: 'TEACHER_CREATED', entity: 'Teacher', entityId: teacher._id, metadata: { employeeCode } });
  return created(res, { teacher: teacher.toObject(), credentials: { email: req.body.email, password } });
});

export const getTeacher = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const teacher = await findScoped(Teacher, req.params.id, orgId, {
    populate: [{ path: 'subjectIds', select: 'name code' }, { path: 'courseIds', select: 'title code status' }],
    notFoundMessage: 'Teacher not found',
  }) as { _id: Types.ObjectId; userId: Types.ObjectId };

  const [batches, classes, account, upcoming] = await Promise.all([
    Batch.find({ organizationId: orgId, teacherId: teacher._id }).populate('courseId', 'title').lean(),
    ClassSession.countDocuments({ organizationId: orgId, teacherId: teacher._id }),
    User.findById(teacher.userId).select('email isActive lastLoginAt').lean(),
    ClassSession.find({ organizationId: orgId, teacherId: teacher._id, startAt: { $gte: new Date() } })
      .sort({ startAt: 1 }).limit(10).populate('batchId', 'name').lean(),
  ]);
  const studentCount = await BatchEnrollment.countDocuments({
    organizationId: orgId, batchId: { $in: batches.map((b) => b._id) }, status: 'ACTIVE',
  });

  return ok(res, { teacher, account, batches, stats: { classes, students: studentCount }, upcomingClasses: upcoming });
});

export const updateTeacher = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const teacher = await Teacher.findOne({ _id: req.params.id, organizationId: orgId });
  if (!teacher) throw ApiError.notFound('Teacher not found');

  for (const s of req.body.subjectIds ?? []) await assertBelongsToOrg(Subject, s, orgId, 'Subject');
  for (const c of req.body.courseIds ?? []) await assertBelongsToOrg(Course, c, orgId, 'Course');

  Object.entries(req.body).forEach(([k, v]) => {
    if (v === undefined || k === 'email') return;
    if (k === 'joiningDate') teacher.joiningDate = v ? new Date(v as string) : undefined;
    else (teacher as never as Record<string, unknown>)[k] = v;
  });
  await teacher.save();

  await User.updateOne({ _id: teacher.userId, organizationId: orgId }, {
    ...(req.body.name ? { name: req.body.name } : {}),
    ...(req.body.phone ? { phone: req.body.phone } : {}),
    ...(req.body.isActive !== undefined ? { isActive: req.body.isActive } : {}),
  });
  await recordAudit(req, { action: 'TEACHER_UPDATED', entity: 'Teacher', entityId: teacher._id });
  return ok(res, teacher.toObject());
});

export const deleteTeacher = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const teacher = await Teacher.findOne({ _id: req.params.id, organizationId: orgId });
  if (!teacher) throw ApiError.notFound('Teacher not found');

  const activeBatches = await Batch.countDocuments({ organizationId: orgId, teacherId: teacher._id, status: { $in: ['UPCOMING', 'ONGOING'] } });
  if (activeBatches > 0) {
    throw ApiError.conflict(`This teacher is assigned to ${activeBatches} active batch(es). Reassign them before deactivating.`);
  }
  teacher.isActive = false;
  await teacher.save();
  await User.updateOne({ _id: teacher.userId, organizationId: orgId }, { isActive: false, $inc: { tokenVersion: 1 } });
  await recordAudit(req, { action: 'TEACHER_DEACTIVATED', entity: 'Teacher', entityId: teacher._id });
  return ok(res, teacher.toObject());
});

/* ---------------------------------- Users ---------------------------------- */

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; role?: string; isActive?: string; sort?: string; order?: 'asc' | 'desc' };
  const filter: Record<string, unknown> = {};
  if (q.role) filter.role = q.role;
  else filter.role = { $in: ['ORGANIZATION_ADMIN', ...ADMIN_CREATABLE_ROLES] };
  if (q.isActive) filter.isActive = q.isActive === 'true';

  const { items, total } = await listScoped(User, {
    organizationId: requireOrg(req),
    page: q.page, limit: q.limit, sort: q.sort, order: q.order, search: q.search,
    searchFields: ['name', 'email', 'phone'],
    filter,
    select: '-passwordHash -resetTokenHash -resetTokenExpiresAt',
  });
  return paginated(res, items, total, q.page, q.limit);
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  if (!ADMIN_CREATABLE_ROLES.includes(req.body.role)) {
    throw ApiError.forbidden('You cannot create a user with this role');
  }
  await assertWithinLimit(orgId, 'staff', 1);

  const exists = await User.findOne({ organizationId: orgId, email: req.body.email }).lean();
  if (exists) throw ApiError.conflict('A user with this email already exists in your academy', { email: 'Email already in use' });

  const valid = new Set<string>(PERMISSIONS);
  const extra = (req.body.extraPermissions ?? []).filter((p: string) => valid.has(p));
  const denied = (req.body.deniedPermissions ?? []).filter((p: string) => valid.has(p));

  const password = req.body.password || generatePassword();
  const user = await User.create({
    organizationId: orgId, name: req.body.name, email: req.body.email, phone: req.body.phone,
    passwordHash: await hashPassword(password), role: req.body.role,
    extraPermissions: extra, deniedPermissions: denied,
    mustChangePassword: !req.body.password, createdBy: auth.userId,
  });

  // Teachers always get a Teacher profile so academic assignment works
  if (req.body.role === 'TEACHER') {
    const count = await Teacher.countDocuments({ organizationId: orgId });
    const teacher = await Teacher.create({
      organizationId: orgId, userId: user._id, employeeCode: `EMP${String(count + 1).padStart(4, '0')}`,
      name: req.body.name, email: req.body.email, phone: req.body.phone, joiningDate: new Date(), createdBy: auth.userId,
    });
    user.teacherId = teacher._id;
    await user.save();
  }

  await recordAudit(req, { action: 'USER_CREATED', entity: 'User', entityId: user._id, metadata: { role: req.body.role } });
  return created(res, {
    user: { ...user.toObject(), passwordHash: undefined },
    credentials: { email: req.body.email, password },
  });
});

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await findScoped(User, req.params.id, requireOrg(req), {
    select: '-passwordHash -resetTokenHash -resetTokenExpiresAt',
    notFoundMessage: 'User not found',
  }) as unknown as { role: Role; extraPermissions: Permission[]; deniedPermissions: Permission[] };
  return ok(res, { user, permissions: effectivePermissions(user.role, user.extraPermissions, user.deniedPermissions) });
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const user = await User.findOne({ _id: req.params.id, organizationId: orgId });
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'SAAS_OWNER') throw ApiError.forbidden('Platform owner accounts cannot be modified here');
  if (String(user._id) === String(auth.userId) && req.body.isActive === false) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }
  if (req.body.role && !ADMIN_CREATABLE_ROLES.includes(req.body.role)) {
    throw ApiError.forbidden('You cannot assign this role');
  }
  if (user.role === 'ORGANIZATION_ADMIN' && req.body.role && req.body.role !== 'ORGANIZATION_ADMIN') {
    const adminCount = await User.countDocuments({ organizationId: orgId, role: 'ORGANIZATION_ADMIN', isActive: true });
    if (adminCount <= 1) throw ApiError.conflict('Your academy must keep at least one active administrator');
  }

  const valid = new Set<string>(PERMISSIONS);
  if (req.body.name !== undefined) user.name = req.body.name;
  if (req.body.phone !== undefined) user.phone = req.body.phone;
  if (req.body.role !== undefined) user.role = req.body.role;
  if (req.body.isActive !== undefined) { user.isActive = req.body.isActive; user.tokenVersion += 1; }
  if (req.body.extraPermissions) user.extraPermissions = req.body.extraPermissions.filter((p: string) => valid.has(p));
  if (req.body.deniedPermissions) user.deniedPermissions = req.body.deniedPermissions.filter((p: string) => valid.has(p));
  await user.save();

  if (user.teacherId) {
    await Teacher.updateOne({ _id: user.teacherId, organizationId: orgId }, {
      ...(req.body.name ? { name: req.body.name } : {}),
      ...(req.body.isActive !== undefined ? { isActive: req.body.isActive } : {}),
    });
  }
  await recordAudit(req, { action: 'USER_UPDATED', entity: 'User', entityId: user._id, metadata: req.body });
  return ok(res, { ...user.toObject(), passwordHash: undefined });
});

export const toggleUserActive = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const user = await User.findOne({ _id: req.params.id, organizationId: orgId });
  if (!user) throw ApiError.notFound('User not found');
  if (String(user._id) === String(auth.userId)) throw ApiError.badRequest('You cannot deactivate your own account');
  if (user.role === 'ORGANIZATION_ADMIN' && user.isActive) {
    const adminCount = await User.countDocuments({ organizationId: orgId, role: 'ORGANIZATION_ADMIN', isActive: true });
    if (adminCount <= 1) throw ApiError.conflict('Your academy must keep at least one active administrator');
  }
  user.isActive = !user.isActive;
  user.tokenVersion += 1;
  await user.save();
  await recordAudit(req, { action: user.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', entity: 'User', entityId: user._id });
  return ok(res, { id: String(user._id), isActive: user.isActive });
});

export const resetUserPassword = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const user = await User.findOne({ _id: req.params.id, organizationId: orgId });
  if (!user) throw ApiError.notFound('User not found');
  const password = generatePassword();
  user.passwordHash = await hashPassword(password);
  user.mustChangePassword = true;
  user.tokenVersion += 1;
  await user.save();
  await recordAudit(req, { action: 'USER_PASSWORD_RESET', entity: 'User', entityId: user._id });
  return ok(res, { credentials: { email: user.email, password } });
});

export const availablePermissions = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, { permissions: PERMISSIONS, roles: ADMIN_CREATABLE_ROLES });
});
