import { Request, Response } from 'express';
import { asyncHandler, ok, created, paginated } from '../utils/http';
import { requireAuth, requireOrg } from '../middleware/auth';
import * as leadService from '../services/lead.service';
import * as followUpService from '../services/followup.service';
import * as admissionService from '../services/admission.service';
import { recordAudit } from '../services/audit.service';
import { Admission, Lead } from '../models';
import { listScoped } from '../services/crud.factory';
import { toObjectId } from '../utils/ids';

/* ---------------------------------- Leads --------------------------------- */

export const listLeads = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as leadService.LeadListParams;
  const { items, total } = await leadService.listLeads(requireOrg(req), requireAuth(req), q);
  return paginated(res, items, total, q.page, q.limit);
});

export const kanbanLeads = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, { columns: await leadService.kanban(requireOrg(req), requireAuth(req)) });
});

export const leadStats = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await leadService.leadStats(requireOrg(req), requireAuth(req)));
});

export const createLead = asyncHandler(async (req: Request, res: Response) => {
  const result = await leadService.createLead(requireOrg(req), requireAuth(req), req.body);
  await recordAudit(req, { action: 'LEAD_CREATED', entity: 'Lead', entityId: result.lead._id, metadata: { name: result.lead.name } });
  return created(res, result);
});

export const getLead = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await leadService.getLead(requireOrg(req), requireAuth(req), req.params.id));
});

export const updateLead = asyncHandler(async (req: Request, res: Response) => {
  const lead = await leadService.updateLead(requireOrg(req), requireAuth(req), req.params.id, req.body);
  await recordAudit(req, { action: 'LEAD_UPDATED', entity: 'Lead', entityId: req.params.id });
  return ok(res, lead);
});

export const changeLeadStatus = asyncHandler(async (req: Request, res: Response) => {
  const lead = await leadService.changeStatus(requireOrg(req), requireAuth(req), req.params.id, req.body.status, req.body.note, req.body.lostReason);
  await recordAudit(req, { action: 'LEAD_STATUS_CHANGED', entity: 'Lead', entityId: req.params.id, metadata: { status: req.body.status } });
  return ok(res, lead);
});

export const assignLead = asyncHandler(async (req: Request, res: Response) => {
  const lead = await leadService.assignLead(requireOrg(req), requireAuth(req), req.params.id, req.body.assignedCounselorId);
  await recordAudit(req, { action: 'LEAD_ASSIGNED', entity: 'Lead', entityId: req.params.id, metadata: { to: req.body.assignedCounselorId } });
  return ok(res, lead);
});

export const addLeadActivity = asyncHandler(async (req: Request, res: Response) => {
  const activity = await leadService.addActivity(requireOrg(req), requireAuth(req), req.params.id, req.body);
  await recordAudit(req, { action: 'LEAD_ACTIVITY_ADDED', entity: 'LeadActivity', entityId: activity._id, metadata: { leadId: req.params.id } });
  return created(res, activity);
});

export const deleteLead = asyncHandler(async (req: Request, res: Response) => {
  const result = await leadService.deleteLead(requireOrg(req), req.params.id);
  await recordAudit(req, { action: 'LEAD_DELETED', entity: 'Lead', entityId: req.params.id });
  return ok(res, result);
});

export const convertLead = asyncHandler(async (req: Request, res: Response) => {
  const result = await admissionService.admitStudent(requireOrg(req), requireAuth(req), req.body, req.params.id);
  await recordAudit(req, {
    action: 'LEAD_CONVERTED', entity: 'Lead', entityId: req.params.id,
    metadata: { studentId: result.studentId, admissionNumber: result.admissionNumber },
  });
  return created(res, result);
});

/* -------------------------------- Follow-ups ------------------------------- */

export const listFollowUps = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; bucket: string };
  const { items, total } = await followUpService.listFollowUps(requireOrg(req), requireAuth(req), q as never);
  return paginated(res, items, total, q.page, q.limit);
});

export const followUpCounts = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await followUpService.followUpCounts(requireOrg(req), requireAuth(req)));
});

export const createFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const fu = await followUpService.createFollowUp(requireOrg(req), requireAuth(req), req.body);
  await recordAudit(req, { action: 'FOLLOWUP_CREATED', entity: 'FollowUp', entityId: fu._id });
  return created(res, fu);
});

export const updateFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const fu = await followUpService.updateFollowUp(requireOrg(req), requireAuth(req), req.params.id, req.body);
  await recordAudit(req, { action: 'FOLLOWUP_UPDATED', entity: 'FollowUp', entityId: req.params.id });
  return ok(res, fu);
});

export const completeFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const result = await followUpService.completeFollowUp(requireOrg(req), requireAuth(req), req.params.id, req.body);
  await recordAudit(req, { action: 'FOLLOWUP_COMPLETED', entity: 'FollowUp', entityId: req.params.id });
  return ok(res, result);
});

export const rescheduleFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const fu = await followUpService.rescheduleFollowUp(requireOrg(req), requireAuth(req), req.params.id, req.body);
  await recordAudit(req, { action: 'FOLLOWUP_RESCHEDULED', entity: 'FollowUp', entityId: req.params.id });
  return ok(res, fu);
});

export const deleteFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const r = await followUpService.deleteFollowUp(requireOrg(req), req.params.id);
  await recordAudit(req, { action: 'FOLLOWUP_DELETED', entity: 'FollowUp', entityId: req.params.id });
  return ok(res, r);
});

/* -------------------------------- Admissions ------------------------------- */

export const listAdmissions = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; sort?: string; order?: 'asc' | 'desc'; status?: string; courseId?: string };
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.courseId) filter.courseId = toObjectId(q.courseId);

  const { items, total } = await listScoped(Admission, {
    organizationId: requireOrg(req),
    page: q.page, limit: q.limit, sort: q.sort, order: q.order, search: q.search,
    searchFields: ['admissionNumber', 'remarks'],
    filter,
    populate: [
      { path: 'studentId', select: 'name studentCode phone email' },
      { path: 'courseId', select: 'title code' },
      { path: 'batchId', select: 'name code' },
      { path: 'counselorId', select: 'name' },
    ],
    defaultSort: 'admissionDate',
  });
  return paginated(res, items, total, q.page, q.limit);
});

export const getAdmission = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const admission = await Admission.findOne({ _id: req.params.id, organizationId: orgId })
    .populate('studentId', 'name studentCode phone email photoUrl')
    .populate('courseId', 'title code price')
    .populate('batchId', 'name code startDate')
    .populate('parentId', 'name phone email')
    .populate('feePlanId')
    .lean();
  if (!admission) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Admission not found', fields: {} } });
  return ok(res, admission);
});

/** Direct admission (walk-in) — no lead required. Uses the same transactional workflow. */
export const createDirectAdmission = asyncHandler(async (req: Request, res: Response) => {
  const result = await admissionService.admitStudent(requireOrg(req), requireAuth(req), req.body);
  await recordAudit(req, { action: 'ADMISSION_CREATED', entity: 'Admission', metadata: { admissionNumber: result.admissionNumber } });
  return created(res, result);
});

export const pendingAdmissions = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const leads = await Lead.find({ organizationId: orgId, status: 'ADMISSION_PENDING' })
    .populate('courseId', 'title')
    .populate('assignedCounselorId', 'name')
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();
  return ok(res, { items: leads });
});
