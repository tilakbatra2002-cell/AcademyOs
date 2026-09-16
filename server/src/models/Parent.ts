import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IParent extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  userId?: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  alternatePhone?: string;
  occupation?: string;
  relation: 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'OTHER';
  address?: {
    line1?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  };
  childrenIds: Types.ObjectId[];
  isActive: boolean;
  notes?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ParentSchema = new Schema<IParent>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    alternatePhone: String,
    occupation: String,
    relation: { type: String, enum: ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'], default: 'FATHER' },
    address: {
      line1: String,
      city: String,
      state: String,
      country: { type: String, default: 'India' },
      postalCode: String,
    },
    childrenIds: [{ type: Schema.Types.ObjectId, ref: 'Student', index: true }],
    isActive: { type: Boolean, default: true },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

ParentSchema.index({ organizationId: 1, phone: 1 });
ParentSchema.index({ organizationId: 1, name: 'text', phone: 'text', email: 'text' });

export const Parent = mongoose.model<IParent>('Parent', ParentSchema);
