import mongoose, { Schema, Document, Types } from 'mongoose';
import { PlanCode } from '../config/plans';

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
export type BillingCycle = 'MONTHLY' | 'YEARLY';

export interface ISubscriptionInvoice {
  _id?: Types.ObjectId;
  number: string;
  amount: number;
  status: 'PAID' | 'PENDING' | 'FAILED';
  issuedAt: Date;
  paidAt?: Date;
  method?: string;
  note?: string;
}

export interface ISubscription extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  plan: PlanCode;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  amount: number;
  currency: string;
  trialEndsAt?: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt?: Date;
  limits: {
    students: number;
    staff: number;
    courses: number;
    batches: number;
    storageBytes: number;
    videos: number;
  };
  usage: {
    storageBytes: number;
  };
  invoices: ISubscriptionInvoice[];
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true, index: true },
    plan: { type: String, enum: ['STARTER', 'GROWTH', 'PRO'], default: 'STARTER', index: true },
    status: {
      type: String,
      enum: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'],
      default: 'TRIALING',
      index: true,
    },
    billingCycle: { type: String, enum: ['MONTHLY', 'YEARLY'], default: 'MONTHLY' },
    amount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
    trialEndsAt: Date,
    currentPeriodStart: { type: Date, default: () => new Date() },
    currentPeriodEnd: { type: Date, required: true },
    cancelledAt: Date,
    limits: {
      students: { type: Number, default: 100 },
      staff: { type: Number, default: 10 },
      courses: { type: Number, default: 10 },
      batches: { type: Number, default: 15 },
      storageBytes: { type: Number, default: 10 * 1024 * 1024 * 1024 },
      videos: { type: Number, default: 100 },
    },
    usage: {
      storageBytes: { type: Number, default: 0 },
    },
    invoices: [
      new Schema<ISubscriptionInvoice>(
        {
          number: { type: String, required: true },
          amount: { type: Number, required: true, min: 0 },
          status: { type: String, enum: ['PAID', 'PENDING', 'FAILED'], default: 'PENDING' },
          issuedAt: { type: Date, default: () => new Date() },
          paidAt: Date,
          method: String,
          note: String,
        },
        { _id: true },
      ),
    ],
  },
  { timestamps: true },
);

export const Subscription = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
