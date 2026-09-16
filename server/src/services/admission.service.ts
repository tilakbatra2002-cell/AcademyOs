import mongoose, { Types } from 'mongoose';
import dayjs from 'dayjs';
import {
  Lead, LeadActivity, Student, Parent, User, Course, Batch, BatchEnrollment, CourseEnrollment,
  Admission, FeePlan, FeeInstallment, Payment, Invoice, Receipt, Lesson,
} from '../models';
import { withTransaction } from '../config/db';
import { ApiError } from '../utils/ApiError';
import { hashPassword } from './password.service';
import { generatePassword } from '../utils/ids';
import {
  generateStudentCode, generateAdmissionNumber, generateInvoiceNumber, generateReceiptNumber,
} from './counter.service';
import { assertWithinLimit } from './subscription.service';
import { AuthContext } from '../types/express';
import { notify } from './notification.service';

export interface ConvertInput {
  student: {
    name: string; email?: string; phone?: string; dateOfBirth?: string; gender?: string;
    address?: Record<string, string | undefined>; schoolName?: string; createLogin: boolean;
  };
  parent?: {
    create: boolean; existingParentId?: string; name?: string; phone?: string; email?: string;
    relation: string; createLogin: boolean;
  };
  courseId: string;
  batchId?: string;
  feePlan: {
    title?: string; totalAmount: number; discountAmount: number;
    installments: { title?: string; amount: number; dueDate: string }[];
  };
  initialPayment?: { amount: number; method: string; transactionId?: string };
  remarks?: string;
}

export interface ConversionResult {
  studentId: string;
  studentCode: string;
  admissionNumber: string;
  studentCredentials: { email: string; password: string } | null;
  parentCredentials: { email: string; password: string } | null;
  feePlanId: string;
  paymentId: string | null;
}

/**
 * Full admission workflow executed inside a MongoDB transaction:
 * Lead -> Admission -> Student (+login) -> Parent (+login) -> Course enrollment ->
 * Batch assignment -> Fee plan + installments -> Initial payment -> Invoice -> Receipt.
 * Any failure rolls the whole thing back.
 */
export async function admitStudent(
  orgId: Types.ObjectId,
  auth: AuthContext,
  input: ConvertInput,
  leadId?: string,
): Promise<ConversionResult> {
  await assertWithinLimit(orgId, 'students', 1);

  const course = await Course.findOne({ _id: input.courseId, organizationId: orgId }).lean();
  if (!course) throw ApiError.notFound('Course not found in your academy');

  let batch = null;
  if (input.batchId) {
    batch = await Batch.findOne({ _id: input.batchId, organizationId: orgId }).lean();
    if (!batch) throw ApiError.notFound('Batch not found in your academy');
    if (String(batch.courseId) !== String(course._id)) {
      throw ApiError.validation('The selected batch does not belong to the selected course', { batchId: 'Batch/course mismatch' });
    }
    if (batch.enrolledCount >= batch.capacity) {
      throw ApiError.conflict(`Batch "${batch.name}" is full (${batch.enrolledCount}/${batch.capacity}). Pick another batch or increase capacity.`);
    }
  }

  const netAmount = Math.max(0, input.feePlan.totalAmount - (input.feePlan.discountAmount || 0));
  const installmentTotal = input.feePlan.installments.reduce((a, i) => a + i.amount, 0);
  if (Math.abs(installmentTotal - netAmount) > 1) {
    throw ApiError.validation(
      `Installments total ${installmentTotal} but the net fee is ${netAmount}. They must match.`,
      { installments: 'Installment total must equal the net fee' },
    );
  }
  const initialAmount = input.initialPayment?.amount ?? 0;
  if (initialAmount > netAmount) {
    throw ApiError.validation('Initial payment cannot exceed the net fee', { initialPayment: 'Amount too high' });
  }

  let lead = null;
  if (leadId) {
    lead = await Lead.findOne({ _id: leadId, organizationId: orgId });
    if (!lead) throw ApiError.notFound('Lead not found');
    if (lead.convertedStudentId) throw ApiError.conflict('This lead has already been converted to a student');
  }

  // Pre-check emails outside the transaction for better error messages
  if (input.student.createLogin && input.student.email) {
    const exists = await User.findOne({ organizationId: orgId, email: input.student.email }).lean();
    if (exists) throw ApiError.conflict('A user with this student email already exists', { 'student.email': 'Email already in use' });
  }
  if (input.parent?.create && input.parent.createLogin && input.parent.email) {
    const exists = await User.findOne({ organizationId: orgId, email: input.parent.email }).lean();
    if (exists) throw ApiError.conflict('A user with this parent email already exists', { 'parent.email': 'Email already in use' });
  }

  const result = await withTransaction(async (session) => {
    const opts = session ? { session } : {};
    const studentCode = await generateStudentCode(orgId, session);
    const admissionNumber = await generateAdmissionNumber(orgId, session);

    /* ---------------------------- Parent ---------------------------- */
    let parentDoc: mongoose.Document & { _id: Types.ObjectId } | null = null;
    let parentCredentials: { email: string; password: string } | null = null;

    if (input.parent?.existingParentId) {
      const p = await Parent.findOne({ _id: input.parent.existingParentId, organizationId: orgId }).session(session ?? null);
      if (!p) throw ApiError.notFound('Selected parent not found in your academy');
      parentDoc = p;
    } else if (input.parent?.create && input.parent.name && input.parent.phone) {
      const [p] = await Parent.create(
        [{
          organizationId: orgId,
          name: input.parent.name,
          phone: input.parent.phone,
          email: input.parent.email || undefined,
          relation: input.parent.relation,
          childrenIds: [],
          createdBy: auth.userId,
        }],
        { ...opts, ordered: true },
      );
      parentDoc = p;

      if (input.parent.createLogin && input.parent.email) {
        const password = generatePassword();
        const [pu] = await User.create(
          [{
            organizationId: orgId,
            name: input.parent.name,
            email: input.parent.email,
            phone: input.parent.phone,
            passwordHash: await hashPassword(password),
            role: 'PARENT',
            parentId: p._id,
            mustChangePassword: true,
            createdBy: auth.userId,
          }],
          { ...opts, ordered: true },
        );
        p.userId = pu._id;
        await p.save({ session });
        parentCredentials = { email: input.parent.email, password };
      }
    }

    /* ---------------------------- Student --------------------------- */
    const [student] = await Student.create(
      [{
        organizationId: orgId,
        studentCode,
        name: input.student.name,
        email: input.student.email || undefined,
        phone: input.student.phone,
        dateOfBirth: input.student.dateOfBirth ? new Date(input.student.dateOfBirth) : undefined,
        gender: input.student.gender,
        address: input.student.address,
        schoolName: input.student.schoolName,
        guardianId: parentDoc?._id,
        status: 'ACTIVE',
        admissionDate: new Date(),
        leadId: lead?._id,
        primaryCourseId: course._id,
        primaryBatchId: batch?._id,
        createdBy: auth.userId,
      }],
      { ...opts, ordered: true },
    );

    let studentCredentials: { email: string; password: string } | null = null;
    if (input.student.createLogin) {
      const loginEmail = input.student.email || `${studentCode.toLowerCase()}@${(await currentOrgSlug(orgId, session))}.academyos.local`;
      const password = generatePassword();
      const [su] = await User.create(
        [{
          organizationId: orgId,
          name: input.student.name,
          email: loginEmail,
          phone: input.student.phone,
          passwordHash: await hashPassword(password),
          role: 'STUDENT',
          studentId: student._id,
          mustChangePassword: true,
          createdBy: auth.userId,
        }],
        { ...opts, ordered: true },
      );
      student.userId = su._id;
      await student.save({ session });
      studentCredentials = { email: loginEmail, password };
    }

    if (parentDoc) {
      await Parent.updateOne({ _id: parentDoc._id, organizationId: orgId }, { $addToSet: { childrenIds: student._id } }, { session });
    }

    /* --------------------------- Admission -------------------------- */
    const [admission] = await Admission.create(
      [{
        organizationId: orgId,
        admissionNumber,
        leadId: lead?._id,
        studentId: student._id,
        parentId: parentDoc?._id,
        courseId: course._id,
        batchId: batch?._id,
        status: 'CONFIRMED',
        admissionDate: new Date(),
        totalFee: input.feePlan.totalAmount,
        discount: input.feePlan.discountAmount || 0,
        netFee: netAmount,
        initialPayment: initialAmount,
        counselorId: lead?.assignedCounselorId ?? auth.userId,
        source: lead?.source,
        remarks: input.remarks,
        createdBy: auth.userId,
      }],
      { ...opts, ordered: true },
    );
    student.admissionId = admission._id;
    await student.save({ session });

    /* -------------------------- Enrollments ------------------------- */
    const totalLessons = await Lesson.countDocuments({ organizationId: orgId, courseId: course._id }).session(session ?? null);
    await CourseEnrollment.create(
      [{
        organizationId: orgId,
        studentId: student._id,
        courseId: course._id,
        batchId: batch?._id,
        status: 'ACTIVE',
        enrolledAt: new Date(),
        totalLessons,
      }],
      { ...opts, ordered: true },
    );

    if (batch) {
      await BatchEnrollment.create(
        [{ organizationId: orgId, batchId: batch._id, studentId: student._id, courseId: course._id, status: 'ACTIVE' }],
        { ...opts, ordered: true },
      );
      await Batch.updateOne({ _id: batch._id, organizationId: orgId }, { $inc: { enrolledCount: 1 } }, { session });
    }

    /* ---------------------------- Fee plan -------------------------- */
    const [feePlan] = await FeePlan.create(
      [{
        organizationId: orgId,
        studentId: student._id,
        courseId: course._id,
        batchId: batch?._id,
        admissionId: admission._id,
        title: input.feePlan.title || `${course.title} — Fee plan`,
        totalAmount: input.feePlan.totalAmount,
        discountAmount: input.feePlan.discountAmount || 0,
        netAmount,
        paidAmount: 0,
        pendingAmount: netAmount,
        status: 'ACTIVE',
        createdBy: auth.userId,
      }],
      { ...opts, ordered: true },
    );
    admission.feePlanId = feePlan._id;
    await admission.save({ session });

    const installmentDocs = await FeeInstallment.create(
      input.feePlan.installments.map((inst, idx) => ({
        organizationId: orgId,
        feePlanId: feePlan._id,
        studentId: student._id,
        courseId: course._id,
        sequence: idx + 1,
        title: inst.title || `Installment ${idx + 1}`,
        amount: inst.amount,
        paidAmount: 0,
        dueDate: new Date(inst.dueDate),
        status: 'PENDING',
      })),
      { ...opts, ordered: true },
    );

    /* ------------------------ Initial payment ----------------------- */
    let paymentId: string | null = null;
    if (initialAmount > 0) {
      let remaining = initialAmount;
      const sorted = installmentDocs.sort((a, b) => a.sequence - b.sequence);
      const target = sorted[0];

      for (const inst of sorted) {
        if (remaining <= 0) break;
        const due = inst.amount - inst.paidAmount;
        const applied = Math.min(due, remaining);
        inst.paidAmount += applied;
        inst.status = inst.paidAmount >= inst.amount ? 'PAID' : 'PARTIAL';
        if (inst.status === 'PAID') inst.paidAt = new Date();
        await inst.save({ session });
        remaining -= applied;
      }

      const paymentNumber = `PAY-${dayjs().format('YYYYMMDD')}-${String(Date.now()).slice(-6)}`;
      const invoiceNumber = await generateInvoiceNumber(orgId, session);
      const receiptNumber = await generateReceiptNumber(orgId, session);

      const [invoice] = await Invoice.create(
        [{
          organizationId: orgId,
          invoiceNumber,
          studentId: student._id,
          feePlanId: feePlan._id,
          installmentId: target._id,
          courseId: course._id,
          items: [{ description: `${course.title} — admission payment`, amount: initialAmount, quantity: 1 }],
          subtotal: initialAmount,
          discount: 0,
          tax: 0,
          total: initialAmount,
          amountPaid: initialAmount,
          status: 'PAID',
          issuedAt: new Date(),
          createdBy: auth.userId,
        }],
        { ...opts, ordered: true },
      );

      const [payment] = await Payment.create(
        [{
          organizationId: orgId,
          paymentNumber,
          studentId: student._id,
          feePlanId: feePlan._id,
          installmentId: target._id,
          courseId: course._id,
          amount: initialAmount,
          method: input.initialPayment!.method,
          transactionId: input.initialPayment!.transactionId,
          gateway: 'manual',
          status: 'SUCCESS',
          paidAt: new Date(),
          receivedBy: auth.userId,
          receivedByName: auth.name,
          invoiceId: invoice._id,
        }],
        { ...opts, ordered: true },
      );

      const [receipt] = await Receipt.create(
        [{
          organizationId: orgId,
          receiptNumber,
          paymentId: payment._id,
          invoiceId: invoice._id,
          studentId: student._id,
          courseId: course._id,
          amount: initialAmount,
          method: input.initialPayment!.method,
          issuedBy: auth.userId,
          issuedByName: auth.name,
        }],
        { ...opts, ordered: true },
      );

      payment.receiptId = receipt._id;
      await payment.save({ session });

      feePlan.paidAmount = initialAmount;
      feePlan.pendingAmount = netAmount - initialAmount;
      if (feePlan.pendingAmount <= 0) feePlan.status = 'COMPLETED';
      await feePlan.save({ session });

      paymentId = String(payment._id);
    }

    /* ------------------------- Lead closure ------------------------- */
    if (lead) {
      lead.status = 'ADMITTED';
      lead.convertedStudentId = student._id;
      lead.convertedAt = new Date();
      await lead.save({ session });
      await LeadActivity.create(
        [{
          organizationId: orgId,
          leadId: lead._id,
          type: 'SYSTEM',
          title: `Converted to student ${studentCode}`,
          description: `Admission ${admissionNumber} created for ${course.title}`,
          fromStatus: 'ADMISSION_PENDING',
          toStatus: 'ADMITTED',
          performedBy: auth.userId,
          performedByName: auth.name,
        }],
        { ...opts, ordered: true },
      );
    }

    return {
      studentId: String(student._id),
      studentCode,
      admissionNumber,
      studentCredentials,
      parentCredentials,
      feePlanId: String(feePlan._id),
      paymentId,
    };
  });

  if (result.studentCredentials) {
    // best-effort welcome notification for the new student account
    const su = await User.findOne({ organizationId: orgId, studentId: result.studentId }).lean();
    if (su) {
      await notify({
        organizationId: orgId,
        userId: su._id,
        type: 'ENROLLMENT',
        title: 'Welcome to the academy!',
        message: `You have been enrolled in ${course.title}. Explore your courses to start learning.`,
        link: '/student/courses',
      });
    }
  }

  return result;
}

async function currentOrgSlug(orgId: Types.ObjectId, session?: mongoose.ClientSession): Promise<string> {
  const { Organization } = await import('../models/Organization');
  const org = await Organization.findById(orgId).select('slug').session(session ?? null).lean();
  return org?.slug ?? 'academy';
}
