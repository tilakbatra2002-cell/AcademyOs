import { Router } from 'express';
import * as c from '../controllers/people.controller';
import { validate } from '../middleware/validate';
import { requirePermission } from '../middleware/auth';
import { idParamSchema, paginationSchema } from '../utils/query';
import {
  createStudentSchema, updateStudentSchema, studentQuerySchema,
  createParentSchema, updateParentSchema,
  createTeacherSchema, updateTeacherSchema,
  createUserSchema, updateUserSchema, userQuerySchema,
} from '../validators/people.validators';

const router = Router();

/* ---------------------------------- Students -------------------------------- */
router.get('/students', requirePermission('student:read'), validate({ query: studentQuerySchema }), c.listStudents);
router.get('/students/stats', requirePermission('student:read'), c.studentStats);
router.post('/students', requirePermission('student:create'), validate({ body: createStudentSchema }), c.createStudent);
router.get('/students/:id', requirePermission('student:read'), validate({ params: idParamSchema }), c.getStudent);
router.patch('/students/:id', requirePermission('student:update'), validate({ params: idParamSchema, body: updateStudentSchema }), c.updateStudent);
router.delete('/students/:id', requirePermission('student:delete'), validate({ params: idParamSchema }), c.deactivateStudent);
router.post('/students/:id/activate', requirePermission('student:update'), validate({ params: idParamSchema }), c.activateStudent);
router.post('/students/:id/reset-login', requirePermission('user:resetPassword'), validate({ params: idParamSchema }), c.resetStudentLogin);

/* ---------------------------------- Parents --------------------------------- */
router.get('/parents', requirePermission('parent:read'), validate({ query: paginationSchema }), c.listParents);
router.post('/parents', requirePermission('parent:create'), validate({ body: createParentSchema }), c.createParent);
router.get('/parents/:id', requirePermission('parent:read'), validate({ params: idParamSchema }), c.getParent);
router.patch('/parents/:id', requirePermission('parent:update'), validate({ params: idParamSchema, body: updateParentSchema }), c.updateParent);
router.delete('/parents/:id', requirePermission('parent:delete'), validate({ params: idParamSchema }), c.deleteParent);
router.post('/parents/:id/reset-login', requirePermission('user:resetPassword'), validate({ params: idParamSchema }), c.resetParentLogin);

/* ---------------------------------- Teachers -------------------------------- */
router.get('/teachers', requirePermission('teacher:read'), validate({ query: paginationSchema }), c.listTeachers);
router.post('/teachers', requirePermission('teacher:create'), validate({ body: createTeacherSchema }), c.createTeacher);
router.get('/teachers/:id', requirePermission('teacher:read'), validate({ params: idParamSchema }), c.getTeacher);
router.patch('/teachers/:id', requirePermission('teacher:update'), validate({ params: idParamSchema, body: updateTeacherSchema }), c.updateTeacher);
router.delete('/teachers/:id', requirePermission('teacher:delete'), validate({ params: idParamSchema }), c.deleteTeacher);

/* -------------------------------- Users / RBAC ------------------------------- */
router.get('/users', requirePermission('user:read'), validate({ query: userQuerySchema }), c.listUsers);
router.get('/users/permissions', requirePermission('user:read'), c.availablePermissions);
router.post('/users', requirePermission('user:create'), validate({ body: createUserSchema }), c.createUser);
router.get('/users/:id', requirePermission('user:read'), validate({ params: idParamSchema }), c.getUser);
router.patch('/users/:id', requirePermission('user:update'), validate({ params: idParamSchema, body: updateUserSchema }), c.updateUser);
router.post('/users/:id/toggle-active', requirePermission('user:deactivate'), validate({ params: idParamSchema }), c.toggleUserActive);
router.post('/users/:id/reset-password', requirePermission('user:resetPassword'), validate({ params: idParamSchema }), c.resetUserPassword);

export default router;
