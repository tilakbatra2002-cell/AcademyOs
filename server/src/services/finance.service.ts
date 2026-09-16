import { Types, FilterQuery } from 'mongoose';
import dayjs from 'dayjs';
import {
  FeePlan, IFeePlan, FeeInstallment, IFeeInstallment, Payment, IPayment, Invoice, Receipt,
  Student, Course, Batch, Organization,
} from '../models';
import { withTransaction } from '../config/db';
import { ApiError } from '../utils/ApiError';
import { listScoped, assertBelongsToOrg } from './crud.factory';
import { generateInvoiceNumber, generateReceiptNumber } from './counter.service';
import { dateRangeFilter } from '../utils/query';
import { AuthContext } from '../types/express';
import { notify } from './notification.service';
import { User } from '../models/User';

export async function createFeePlan(orgId: Types.ObjectId, auth: AuthContext, input: Record<string, unknown>) {
  await assertBelongsToOrg(Student, input.studentId as string, orgId, 'Student');
  await assertBelongsToOrg(Course, input.courseId as string, orgId, 'Course');
  if (input.batchId) await assertBelongsToOrg(Batch, input.batchId as string, orgId, 'Batch');

  const total = input.totalAmount as number;
  const discount = (input.discountAmount as number) ?? 0;
  const net = Math.max(0, total - discount);
  const installments = input.installments as { title?: string; amount: number; dueDate: string }[];
  const sum = installments.reduce((a, i) => a + i.amount, 0);
  if (Math.abs(sum - net) > 1) {
    throw ApiError.validation(`Installments total ${sum} but the net fee is ${net}`, { installments: 'Must equal the net fee' });
  }

  return withTransaction(async (session) => {
    const opts = session ? { session, ordered: true as const } : { ordered: true as const };
    const [plan] = await FeePlan.create(
      [{
        organizationId: orgId,
        studentId: input.studentId,
        courseId: input.courseId,
        batchId: input.batchId || undefined,
        title: (input.title as string) || 'Fee plan',
        totalAmount: total,
        discountAmount: discount,
        netAmount: net,
        paidAmount: 0,
        pendingAmount: net,
        status: 'ACTIVE',
        startDate: input.startDate ? new Date(input.startDate as string) : new Date(),
        notes: input.notes,
        createdBy: auth.userId,
      }],
      opts,
    );

    await FeeInstallment.create(
      installments.map((inst, idx) => ({
        organizationId: orgId,
        feePlanId: plan._id,
        studentId: input.studentId,
        courseId: input.courseId,
        sequence: idx + 1,
        title: inst.title || `Installment ${idx + 1}`,
        amount: inst.amount,
        dueDate: new Date(inst.dueDate),
        status: 'PENDING',
      })),
      opts,
    );

    return plan.toObject();
  });
}

export async function listFeePlans(
  orgId: Types.ObjectId,
  params: { page: number; limit: number; search?: string; sort?: string; order?: 'asc' | 'desc'; studentId?: string; courseId?: string; status?: string },
) {
  const filter: FilterQuery<IFeePlan> = {};
  if (params.studentId) filter.studentId = new Types.ObjectId(params.studentId);
  if (params.courseId) filter.courseId = new Types.ObjectId(params.courseId);
  if (params.status) filter.status = params.status as never;

  return listScoped(FeePlan, {
    organizationId: orgId,
    page: params.page, limit: params.limit, sort: params.sort, order: params.order, search: params.search,
    searchFields: ['title'],
    filter,
    populate: [
      { path: 'studentId', select: 'name studentCode phone' },
      { path: 'courseId', select: 'title code' },
      { path: 'batchId', select: 'name code' },
    ],
  });
}

export async function feePlanDetail(orgId: Types.ObjectId, id: string) {
  const plan = await FeePlan.findOne({ _id: id, organizationId: orgId })
    .populate('studentId', 'name studentCode phone email')
    .populate('courseId', 'title code')
    .populate('batchId', 'name code')
    .lean();
  if (!plan) throw ApiError.notFound('Fee plan not found');

  const [installments, payments, invoices, receipts] = await Promise.all([
    FeeInstallment.find({ organizationId: orgId, feePlanId: plan._id }).sort({ sequence: 1 }).lean(),
    Payment.find({ organizationId: orgId, feePlanId: plan._id }).sort({ paidAt: -1 }).lean(),
    Invoice.find({ organizationId: orgId, feePlanId: plan._id }).sort({ issuedAt: -1 }).lean(),
    Receipt.find({ organizationId: orgId, studentId: plan.studentId }).sort({ issuedAt: -1 }).limit(50).lean(),
  ]);
  return { plan, installments, payments, invoices, receipts };
}

export async function listInstallments(
  orgId: Types.ObjectId,
  params: { page: number; limit: number; search?: string; sort?: string; order?: 'asc' | 'desc'; studentId?: string; feePlanId?: string; status?: string; bucket: string; from?: string; to?: string },
) {
  const filter: FilterQuery<IFeeInstallment> = {};
  if (params.studentId) filter.studentId = new Types.ObjectId(params.studentId);
  if (params.feePlanId) filter.feePlanId = new Types.ObjectId(params.feePlanId);
  if (params.status) filter.status = params.status as never;

  const today = dayjs().startOf('day').toDate();
  if (params.bucket === 'overdue') {
    filter.status = { $in: ['PENDING', 'PARTIAL'] } as never;
    filter.dueDate = { $lt: today } as never;
  } else if (params.bucket === 'due') {
    filter.status = { $in: ['PENDING', 'PARTIAL'] } as never;
    filter.dueDate = { $gte: today, $lte: dayjs().add(7, 'day').endOf('day').toDate() } as never;
  } else if (params.bucket === 'upcoming') {
    filter.status = { $in: ['PENDING', 'PARTIAL'] } as never;
    filter.dueDate = { $gt: dayjs().add(7, 'day').endOf('day').toDate() } as never;
  } else if (params.bucket === 'paid') {
    filter.status = 'PAID' as never;
  }
  const range = dateRangeFilter(params.from, params.to);
  if (range && params.bucket === 'all') filter.dueDate = range as never;

  return listScoped(FeeInstallment, {
    organizationId: orgId,
    page: params.page, limit: params.limit, sort: params.sort ?? 'dueDate', order: params.order ?? 'asc',
    search: params.search, searchFields: ['title'],
    filter,
    populate: [
      { path: 'studentId', select: 'name studentCode phone' },
      { path: 'courseId', select: 'title code' },
    ],
    defaultSort: 'dueDate',
  });
}

/**
 * Records a payment transactionally:
 * Payment -> Installment allocation -> FeePlan totals -> Invoice -> Receipt.
 * Rejects negative amounts and overpayment.
 */
export async function recordPayment(orgId: Types.ObjectId, auth: AuthContext, input: Record<string, unknown>) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.validation('Payment amount must be greater than zero', { amount: 'Invalid amount' });
  }

  const plan = await FeePlan.findOne({ _id: input.feePlanId as string, organizationId: orgId }).lean();
  if (!plan) throw ApiError.notFound('Fee plan not found');
  if (String(plan.studentId) !== String(input.studentId)) {
    throw ApiError.validation('This fee plan does not belong to the selected student', { feePlanId: 'Student mismatch' });
  }
  if (plan.status === 'CANCELLED') throw ApiError.conflict('This fee plan has been cancelled');

  const outstanding = plan.netAmount - plan.paidAmount;
  if (amount > outstanding + 0.5) {
    throw ApiError.validation(
      `Payment of ${amount} exceeds the outstanding balance of ${outstanding}. Adjust the amount or the fee plan.`,
      { amount: 'Exceeds outstanding balance' },
    );
  }

  let targetInstallment: (Pick<IFeeInstallment, '_id' | 'amount' | 'paidAmount' | 'status' | 'title' | 'sequence' | 'dueDate'>) | null = null;
  if (input.installmentId) {
    targetInstallment = await FeeInstallment.findOne({
      _id: input.installmentId as string, organizationId: orgId, feePlanId: plan._id,
    }).lean();
    if (!targetInstallment) throw ApiError.notFound('Installment not found in this fee plan');
    if (targetInstallment.status === 'PAID') throw ApiError.conflict('This installment is already fully paid');
    const remaining = targetInstallment.amount - targetInstallment.paidAmount;
    if (amount > remaining + 0.5) {
      throw ApiError.validation(
        `Amount exceeds the ${remaining} remaining on this installment. Leave the installment blank to auto-allocate across installments.`,
        { amount: 'Exceeds installment balance' },
      );
    }
  }

  return withTransaction(async (session) => {
    const opts = session ? { session, ordered: true as const } : { ordered: true as const };

    const installments = await FeeInstallment.find({ organizationId: orgId, feePlanId: plan._id })
      .sort({ sequence: 1 })
      .session(session ?? null);

    let remaining = amount;
    const affected: IFeeInstallment[] = [];
    const queue = targetInstallment
      ? installments.filter((i) => String(i._id) === String(targetInstallment!._id))
      : installments.filter((i) => i.status !== 'PAID' && i.status !== 'WAIVED');

    for (const inst of queue) {
      if (remaining <= 0) break;
      const due = inst.amount - inst.paidAmount;
      if (due <= 0) continue;
      const applied = Math.min(due, remaining);
      inst.paidAmount += applied;
      inst.status = inst.paidAmount >= inst.amount - 0.01 ? 'PAID' : 'PARTIAL';
      if (inst.status === 'PAID') inst.paidAt = new Date();
      await inst.save({ session });
      affected.push(inst);
      remaining -= applied;
    }

    const primaryInstallment = affected[0] ?? null;
    const paidAt = input.paidAt ? new Date(input.paidAt as string) : new Date();
    const paymentNumber = `PAY-${dayjs(paidAt).format('YYYYMMDD')}-${String(Date.now()).slice(-6)}`;
    const invoiceNumber = await generateInvoiceNumber(orgId, session);
    const receiptNumber = await generateReceiptNumber(orgId, session);

    const course = await Course.findById(plan.courseId).select('title').session(session ?? null).lean();

    const [invoice] = await Invoice.create(
      [{
        organizationId: orgId,
        invoiceNumber,
        studentId: plan.studentId,
        feePlanId: plan._id,
        installmentId: primaryInstallment?._id,
        courseId: plan.courseId,
        items: [{
          description: primaryInstallment
            ? `${course?.title ?? 'Course'} — ${primaryInstallment.title}`
            : `${course?.title ?? 'Course'} — fee payment`,
          amount, quantity: 1,
        }],
        subtotal: amount, discount: 0, tax: 0, total: amount, amountPaid: amount,
        status: 'PAID', issuedAt: paidAt, createdBy: auth.userId,
      }],
      opts,
    );

    const [payment] = await Payment.create(
      [{
        organizationId: orgId,
        paymentNumber,
        studentId: plan.studentId,
        feePlanId: plan._id,
        installmentId: primaryInstallment?._id,
        courseId: plan.courseId,
        amount,
        method: input.method,
        transactionId: input.transactionId || undefined,
        gateway: 'manual',
        status: 'SUCCESS',
        paidAt,
        receivedBy: auth.userId,
        receivedByName: auth.name,
        invoiceId: invoice._id,
        notes: input.notes,
      }],
      opts,
    );

    const [receipt] = await Receipt.create(
      [{
        organizationId: orgId,
        receiptNumber,
        paymentId: payment._id,
        invoiceId: invoice._id,
        studentId: plan.studentId,
        courseId: plan.courseId,
        amount,
        method: input.method as string,
        issuedAt: paidAt,
        issuedBy: auth.userId,
        issuedByName: auth.name,
      }],
      opts,
    );

    payment.receiptId = receipt._id;
    await payment.save({ session });

    const planDoc = await FeePlan.findById(plan._id).session(session ?? null);
    if (planDoc) {
      planDoc.paidAmount += amount;
      planDoc.pendingAmount = Math.max(0, planDoc.netAmount - planDoc.paidAmount);
      if (planDoc.pendingAmount <= 0.5) planDoc.status = 'COMPLETED';
      await planDoc.save({ session });
    }

    return {
      payment: payment.toObject(),
      invoice: invoice.toObject(),
      receipt: receipt.toObject(),
      installmentsUpdated: affected.map((a) => ({ id: String(a._id), title: a.title, status: a.status, paidAmount: a.paidAmount })),
      planPaid: (planDoc?.paidAmount ?? 0),
      planPending: (planDoc?.pendingAmount ?? 0),
    };
  }).then(async (result) => {
    const student = await Student.findById(plan.studentId).select('userId name').lean();
    if (student?.userId) {
      await notify({
        organizationId: orgId,
        userId: student.userId,
        type: 'PAYMENT',
        title: 'Payment received',
        message: `We received your payment of ${result.payment.amount}. Receipt ${result.receipt.receiptNumber}.`,
        link: '/student/fees',
        entity: 'Payment',
        entityId: String(result.payment._id),
      });
      const parent = await User.findOne({ organizationId: orgId, role: 'PARENT', parentId: { $exists: true } }).lean();
      void parent;
    }
    return result;
  });
}

export async function listPayments(
  orgId: Types.ObjectId,
  params: { page: number; limit: number; search?: string; sort?: string; order?: 'asc' | 'desc'; studentId?: string; method?: string; status?: string; from?: string; to?: string },
) {
  const filter: FilterQuery<IPayment> = {};
  if (params.studentId) filter.studentId = new Types.ObjectId(params.studentId);
  if (params.method) filter.method = params.method as never;
  if (params.status) filter.status = params.status as never;
  const range = dateRangeFilter(params.from, params.to);
  if (range) filter.paidAt = range as never;

  return listScoped(Payment, {
    organizationId: orgId,
    page: params.page, limit: params.limit, sort: params.sort ?? 'paidAt', order: params.order ?? 'desc',
    search: params.search, searchFields: ['paymentNumber', 'transactionId', 'notes'],
    filter,
    populate: [
      { path: 'studentId', select: 'name studentCode phone' },
      { path: 'courseId', select: 'title code' },
    ],
    defaultSort: 'paidAt',
  });
}

export async function financeSummary(orgId: Types.ObjectId) {
  const monthStart = dayjs().startOf('month').toDate();
  const today = dayjs().startOf('day').toDate();

  const [collectedAgg, monthAgg, planAgg, overdueAgg, methodAgg, monthlySeries] = await Promise.all([
    Payment.aggregate<{ total: number }>([
      { $match: { organizationId: orgId, status: 'SUCCESS' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate<{ total: number }>([
      { $match: { organizationId: orgId, status: 'SUCCESS', paidAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    FeePlan.aggregate<{ net: number; paid: number; pending: number }>([
      { $match: { organizationId: orgId, status: { $ne: 'CANCELLED' } } },
      { $group: { _id: null, net: { $sum: '$netAmount' }, paid: { $sum: '$paidAmount' }, pending: { $sum: '$pendingAmount' } } },
    ]),
    FeeInstallment.aggregate<{ total: number; count: number }>([
      { $match: { organizationId: orgId, status: { $in: ['PENDING', 'PARTIAL'] }, dueDate: { $lt: today } } },
      { $group: { _id: null, total: { $sum: { $subtract: ['$amount', '$paidAmount'] } }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate<{ _id: string; total: number; count: number }>([
      { $match: { organizationId: orgId, status: 'SUCCESS' } },
      { $group: { _id: '$method', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate<{ _id: { y: number; m: number }; total: number }>([
      { $match: { organizationId: orgId, status: 'SUCCESS', paidAt: { $gte: dayjs().subtract(11, 'month').startOf('month').toDate() } } },
      { $group: { _id: { y: { $year: '$paidAt' }, m: { $month: '$paidAt' } }, total: { $sum: '$amount' } } },
    ]),
  ]);

  return {
    collected: collectedAgg[0]?.total ?? 0,
    collectedThisMonth: monthAgg[0]?.total ?? 0,
    totalFees: planAgg[0]?.net ?? 0,
    pending: planAgg[0]?.pending ?? 0,
    overdue: overdueAgg[0]?.total ?? 0,
    overdueCount: overdueAgg[0]?.count ?? 0,
    byMethod: methodAgg.map((m) => ({ method: m._id, total: m.total, count: m.count })),
    revenueSeries: Array.from({ length: 12 }, (_, i) => {
      const d = dayjs().subtract(11 - i, 'month');
      const found = monthlySeries.find((r) => r._id.y === d.year() && r._id.m === d.month() + 1);
      return { month: d.format('MMM YY'), revenue: found?.total ?? 0 };
    }),
  };
}

/** Printable invoice/receipt payload including academy branding. */
export async function invoiceDocument(orgId: Types.ObjectId, invoiceId: string) {
  const invoice = await Invoice.findOne({ _id: invoiceId, organizationId: orgId })
    .populate('studentId', 'name studentCode phone email address')
    .populate('courseId', 'title code')
    .lean();
  if (!invoice) throw ApiError.notFound('Invoice not found');
  const [org, payment] = await Promise.all([
    Organization.findById(orgId).lean(),
    Payment.findOne({ organizationId: orgId, invoiceId: invoice._id }).lean(),
  ]);
  return { invoice, organization: org, payment };
}

export async function receiptDocument(orgId: Types.ObjectId, receiptId: string) {
  const receipt = await Receipt.findOne({ _id: receiptId, organizationId: orgId })
    .populate('studentId', 'name studentCode phone email')
    .populate('courseId', 'title code')
    .lean();
  if (!receipt) throw ApiError.notFound('Receipt not found');
  const [org, payment] = await Promise.all([
    Organization.findById(orgId).lean(),
    Payment.findById(receipt.paymentId).lean(),
  ]);
  return { receipt, organization: org, payment };
}

/** Marks past-due installments as OVERDUE (used by the scheduled job). */
export async function refreshOverdueInstallments(orgId?: Types.ObjectId) {
  const filter: Record<string, unknown> = {
    status: { $in: ['PENDING', 'PARTIAL'] },
    dueDate: { $lt: dayjs().startOf('day').toDate() },
  };
  if (orgId) filter.organizationId = orgId;
  const res = await FeeInstallment.updateMany(filter, { status: 'OVERDUE' });
  return { updated: res.modifiedCount };
}
