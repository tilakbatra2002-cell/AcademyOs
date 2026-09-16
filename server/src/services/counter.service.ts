import mongoose, { Types } from 'mongoose';
import { Organization } from '../models/Organization';
import { ApiError } from '../utils/ApiError';

type CounterField = 'student' | 'invoice' | 'receipt' | 'admission';

/** Atomically increments a per-organization counter and returns the new value. */
export async function nextCounter(
  organizationId: Types.ObjectId,
  field: CounterField,
  session?: mongoose.ClientSession,
): Promise<{ value: number; org: { settings: { studentIdPrefix: string; invoicePrefix: string; receiptPrefix: string }; code: string } }> {
  const org = await Organization.findOneAndUpdate(
    { _id: organizationId },
    { $inc: { [`counters.${field}`]: 1 } },
    { new: true, session },
  ).lean();
  if (!org) throw ApiError.notFound('Organization not found');
  return {
    value: org.counters[field],
    org: { settings: org.settings as never, code: org.code },
  };
}

export async function generateStudentCode(organizationId: Types.ObjectId, session?: mongoose.ClientSession): Promise<string> {
  const { value, org } = await nextCounter(organizationId, 'student', session);
  const year = new Date().getFullYear().toString().slice(-2);
  return `${org.settings.studentIdPrefix || 'STU'}${year}${String(value).padStart(5, '0')}`;
}

export async function generateInvoiceNumber(organizationId: Types.ObjectId, session?: mongoose.ClientSession): Promise<string> {
  const { value, org } = await nextCounter(organizationId, 'invoice', session);
  const year = new Date().getFullYear();
  return `${org.settings.invoicePrefix || 'INV'}-${year}-${String(value).padStart(5, '0')}`;
}

export async function generateReceiptNumber(organizationId: Types.ObjectId, session?: mongoose.ClientSession): Promise<string> {
  const { value, org } = await nextCounter(organizationId, 'receipt', session);
  const year = new Date().getFullYear();
  return `${org.settings.receiptPrefix || 'RCP'}-${year}-${String(value).padStart(5, '0')}`;
}

export async function generateAdmissionNumber(organizationId: Types.ObjectId, session?: mongoose.ClientSession): Promise<string> {
  const { value, org } = await nextCounter(organizationId, 'admission', session);
  const year = new Date().getFullYear();
  return `ADM-${org.code}-${year}-${String(value).padStart(4, '0')}`;
}
