import { Types, FilterQuery } from 'mongoose';
import dayjs from 'dayjs';
import { Lead, ILead, LeadActivity, LEAD_STATUSES } from '../models/Lead';
import { FollowUp } from '../models/FollowUp';
import { Course } from '../models/Course';
import { User } from '../models/User';
import { listScoped, findScoped, assertBelongsToOrg } from './crud.factory';
import { ApiError } from '../utils/ApiError';
import { dateRangeFilter } from '../utils/query';
import { AuthContext } from '../types/express';

export interface LeadListParams {
  page: number; limit: number; sort?: string; order?: 'asc' | 'desc'; search?: string;
  status?: string; source?: string; priority?: string; assignedCounselorId?: string; courseId?: string;
  from?: string; to?: string;
}

/** Counselors only see leads assigned to them unless they can manage all leads. */
function visibilityFilter(auth: AuthContext): FilterQuery<ILead> {
  if (auth.role === 'COUNSELOR') return { assignedCounselorId: auth.userId };
  return {};
}

export async function listLeads(orgId: Types.ObjectId, auth: AuthContext, params: LeadListParams) {
  const filter: FilterQuery<ILead> = { ...visibilityFilter(auth) };
  if (params.status) filter.status = params.status as never;
  if (params.source) filter.source = params.source as never;
  if (params.priority) filter.priority = params.priority as never;
  if (params.assignedCounselorId) filter.assignedCounselorId = new Types.ObjectId(params.assignedCounselorId);
  if (params.courseId) filter.courseId = new Types.ObjectId(params.courseId);
  const range = dateRangeFilter(params.from, params.to);
  if (range) filter.createdAt = range as never;

  const { items, total } = await listScoped(Lead, {
    organizationId: orgId,
    page: params.page,
    limit: params.limit,
    sort: params.sort,
    order: params.order,
    search: params.search,
    searchFields: ['name', 'phone', 'email', 'parentName', 'city'],
    filter,
    populate: [
      { path: 'courseId', select: 'title code' },
      { path: 'assignedCounselorId', select: 'name email' },
    ],
  });
  return { items, total };
}

export async function kanban(orgId: Types.ObjectId, auth: AuthContext, limitPerColumn = 25) {
  const base: FilterQuery<ILead> = { organizationId: orgId, ...visibilityFilter(auth) };
  const columns = await Promise.all(
    LEAD_STATUSES.map(async (status) => {
      const [items, count] = await Promise.all([
        Lead.find({ ...base, status })
          .sort({ updatedAt: -1 })
          .limit(limitPerColumn)
          .populate('assignedCounselorId', 'name')
          .populate('courseId', 'title')
          .lean(),
        Lead.countDocuments({ ...base, status }),
      ]);
      return { status, count, items };
    }),
  );
  return columns;
}

export async function createLead(orgId: Types.ObjectId, auth: AuthContext, input: Record<string, unknown>) {
  const courseId = input.courseId ? new Types.ObjectId(input.courseId as string) : undefined;
  if (courseId) await assertBelongsToOrg(Course, courseId, orgId, 'Course');

  let counselorId = input.assignedCounselorId ? new Types.ObjectId(input.assignedCounselorId as string) : undefined;
  if (counselorId) {
    const u = await User.exists({ _id: counselorId, organizationId: orgId });
    if (!u) throw ApiError.notFound('Assigned counselor not found in your academy');
  } else if (auth.role === 'COUNSELOR') {
    counselorId = auth.userId;
  }

  const duplicate = await Lead.findOne({ organizationId: orgId, phone: input.phone }).lean();

  const lead = await Lead.create({
    ...input,
    email: input.email || undefined,
    courseId,
    assignedCounselorId: counselorId,
    expectedJoiningDate: input.expectedJoiningDate ? new Date(input.expectedJoiningDate as string) : undefined,
    organizationId: orgId,
    createdBy: auth.userId,
  });

  await LeadActivity.create({
    organizationId: orgId,
    leadId: lead._id,
    type: 'SYSTEM',
    title: 'Lead created',
    description: `Lead captured from ${lead.source.replace(/_/g, ' ').toLowerCase()}`,
    performedBy: auth.userId,
    performedByName: auth.name,
  });

  return { lead: lead.toObject(), duplicateWarning: duplicate ? { id: String(duplicate._id), name: duplicate.name } : null };
}

export async function getLead(orgId: Types.ObjectId, auth: AuthContext, id: string) {
  const lead = await findScoped(Lead, id, orgId, {
    populate: [
      { path: 'courseId', select: 'title code price' },
      { path: 'assignedCounselorId', select: 'name email phone' },
      { path: 'convertedStudentId', select: 'name studentCode' },
    ],
    notFoundMessage: 'Lead not found',
  }) as ILead & { assignedCounselorId?: { _id: Types.ObjectId } };

  if (auth.role === 'COUNSELOR' && lead.assignedCounselorId && String((lead.assignedCounselorId as { _id: Types.ObjectId })._id) !== String(auth.userId)) {
    throw ApiError.forbidden('This lead is assigned to another counselor');
  }

  const [activities, followUps] = await Promise.all([
    LeadActivity.find({ organizationId: orgId, leadId: lead._id }).sort({ occurredAt: -1 }).limit(100).lean(),
    FollowUp.find({ organizationId: orgId, leadId: lead._id })
      .sort({ scheduledAt: -1 })
      .populate('assignedTo', 'name')
      .limit(50)
      .lean(),
  ]);

  return { lead, activities, followUps };
}

export async function updateLead(orgId: Types.ObjectId, auth: AuthContext, id: string, input: Record<string, unknown>) {
  const existing = await Lead.findOne({ _id: id, organizationId: orgId });
  if (!existing) throw ApiError.notFound('Lead not found');
  if (auth.role === 'COUNSELOR' && existing.assignedCounselorId && String(existing.assignedCounselorId) !== String(auth.userId)) {
    throw ApiError.forbidden('This lead is assigned to another counselor');
  }

  if (input.courseId) await assertBelongsToOrg(Course, input.courseId as string, orgId, 'Course');
  if (input.assignedCounselorId) {
    const u = await User.exists({ _id: input.assignedCounselorId as string, organizationId: orgId });
    if (!u) throw ApiError.notFound('Counselor not found in your academy');
  }

  const prevStatus = existing.status;
  Object.entries(input).forEach(([k, v]) => {
    if (v === undefined) return;
    if (k === 'expectedJoiningDate') {
      (existing as never as Record<string, unknown>)[k] = v ? new Date(v as string) : undefined;
    } else if ((k === 'courseId' || k === 'assignedCounselorId') && v === '') {
      (existing as never as Record<string, unknown>)[k] = undefined;
    } else {
      (existing as never as Record<string, unknown>)[k] = v;
    }
  });
  await existing.save();

  if (input.status && input.status !== prevStatus) {
    await LeadActivity.create({
      organizationId: orgId,
      leadId: existing._id,
      type: 'STATUS_CHANGE',
      title: `Status changed to ${input.status}`,
      fromStatus: prevStatus,
      toStatus: input.status as string,
      performedBy: auth.userId,
      performedByName: auth.name,
    });
  }
  return existing.toObject();
}

export async function changeStatus(orgId: Types.ObjectId, auth: AuthContext, id: string, status: string, note?: string, lostReason?: string) {
  const lead = await Lead.findOne({ _id: id, organizationId: orgId });
  if (!lead) throw ApiError.notFound('Lead not found');
  if (auth.role === 'COUNSELOR' && lead.assignedCounselorId && String(lead.assignedCounselorId) !== String(auth.userId)) {
    throw ApiError.forbidden('This lead is assigned to another counselor');
  }
  if (lead.status === 'ADMITTED') throw ApiError.conflict('This lead has already been converted to a student');

  const from = lead.status;
  lead.status = status as never;
  if (status === 'LOST') lead.lostReason = lostReason;
  if (['CONTACTED', 'COUNSELLING', 'DEMO'].includes(status)) lead.lastContactedAt = new Date();
  await lead.save();

  await LeadActivity.create({
    organizationId: orgId,
    leadId: lead._id,
    type: 'STATUS_CHANGE',
    title: `Moved from ${from} to ${status}`,
    description: note,
    fromStatus: from,
    toStatus: status,
    performedBy: auth.userId,
    performedByName: auth.name,
  });
  return lead.toObject();
}

export async function addActivity(orgId: Types.ObjectId, auth: AuthContext, leadId: string, input: Record<string, unknown>) {
  const lead = await Lead.findOne({ _id: leadId, organizationId: orgId });
  if (!lead) throw ApiError.notFound('Lead not found');

  const activity = await LeadActivity.create({
    organizationId: orgId,
    leadId: lead._id,
    type: input.type as never,
    title: input.title as string,
    description: input.description as string,
    outcome: input.outcome as string,
    durationMinutes: input.durationMinutes as number,
    occurredAt: input.occurredAt ? new Date(input.occurredAt as string) : new Date(),
    performedBy: auth.userId,
    performedByName: auth.name,
  });

  if (['CALL', 'MEETING', 'WHATSAPP', 'EMAIL', 'SMS'].includes(input.type as string)) {
    lead.lastContactedAt = new Date();
    await lead.save();
  }
  return activity.toObject();
}

export async function assignLead(orgId: Types.ObjectId, auth: AuthContext, id: string, counselorId: string) {
  const counselor = await User.findOne({ _id: counselorId, organizationId: orgId }).lean();
  if (!counselor) throw ApiError.notFound('Counselor not found in your academy');
  if (!['COUNSELOR', 'ORGANIZATION_ADMIN', 'STAFF'].includes(counselor.role)) {
    throw ApiError.validation('Leads can only be assigned to counselors, staff or admins');
  }
  const lead = await Lead.findOneAndUpdate(
    { _id: id, organizationId: orgId },
    { assignedCounselorId: counselor._id },
    { new: true },
  ).lean();
  if (!lead) throw ApiError.notFound('Lead not found');

  await LeadActivity.create({
    organizationId: orgId,
    leadId: lead._id,
    type: 'ASSIGNMENT',
    title: `Assigned to ${counselor.name}`,
    performedBy: auth.userId,
    performedByName: auth.name,
  });
  return lead;
}

export async function deleteLead(orgId: Types.ObjectId, id: string) {
  const lead = await Lead.findOne({ _id: id, organizationId: orgId });
  if (!lead) throw ApiError.notFound('Lead not found');
  if (lead.convertedStudentId) throw ApiError.conflict('Converted leads cannot be deleted — they are part of the admission record');
  await Promise.all([
    Lead.deleteOne({ _id: lead._id, organizationId: orgId }),
    LeadActivity.deleteMany({ leadId: lead._id, organizationId: orgId }),
    FollowUp.deleteMany({ leadId: lead._id, organizationId: orgId }),
  ]);
  return { id };
}

export async function leadStats(orgId: Types.ObjectId, auth: AuthContext) {
  const base = { organizationId: orgId, ...visibilityFilter(auth) };
  const monthStart = dayjs().startOf('month').toDate();

  const [byStatus, bySource, total, thisMonth, converted, lost] = await Promise.all([
    Lead.aggregate<{ _id: string; count: number }>([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Lead.aggregate<{ _id: string; count: number }>([{ $match: base }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
    Lead.countDocuments(base),
    Lead.countDocuments({ ...base, createdAt: { $gte: monthStart } }),
    Lead.countDocuments({ ...base, status: 'ADMITTED' }),
    Lead.countDocuments({ ...base, status: 'LOST' }),
  ]);

  return {
    total,
    thisMonth,
    converted,
    lost,
    conversionRate: total ? Math.round((converted / total) * 1000) / 10 : 0,
    byStatus: LEAD_STATUSES.map((s) => ({ status: s, count: byStatus.find((b) => b._id === s)?.count ?? 0 })),
    bySource: bySource.map((s) => ({ source: s._id, count: s.count })),
  };
}
