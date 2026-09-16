import { Request, Response } from 'express';
import { asyncHandler, ok, created, paginated } from '../utils/http';
import { requireAuth, requireOrg } from '../middleware/auth';
import * as financeService from '../services/finance.service';
import { recordAudit } from '../services/audit.service';
import { FeePlan, FeeInstallment, Payment, Invoice, Receipt, Student } from '../models';
import { listScoped } from '../services/crud.factory';
import { ApiError } from '../utils/ApiError';
import { toObjectId } from '../utils/ids';
import { dateRangeFilter } from '../utils/query';
import { getPaymentProvider, paymentGatewayStatus } from '../services/payments';

export const summary = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await financeService.financeSummary(requireOrg(req)));
});

/* --------------------------------- Fee plans -------------------------------- */

export const listFeePlans = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number };
  const { items, total } = await financeService.listFeePlans(requireOrg(req), q as never);
  return paginated(res, items, total, q.page, q.limit);
});

export const createFeePlan = asyncHandler(async (req: Request, res: Response) => {
  const plan = await financeService.createFeePlan(requireOrg(req), requireAuth(req), req.body);
  await recordAudit(req, { action: 'FEEPLAN_CREATED', entity: 'FeePlan', entityId: plan._id, metadata: { net: plan.netAmount } });
  return created(res, plan);
});

export const getFeePlan = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await financeService.feePlanDetail(requireOrg(req), req.params.id));
});

export const updateFeePlan = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const plan = await FeePlan.findOne({ _id: req.params.id, organizationId: orgId });
  if (!plan) throw ApiError.notFound('Fee plan not found');
  if (req.body.discountAmount !== undefined) {
    const net = Math.max(0, plan.totalAmount - req.body.discountAmount);
    if (net < plan.paidAmount) {
      throw ApiError.validation(`Net fee cannot be lower than the ${plan.paidAmount} already paid`, { discountAmount: 'Discount too high' });
    }
    plan.discountAmount = req.body.discountAmount;
    plan.netAmount = net;
    plan.pendingAmount = Math.max(0, net - plan.paidAmount);
  }
  if (req.body.title !== undefined) plan.title = req.body.title;
  if (req.body.notes !== undefined) plan.notes = req.body.notes;
  if (req.body.status !== undefined) plan.status = req.body.status;
  await plan.save();
  await recordAudit(req, { action: 'FEEPLAN_UPDATED', entity: 'FeePlan', entityId: plan._id });
  return ok(res, plan.toObject());
});

export const deleteFeePlan = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const plan = await FeePlan.findOne({ _id: req.params.id, organizationId: orgId });
  if (!plan) throw ApiError.notFound('Fee plan not found');
  if (plan.paidAmount > 0) {
    plan.status = 'CANCELLED';
    await plan.save();
    return ok(res, { cancelled: true, id: req.params.id, message: 'Fee plan cancelled (payments already recorded)' });
  }
  await Promise.all([
    FeeInstallment.deleteMany({ organizationId: orgId, feePlanId: plan._id }),
    FeePlan.deleteOne({ _id: plan._id, organizationId: orgId }),
  ]);
  await recordAudit(req, { action: 'FEEPLAN_DELETED', entity: 'FeePlan', entityId: req.params.id });
  return ok(res, { cancelled: false, id: req.params.id });
});

/* ------------------------------- Installments ------------------------------- */

export const listInstallments = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; bucket: string };
  const { items, total } = await financeService.listInstallments(requireOrg(req), q as never);
  return paginated(res, items, total, q.page, q.limit);
});

export const updateInstallment = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const inst = await FeeInstallment.findOne({ _id: req.params.id, organizationId: orgId });
  if (!inst) throw ApiError.notFound('Installment not found');
  if (req.body.amount !== undefined && req.body.amount < inst.paidAmount) {
    throw ApiError.validation(`Amount cannot be lower than the ${inst.paidAmount} already paid`, { amount: 'Too low' });
  }
  if (req.body.dueDate) inst.dueDate = new Date(req.body.dueDate);
  if (req.body.amount !== undefined) inst.amount = req.body.amount;
  if (req.body.lateFee !== undefined) inst.lateFee = req.body.lateFee;
  if (req.body.status) inst.status = req.body.status;
  await inst.save();
  await recordAudit(req, { action: 'INSTALLMENT_UPDATED', entity: 'FeeInstallment', entityId: inst._id });
  return ok(res, inst.toObject());
});

/* --------------------------------- Payments --------------------------------- */

export const listPayments = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number };
  const { items, total } = await financeService.listPayments(requireOrg(req), q as never);
  return paginated(res, items, total, q.page, q.limit);
});

export const recordPayment = asyncHandler(async (req: Request, res: Response) => {
  const result = await financeService.recordPayment(requireOrg(req), requireAuth(req), req.body);
  await recordAudit(req, {
    action: 'PAYMENT_RECORDED', entity: 'Payment', entityId: result.payment._id,
    metadata: { amount: result.payment.amount, method: result.payment.method, receipt: result.receipt.receiptNumber },
  });
  return created(res, result);
});

export const getPayment = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const payment = await Payment.findOne({ _id: req.params.id, organizationId: orgId })
    .populate('studentId', 'name studentCode phone email')
    .populate('courseId', 'title code')
    .lean();
  if (!payment) throw ApiError.notFound('Payment not found');
  const [invoice, receipt] = await Promise.all([
    payment.invoiceId ? Invoice.findOne({ _id: payment.invoiceId, organizationId: orgId }).lean() : null,
    payment.receiptId ? Receipt.findOne({ _id: payment.receiptId, organizationId: orgId }).lean() : null,
  ]);
  return ok(res, { payment, invoice, receipt });
});

export const refundPayment = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const payment = await Payment.findOne({ _id: req.params.id, organizationId: orgId });
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.status === 'REFUNDED') throw ApiError.conflict('This payment has already been refunded');

  payment.status = 'REFUNDED';
  await payment.save();

  const plan = await FeePlan.findOne({ _id: payment.feePlanId, organizationId: orgId });
  if (plan) {
    plan.paidAmount = Math.max(0, plan.paidAmount - payment.amount);
    plan.pendingAmount = Math.max(0, plan.netAmount - plan.paidAmount);
    if (plan.status === 'COMPLETED' && plan.pendingAmount > 0) plan.status = 'ACTIVE';
    await plan.save();
  }
  if (payment.installmentId) {
    const inst = await FeeInstallment.findOne({ _id: payment.installmentId, organizationId: orgId });
    if (inst) {
      inst.paidAmount = Math.max(0, inst.paidAmount - payment.amount);
      inst.status = inst.paidAmount <= 0 ? 'PENDING' : 'PARTIAL';
      inst.paidAt = undefined;
      await inst.save();
    }
  }
  if (payment.invoiceId) await Invoice.updateOne({ _id: payment.invoiceId, organizationId: orgId }, { status: 'CANCELLED' });

  await recordAudit(req, { action: 'PAYMENT_REFUNDED', entity: 'Payment', entityId: payment._id, metadata: { amount: payment.amount } });
  return ok(res, payment.toObject());
});

/* ---------------------------- Invoices / receipts ---------------------------- */

export const listInvoices = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; studentId?: string; status?: string; from?: string; to?: string; sort?: string; order?: 'asc' | 'desc' };
  const filter: Record<string, unknown> = {};
  if (q.studentId) filter.studentId = toObjectId(q.studentId);
  if (q.status) filter.status = q.status;
  const range = dateRangeFilter(q.from, q.to);
  if (range) filter.issuedAt = range;

  const { items, total } = await listScoped(Invoice, {
    organizationId: requireOrg(req), page: q.page, limit: q.limit, search: q.search, sort: q.sort ?? 'issuedAt', order: q.order ?? 'desc',
    searchFields: ['invoiceNumber'], filter,
    populate: [{ path: 'studentId', select: 'name studentCode' }, { path: 'courseId', select: 'title' }],
    defaultSort: 'issuedAt',
  });
  return paginated(res, items, total, q.page, q.limit);
});

export const getInvoice = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await financeService.invoiceDocument(requireOrg(req), req.params.id));
});

export const listReceipts = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; studentId?: string; from?: string; to?: string; sort?: string; order?: 'asc' | 'desc' };
  const filter: Record<string, unknown> = {};
  if (q.studentId) filter.studentId = toObjectId(q.studentId);
  const range = dateRangeFilter(q.from, q.to);
  if (range) filter.issuedAt = range;

  const { items, total } = await listScoped(Receipt, {
    organizationId: requireOrg(req), page: q.page, limit: q.limit, search: q.search, sort: q.sort ?? 'issuedAt', order: q.order ?? 'desc',
    searchFields: ['receiptNumber'], filter,
    populate: [{ path: 'studentId', select: 'name studentCode' }, { path: 'courseId', select: 'title' }],
    defaultSort: 'issuedAt',
  });
  return paginated(res, items, total, q.page, q.limit);
});

export const getReceipt = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await financeService.receiptDocument(requireOrg(req), req.params.id));
});

/* ------------------------------ Online payments ------------------------------ */

export const gatewayStatus = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, paymentGatewayStatus());
});

export const createOnlineOrder = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const plan = await FeePlan.findOne({ _id: req.body.feePlanId, organizationId: orgId }).lean();
  if (!plan) throw ApiError.notFound('Fee plan not found');

  // Students may only pay their own fee plans.
  if (auth.role === 'STUDENT' && String(plan.studentId) !== String(auth.studentId)) {
    throw ApiError.forbidden('You can only pay your own fees');
  }
  // Parents may only pay for a child actually linked to them.
  if (auth.role === 'PARENT') {
    const child = await Student.findOne({
      _id: plan.studentId,
      organizationId: orgId,
      guardianId: auth.parentId,
    }).select('_id').lean();
    if (!child) throw ApiError.forbidden('You can only pay fees for your own children');
  }
  const outstanding = plan.netAmount - plan.paidAmount;
  if (req.body.amount > outstanding + 0.5) {
    throw ApiError.validation(`Amount exceeds the outstanding balance of ${outstanding}`, { amount: 'Too high' });
  }

  const provider = getPaymentProvider();
  const order = await provider.createOrder({
    amount: req.body.amount,
    currency: 'INR',
    receipt: `FEEPLAN-${String(plan._id).slice(-8)}`,
    notes: { organizationId: String(orgId), feePlanId: String(plan._id) },
  });
  await recordAudit(req, { action: 'ONLINE_ORDER_CREATED', entity: 'Payment', metadata: { orderId: order.orderId, amount: req.body.amount } });
  return created(res, order);
});
