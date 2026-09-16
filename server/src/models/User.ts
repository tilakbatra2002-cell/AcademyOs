import mongoose, { Schema, Document, Types } from 'mongoose';
import { Role, Permission } from '../config/rbac';

export interface IUser extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId | null; // null only for SAAS_OWNER
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: Role;
  extraPermissions: Permission[];
  deniedPermissions: Permission[];
  isActive: boolean;
  mustChangePassword: boolean;
  avatarUrl?: string;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
  tokenVersion: number;
  resetTokenHash?: string;
  resetTokenExpiresAt?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  // role-linked profiles
  studentId?: Types.ObjectId;
  parentId?: Types.ObjectId;
  teacherId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['SAAS_OWNER', 'ORGANIZATION_ADMIN', 'COUNSELOR', 'TEACHER', 'ACCOUNTANT', 'STAFF', 'PARENT', 'STUDENT'],
      required: true,
      index: true,
    },
    extraPermissions: { type: [String], default: [] },
    deniedPermissions: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    mustChangePassword: { type: Boolean, default: false },
    avatarUrl: String,
    lastLoginAt: Date,
    passwordChangedAt: Date,
    tokenVersion: { type: Number, default: 0 },
    resetTokenHash: { type: String, select: false },
    resetTokenExpiresAt: { type: Date, select: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: Date,
    studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    parentId: { type: Schema.Types.ObjectId, ref: 'Parent' },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// Email unique per tenant (owner accounts use organizationId=null)
UserSchema.index({ organizationId: 1, email: 1 }, { unique: true });
UserSchema.index({ organizationId: 1, role: 1, isActive: 1 });
UserSchema.index({ name: 'text', email: 'text' });

export const User = mongoose.model<IUser>('User', UserSchema);
