import mongoose, { Schema, Document, Types } from 'mongoose';

export const FEEPLAN_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED', 'DEFAULTED'] as const;
export type FeePlanStatus = (typeof FEEPLAN_STATUSES)[number];

export interface IFeePlan extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  studentId: Types.ObjectId;
  courseId: Types.ObjectId;
  batchId?: Types.ObjectId;
  admissionId?: Types.ObjectId;
  title: string;
  totalAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  pendingAmount: number;
  status: FeePlanStatus;
  startDate: Date;
  notes?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FeePlanSchema = new Schema<IFeePlan>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch' },
    admissionId: { type: Schema.Types.ObjectId, ref: 'Admission' },
    title: { type: String, required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    netAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    pendingAmount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: FEEPLAN_STATUSES, default: 'ACTIVE', index: true },
    startDate: { type: Date, default: () => new Date() },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

FeePlanSchema.index({ organizationId: 1, studentId: 1, status: 1 });

export const FeePlan = mongoose.model<IFeePlan>('FeePlan', FeePlanSchema);

export const INSTALLMENT_STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED'] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

export interface IFeeInstallment extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  feePlanId: Types.ObjectId;
  studentId: Types.ObjectId;
  courseId: Types.ObjectId;
  sequence: number;
  title: string;
  amount: number;
  paidAmount: number;
  dueDate: Date;
  status: InstallmentStatus;
  paidAt?: Date;
  lateFee: number;
  createdAt: Date;
  updatedAt: Date;
}

const FeeInstallmentSchema = new Schema<IFeeInstallment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    feePlanId: { type: Schema.Types.ObjectId, ref: 'FeePlan', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    sequence: { type: Number, required: true },
    title: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    dueDate: { type: Date, required: true, index: true },
    status: { type: String, enum: INSTALLMENT_STATUSES, default: 'PENDING', index: true },
    paidAt: Date,
    lateFee: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

FeeInstallmentSchema.index({ organizationId: 1, status: 1, dueDate: 1 });
FeeInstallmentSchema.index({ organizationId: 1, feePlanId: 1, sequence: 1 });

export const FeeInstallment = mongoose.model<IFeeInstallment>('FeeInstallment', FeeInstallmentSchema);

export const PAYMENT_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'ONLINE', 'CHEQUE'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface IPayment extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  paymentNumber: string;
  studentId: Types.ObjectId;
  feePlanId: Types.ObjectId;
  installmentId?: Types.ObjectId;
  courseId?: Types.ObjectId;
  amount: number;
  method: PaymentMethod;
  transactionId?: string;
  gateway?: 'manual' | 'razorpay' | 'stripe';
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  paidAt: Date;
  receivedBy?: Types.ObjectId;
  receivedByName?: string;
  invoiceId?: Types.ObjectId;
  receiptId?: Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    paymentNumber: { type: String, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    feePlanId: { type: Schema.Types.ObjectId, ref: 'FeePlan', required: true, index: true },
    installmentId: { type: Schema.Types.ObjectId, ref: 'FeeInstallment', index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: PAYMENT_METHODS, required: true, index: true },
    transactionId: String,
    gateway: { type: String, enum: ['manual', 'razorpay', 'stripe'], default: 'manual' },
    gatewayOrderId: String,
    gatewayPaymentId: String,
    status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'], default: 'SUCCESS', index: true },
    paidAt: { type: Date, default: () => new Date(), index: true },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    receivedByName: String,
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    receiptId: { type: Schema.Types.ObjectId, ref: 'Receipt' },
    notes: String,
  },
  { timestamps: true },
);

PaymentSchema.index({ organizationId: 1, paidAt: -1 });
PaymentSchema.index({ organizationId: 1, paymentNumber: 1 }, { unique: true });

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);

export interface IInvoice extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  invoiceNumber: string;
  studentId: Types.ObjectId;
  feePlanId: Types.ObjectId;
  installmentId?: Types.ObjectId;
  courseId?: Types.ObjectId;
  items: { description: string; amount: number; quantity: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'PARTIAL' | 'CANCELLED' | 'OVERDUE';
  issuedAt: Date;
  dueDate?: Date;
  notes?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    invoiceNumber: { type: String, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    feePlanId: { type: Schema.Types.ObjectId, ref: 'FeePlan', required: true },
    installmentId: { type: Schema.Types.ObjectId, ref: 'FeeInstallment' },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    items: [{ description: String, amount: Number, quantity: { type: Number, default: 1 } }],
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'CANCELLED', 'OVERDUE'],
      default: 'ISSUED',
      index: true,
    },
    issuedAt: { type: Date, default: () => new Date(), index: true },
    dueDate: Date,
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

InvoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ organizationId: 1, studentId: 1, issuedAt: -1 });

export const Invoice = mongoose.model<IInvoice>('Invoice', InvoiceSchema);

export interface IReceipt extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  receiptNumber: string;
  paymentId: Types.ObjectId;
  invoiceId?: Types.ObjectId;
  studentId: Types.ObjectId;
  courseId?: Types.ObjectId;
  amount: number;
  method: string;
  issuedAt: Date;
  issuedBy?: Types.ObjectId;
  issuedByName?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReceiptSchema = new Schema<IReceipt>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    receiptNumber: { type: String, required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, required: true },
    issuedAt: { type: Date, default: () => new Date(), index: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    issuedByName: String,
    notes: String,
  },
  { timestamps: true },
);

ReceiptSchema.index({ organizationId: 1, receiptNumber: 1 }, { unique: true });

export const Receipt = mongoose.model<IReceipt>('Receipt', ReceiptSchema);
