import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/owner.controller';
import { authenticate, requireOwner, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { idParamSchema, paginationSchema, objectIdString } from '../utils/query';
import {
  createOrganizationSchema, updateOrganizationSchema, organizationQuerySchema, suspendSchema,
  updateSubscriptionSchema, recordSubscriptionPaymentSchema, createOrgAdminSchema,
  ownerUsersQuerySchema, auditQuerySchema,
} from '../validators/owner.validators';

const router = Router();

// Every owner route requires an authenticated SAAS_OWNER.
router.use(authenticate, requireOwner);

router.get('/dashboard', c.dashboard);
router.get('/reports', requirePermission('platform:reports'), c.reports);
router.get('/audit-logs', requirePermission('platform:audit'), validate({ query: auditQuerySchema }), c.auditLogs);
router.get('/usage', c.platformUsage);
router.get('/settings', c.platformSettings);

router.get('/organizations', requirePermission('organization:read'), validate({ query: organizationQuerySchema }), c.listOrganizations);
router.post('/organizations', requirePermission('organization:create'), validate({ body: createOrganizationSchema }), c.createOrganization);
router.get('/organizations/:id', requirePermission('organization:read'), validate({ params: idParamSchema }), c.getOrganization);
router.patch('/organizations/:id', requirePermission('organization:update'), validate({ params: idParamSchema, body: updateOrganizationSchema }), c.updateOrganization);
router.post('/organizations/:id/suspend', requirePermission('organization:suspend'), validate({ params: idParamSchema, body: suspendSchema }), c.suspendOrganization);
router.post('/organizations/:id/activate', requirePermission('organization:suspend'), validate({ params: idParamSchema }), c.activateOrganization);
router.post('/organizations/:id/reset-status', requirePermission('organization:update'), validate({ params: idParamSchema }), c.resetOrganizationStatus);
router.get('/organizations/:id/usage', requirePermission('organization:read'), validate({ params: idParamSchema }), c.organizationUsage);
router.post('/organizations/:id/admins', requirePermission('user:create'), validate({ params: idParamSchema, body: createOrgAdminSchema }), c.createOrgAdmin);
router.patch('/organizations/:id/subscription', requirePermission('subscription:manage'), validate({ params: idParamSchema, body: updateSubscriptionSchema }), c.updateSubscription);
router.post('/organizations/:id/subscription/payments', requirePermission('subscription:manage'), validate({ params: idParamSchema, body: recordSubscriptionPaymentSchema }), c.recordSubscriptionPayment);

router.get('/subscriptions', requirePermission('subscription:manage'), validate({
  query: paginationSchema.extend({
    status: z.string().max(30).optional(),
    plan: z.enum(['STARTER', 'GROWTH', 'PRO']).optional(),
  }),
}), c.listSubscriptions);

router.get('/users', requirePermission('user:read'), validate({ query: ownerUsersQuerySchema }), c.listUsers);
router.post('/users', requirePermission('user:create'), validate({ body: createOrgAdminSchema }), c.createOwnerUser);
router.post('/users/:userId/toggle-active', requirePermission('user:deactivate'), validate({ params: z.object({ userId: objectIdString }) }), c.toggleUserActive);
router.post('/users/:userId/reset-password', requirePermission('user:resetPassword'), validate({ params: z.object({ userId: objectIdString }) }), c.resetUserPassword);

export default router;
