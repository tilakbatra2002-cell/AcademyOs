import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITeacher extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  employeeCode: string;
  name: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  qualification?: string;
  specialization?: string;
  experienceYears?: number;
  joiningDate?: Date;
  salary?: number;
  subjectIds: Types.ObjectId[];
  courseIds: Types.ObjectId[];
  bio?: string;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TeacherSchema = new Schema<ITeacher>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employeeCode: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: String,
    photoUrl: String,
    qualification: String,
    specialization: String,
    experienceYears: { type: Number, min: 0 },
    joiningDate: Date,
    salary: { type: Number, min: 0 },
    subjectIds: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
    courseIds: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    bio: String,
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

TeacherSchema.index({ organizationId: 1, employeeCode: 1 }, { unique: true });
TeacherSchema.index({ organizationId: 1, name: 'text', email: 'text' });

export const Teacher = mongoose.model<ITeacher>('Teacher', TeacherSchema);
