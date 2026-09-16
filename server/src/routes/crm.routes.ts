import { Router } from 'express';
import * as c from '../controllers/crm.controller';
import { validate } from '../middleware/validate';
import { requirePermission } from '../middleware/auth';
import { idParamSchema, paginationSchema } from '../utils/query';
import {
  createLeadSchema, updateLeadSchema, leadQuerySchema, leadStatusSchema, leadActivitySchema,
  assignLeadSchema, createFollowUpSchema, updateFollowUpSchema, completeFollowUpSchema,
  rescheduleFollowUpSchema, followUpQuerySchema, convertLeadSchema,
} from '../validators/crm.validators';

const router = Router();

/* ----------------------------------- Leads ---------------------------------- */
router.get('/leads', requirePermission('lead:read'), validate({ query: leadQuerySchema }), c.listLeads);
router.get('/leads/kanban', requirePermission('lead:read'), c.kanbanLeads);
router.get('/leads/stats', requirePermission('lead:read'), c.leadStats);
router.post('/leads', requirePermission('lead:create'), validate({ body: createLeadSchema }), c.createLead);
router.get('/leads/:id', requirePermission('lead:read'), validate({ params: idParamSchema }), c.getLead);
router.patch('/leads/:id', requirePermission('lead:update'), validate({ params: idParamSchema, body: updateLeadSchema }), c.updateLead);
router.patch('/leads/:id/status', requirePermission('lead:update'), validate({ params: idParamSchema, body: leadStatusSchema }), c.changeLeadStatus);
router.patch('/leads/:id/assign', requirePermission('lead:update'), validate({ params: idParamSchema, body: assignLeadSchema }), c.assignLead);
router.post('/leads/:id/activities', requirePermission('lead:update'), validate({ params: idParamSchema, body: leadActivitySchema }), c.addLeadActivity);
router.delete('/leads/:id', requirePermission('lead:delete'), validate({ params: idParamSchema }), c.deleteLead);
router.post('/leads/:id/convert', requirePermission('lead:convert'), validate({ params: idParamSchema, body: convertLeadSchema }), c.convertLead);

/* --------------------------------- Follow-ups -------------------------------- */
router.get('/follow-ups', requirePermission('followup:read'), validate({ query: followUpQuerySchema }), c.listFollowUps);
router.get('/follow-ups/counts', requirePermission('followup:read'), c.followUpCounts);
router.post('/follow-ups', requirePermission('followup:create'), validate({ body: createFollowUpSchema }), c.createFollowUp);
router.patch('/follow-ups/:id', requirePermission('followup:update'), validate({ params: idParamSchema, body: updateFollowUpSchema }), c.updateFollowUp);
router.post('/follow-ups/:id/complete', requirePermission('followup:update'), validate({ params: idParamSchema, body: completeFollowUpSchema }), c.completeFollowUp);
router.post('/follow-ups/:id/reschedule', requirePermission('followup:update'), validate({ params: idParamSchema, body: rescheduleFollowUpSchema }), c.rescheduleFollowUp);
router.delete('/follow-ups/:id', requirePermission('followup:delete'), validate({ params: idParamSchema }), c.deleteFollowUp);

/* --------------------------------- Admissions -------------------------------- */
router.get('/admissions', requirePermission('admission:read'), validate({ query: paginationSchema }), c.listAdmissions);
router.get('/admissions/pending', requirePermission('admission:read'), c.pendingAdmissions);
router.post('/admissions', requirePermission('admission:create'), validate({ body: convertLeadSchema }), c.createDirectAdmission);
router.get('/admissions/:id', requirePermission('admission:read'), validate({ params: idParamSchema }), c.getAdmission);

export default router;
