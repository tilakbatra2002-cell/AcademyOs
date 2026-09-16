import mongoose, { Schema, Document, Types } from 'mongoose';

export type OrganizationStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';

export interface IOrganization extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  code: string;
  status: OrganizationStatus;
  email: string;
  phone?: string;
  website?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  };
  branding: {
    logoUrl?: string;
    primaryColor: string;
    accentColor: string;
    tagline?: string;
  };
  settings: {
    currency: string;
    currencySymbol: string;
    timezone: string;
    locale: string;
    attendanceThreshold: number;
    academicYearStartMonth: number;
    studentIdPrefix: string;
    invoicePrefix: string;
    receiptPrefix: string;
    restrictOnTrialExpiry: boolean;
  };
  counters: {
    student: number;
    invoice: number;
    receipt: number;
    admission: number;
  };
  ownerNotes?: string;
  suspendedAt?: Date;
  suspensionReason?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    status: {
      type: String,
      enum: ['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'],
      default: 'TRIAL',
      index: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    website: { type: String, trim: true },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      country: { type: String, default: 'India' },
      postalCode: String,
    },
    branding: {
      logoUrl: String,
      primaryColor: { type: String, default: '#4f46e5' },
      accentColor: { type: String, default: '#0ea5e9' },
      tagline: String,
    },
    settings: {
      currency: { type: String, default: 'INR' },
      currencySymbol: { type: String, default: '₹' },
      timezone: { type: String, default: 'Asia/Kolkata' },
      locale: { type: String, default: 'en-IN' },
      attendanceThreshold: { type: Number, default: 75, min: 0, max: 100 },
      academicYearStartMonth: { type: Number, default: 4, min: 1, max: 12 },
      studentIdPrefix: { type: String, default: 'STU' },
      invoicePrefix: { type: String, default: 'INV' },
      receiptPrefix: { type: String, default: 'RCP' },
      restrictOnTrialExpiry: { type: Boolean, default: true },
    },
    counters: {
      student: { type: Number, default: 0 },
      invoice: { type: Number, default: 0 },
      receipt: { type: Number, default: 0 },
      admission: { type: Number, default: 0 },
    },
    ownerNotes: String,
    suspendedAt: Date,
    suspensionReason: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

OrganizationSchema.index({ name: 'text', code: 'text', email: 'text' });
OrganizationSchema.index({ status: 1, createdAt: -1 });

export const Organization = mongoose.model<IOrganization>('Organization', OrganizationSchema);
