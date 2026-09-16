import { Types, FilterQuery } from 'mongoose';
import dayjs from 'dayjs';
import { FollowUp, IFollowUp } from '../models/FollowUp';
import { Lead, LeadActivity } from '../models/Lead';
import { Student } from '../models/Student';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { listScoped } from './crud.factory';
import { AuthContext } from '../types/express';
import { notify } from './notification.service';

function bucketFilter(bucket: string): FilterQuery<IFollowUp> {
  const todayStart = dayjs().startOf('day').toDate();
  const todayEnd = dayjs().endOf('day').toDate();
  switch (bucket) {
    case 'today':
      return { status: 'PENDING', scheduledAt: { $gte: todayStart, $lte: todayEnd } };
    case 'upcoming':
      return { status: 'PENDING', scheduledAt: { $gt: todayEnd } };
    case 'overdue':
      return { status: 'PENDING', scheduledAt: { $lt: todayStart } };
    case 'completed':
      return { status: 'COMPLETED' };
    default:
      return {};
  }
}

function visibility(auth: AuthContext): FilterQuery<IFollowUp> {
  if (auth.role === 'COUNSELOR' || auth.role === 'STAFF') return { assignedTo: auth.userId };
  return {};
}

export async function listFollowUps(
  orgId: Types.ObjectId,
  auth: AuthContext,
  params: { page: number; limit: number; sort?: string; order?: 'asc' | 'desc'; search?: string; bucket: string; status?: string; assignedTo?: string; leadId?: string; priority?: string },
) {
  const filter: FilterQuery<IFollowUp> = { ...bucketFilter(params.bucket), ...visibility(auth) };
  if (params.status) filter.status = params.status as never;
  if (params.assignedTo) filter.assignedTo = new Types.ObjectId(params.assignedTo);
  if (params.leadId) filter.leadId = new Types.ObjectId(params.leadId);
  if (params.priority) filter.priority = params.priority as never;

  return listScoped(FollowUp, {
    organizationId: orgId,
    page: params.page,
    limit: params.limit,
    sort: params.sort ?? 'scheduledAt',
    order: params.order ?? (params.bucket === 'upcoming' || params.bucket === 'today' ? 'asc' : 'desc'),
    search: params.search,
    searchFields: ['notes', 'outcome'],
    filter,
    populate: [
      { path: 'leadId', select: 'name phone status priority' },
      { path: 'studentId', select: 'name studentCode' },
      { path: 'assignedTo', select: 'name email' },
    ],
    defaultSort: 'scheduledAt',
  });
}

export async function followUpCounts(orgId: Types.ObjectId, auth: AuthContext) {
  const base = { organizationId: orgId, ...visibility(auth) };
  const [today, upcoming, overdue, completed] = await Promise.all([
    FollowUp.countDocuments({ ...base, ...bucketFilter('today') }),
    FollowUp.countDocuments({ ...base, ...bucketFilter('upcoming') }),
    FollowUp.countDocuments({ ...base, ...bucketFilter('overdue') }),
    FollowUp.countDocuments({ ...base, ...bucketFilter('completed') }),
  ]);
  return { today, upcoming, overdue, completed };
}

export async function createFollowUp(orgId: Types.ObjectId, auth: AuthContext, input: Record<string, unknown>) {
  if (!input.leadId && !input.studentId) {
    throw ApiError.validation('A follow-up must be linked to a lead or a student', { leadId: 'Select a lead or student' });
  }
  if (input.leadId) {
    const lead = await Lead.exists({ _id: input.leadId as string, organizationId: orgId });
    if (!lead) throw ApiError.notFound('Lead not found in your academy');
  }
  if (input.studentId) {
    const st = await Student.exists({ _id: input.studentId as string, organizationId: orgId });
    if (!st) throw ApiError.notFound('Student not found in your academy');
  }

  const assignedTo = input.assignedTo ? new Types.ObjectId(input.assignedTo as string) : auth.userId;
  if (input.assignedTo) {
    const u = await User.exists({ _id: assignedTo, organizationId: orgId });
    if (!u) throw ApiError.notFound('Assigned user not found in your academy');
  }

  const scheduledAt = new Date(input.scheduledAt as string);
  if (Number.isNaN(scheduledAt.getTime())) throw ApiError.validation('Invalid follow-up date', { scheduledAt: 'Invalid date' });

  const followUp = await FollowUp.create({
    organizationId: orgId,
    leadId: input.leadId || undefined,
    studentId: input.studentId || undefined,
    assignedTo,
    mode: input.mode,
    scheduledAt,
    scheduledTime: input.scheduledTime,
    priority: input.priority,
    notes: input.notes,
    createdBy: auth.userId,
  });

  if (input.leadId) {
    await Lead.updateOne({ _id: input.leadId as string, organizationId: orgId }, { nextFollowUpAt: scheduledAt });
    await LeadActivity.create({
      organizationId: orgId,
      leadId: new Types.ObjectId(input.leadId as string),
      type: 'FOLLOW_UP',
      title: `Follow-up scheduled for ${dayjs(scheduledAt).format('DD MMM YYYY')}`,
      description: input.notes as string,
      performedBy: auth.userId,
      performedByName: auth.name,
    });
  }

  if (String(assignedTo) !== String(auth.userId)) {
    await notify({
      organizationId: orgId,
      userId: assignedTo,
      type: 'FOLLOW_UP',
      title: 'New follow-up assigned',
      message: `A follow-up is scheduled for ${dayjs(scheduledAt).format('DD MMM YYYY')}`,
      link: '/admin/follow-ups',
      entity: 'FollowUp',
      entityId: String(followUp._id),
    });
  }

  return followUp.toObject();
}

export async function updateFollowUp(orgId: Types.ObjectId, auth: AuthContext, id: string, input: Record<string, unknown>) {
  const fu = await FollowUp.findOne({ _id: id, organizationId: orgId });
  if (!fu) throw ApiError.notFound('Follow-up not found');
  if ((auth.role === 'COUNSELOR' || auth.role === 'STAFF') && String(fu.assignedTo) !== String(auth.userId)) {
    throw ApiError.forbidden('This follow-up is assigned to another user');
  }

  if (input.assignedTo) {
    const u = await User.exists({ _id: input.assignedTo as string, organizationId: orgId });
    if (!u) throw ApiError.notFound('Assigned user not found in your academy');
  }

  Object.entries(input).forEach(([k, v]) => {
    if (v === undefined) return;
    if (k === 'scheduledAt') fu.scheduledAt = new Date(v as string);
    else (fu as never as Record<string, unknown>)[k] = v;
  });
  await fu.save();
  return fu.toObject();
}

export async function completeFollowUp(orgId: Types.ObjectId, auth: AuthContext, id: string, input: Record<string, unknown>) {
  const fu = await FollowUp.findOne({ _id: id, organizationId: orgId });
  if (!fu) throw ApiError.notFound('Follow-up not found');
  if ((auth.role === 'COUNSELOR' || auth.role === 'STAFF') && String(fu.assignedTo) !== String(auth.userId)) {
    throw ApiError.forbidden('This follow-up is assigned to another user');
  }
  if (fu.status === 'COMPLETED') throw ApiError.conflict('This follow-up is already completed');

  fu.status = 'COMPLETED';
  fu.outcome = input.outcome as string;
  if (input.notes) fu.notes = input.notes as string;
  fu.completedAt = new Date();
  fu.completedBy = auth.userId;
  await fu.save();

  let nextFollowUp = null;
  if (input.nextFollowUpAt) {
    nextFollowUp = await FollowUp.create({
      organizationId: orgId,
      leadId: fu.leadId,
      studentId: fu.studentId,
      assignedTo: fu.assignedTo,
      mode: fu.mode,
      scheduledAt: new Date(input.nextFollowUpAt as string),
      priority: fu.priority,
      notes: `Follow-up continued from ${dayjs(fu.scheduledAt).format('DD MMM YYYY')}`,
      createdBy: auth.userId,
    });
  }

  if (fu.leadId) {
    const lead = await Lead.findOne({ _id: fu.leadId, organizationId: orgId });
    if (lead) {
      lead.lastContactedAt = new Date();
      lead.nextFollowUpAt = nextFollowUp ? nextFollowUp.scheduledAt : undefined;
      if (input.newStatus && lead.status !== 'ADMITTED') {
        const from = lead.status;
        lead.status = input.newStatus as never;
        await LeadActivity.create({
          organizationId: orgId, leadId: lead._id, type: 'STATUS_CHANGE',
          title: `Moved from ${from} to ${input.newStatus}`, fromStatus: from, toStatus: input.newStatus as string,
          performedBy: auth.userId, performedByName: auth.name,
        });
      }
      await lead.save();
      await LeadActivity.create({
        organizationId: orgId, leadId: lead._id, type: 'FOLLOW_UP',
        title: 'Follow-up completed', description: input.outcome as string,
        outcome: input.outcome as string, performedBy: auth.userId, performedByName: auth.name,
      });
    }
  }

  return { followUp: fu.toObject(), nextFollowUp: nextFollowUp?.toObject() ?? null };
}

export async function rescheduleFollowUp(orgId: Types.ObjectId, auth: AuthContext, id: string, input: Record<string, unknown>) {
  const fu = await FollowUp.findOne({ _id: id, organizationId: orgId });
  if (!fu) throw ApiError.notFound('Follow-up not found');
  if (fu.status === 'COMPLETED') throw ApiError.conflict('Completed follow-ups cannot be rescheduled');

  fu.rescheduledFrom = fu.scheduledAt;
  fu.scheduledAt = new Date(input.scheduledAt as string);
  if (input.scheduledTime) fu.scheduledTime = input.scheduledTime as string;
  fu.status = 'RESCHEDULED';
  if (input.reason) fu.notes = `${fu.notes ?? ''}\nRescheduled: ${input.reason}`.trim();
  await fu.save();

  // Rescheduled follow-ups stay actionable
  fu.status = 'PENDING';
  await fu.save();

  if (fu.leadId) {
    await Lead.updateOne({ _id: fu.leadId, organizationId: orgId }, { nextFollowUpAt: fu.scheduledAt });
  }
  return fu.toObject();
}

export async function deleteFollowUp(orgId: Types.ObjectId, id: string) {
  const fu = await FollowUp.findOneAndDelete({ _id: id, organizationId: orgId }).lean();
  if (!fu) throw ApiError.notFound('Follow-up not found');
  return { id };
}
