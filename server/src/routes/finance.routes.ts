import { Router } from 'express';
import * as c from '../controllers/finance.controller';
import { validate } from '../middleware/validate';
import { requirePermission, requireAnyPermission } from '../middleware/auth';
import { idParamSchema } from '../utils/query';
import {
  createFeePlanSchema, updateFeePlanSchema, feePlanQuerySchema,
  installmentQuerySchema, updateInstallmentSchema,
  recordPaymentSchema, paymentQuerySchema, invoiceQuerySchema, createOnlineOrderSchema,
} from '../validators/finance.validators';

const router = Router();

router.get('/summary', requirePermission('payment:read'), c.summary);
router.get('/gateway-status', requireAnyPermission('payment:read', 'payment:self'), c.gatewayStatus);

/* --------------------------------- Fee plans -------------------------------- */
router.get('/fee-plans', requirePermission('feeplan:read'), validate({ query: feePlanQuerySchema }), c.listFeePlans);
router.post('/fee-plans', requirePermission('feeplan:create'), validate({ body: createFeePlanSchema }), c.createFeePlan);
router.get('/fee-plans/:id', requirePermission('feeplan:read'), validate({ params: idParamSchema }), c.getFeePlan);
router.patch('/fee-plans/:id', requirePermission('feeplan:update'), validate({ params: idParamSchema, body: updateFeePlanSchema }), c.updateFeePlan);
router.delete('/fee-plans/:id', requirePermission('feeplan:delete'), validate({ params: idParamSchema }), c.deleteFeePlan);

/* ------------------------------- Installments ------------------------------- */
router.get('/installments', requirePermission('feeplan:read'), validate({ query: installmentQuerySchema }), c.listInstallments);
router.patch('/installments/:id', requirePermission('feeplan:update'), validate({ params: idParamSchema, body: updateInstallmentSchema }), c.updateInstallment);

/* --------------------------------- Payments --------------------------------- */
router.get('/payments', requirePermission('payment:read'), validate({ query: paymentQuerySchema }), c.listPayments);
router.post('/payments', requirePermission('payment:create'), validate({ body: recordPaymentSchema }), c.recordPayment);
router.get('/payments/:id', requirePermission('payment:read'), validate({ params: idParamSchema }), c.getPayment);
router.post('/payments/:id/refund', requirePermission('payment:update'), validate({ params: idParamSchema }), c.refundPayment);

/* ---------------------------- Invoices / receipts ---------------------------- */
router.get('/invoices', requirePermission('invoice:read'), validate({ query: invoiceQuerySchema }), c.listInvoices);
router.get('/invoices/:id', requirePermission('invoice:read'), validate({ params: idParamSchema }), c.getInvoice);
router.get('/receipts', requirePermission('receipt:read'), validate({ query: invoiceQuerySchema }), c.listReceipts);
router.get('/receipts/:id', requirePermission('receipt:read'), validate({ params: idParamSchema }), c.getReceipt);

/* ------------------------------ Online payments ------------------------------ */
router.post('/online/order', requireAnyPermission('payment:create', 'payment:self'), validate({ body: createOnlineOrderSchema }), c.createOnlineOrder);

export default router;
