import mongoose, { Schema, Document, Types } from 'mongoose';

export const VIDEO_PROVIDERS = ['local', 's3', 'cloudinary', 'vimeo', 'youtube'] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

export interface IVideo extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  courseId?: Types.ObjectId;
  lessonId?: Types.ObjectId;
  title: string;
  description?: string;
  provider: VideoProvider;
  /** Storage key (local/s3/cloudinary) or external video id (youtube/vimeo). */
  storageKey: string;
  /** Only used for public providers (youtube/vimeo embed). */
  publicUrl?: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  sizeBytes: number;
  mimeType?: string;
  visibility: 'PRIVATE' | 'ENROLLED' | 'PUBLIC';
  status: 'READY' | 'PROCESSING' | 'FAILED';
  uploadedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const VideoSchema = new Schema<IVideo>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', index: true },
    title: { type: String, required: true, trim: true },
    description: String,
    provider: { type: String, enum: VIDEO_PROVIDERS, default: 'local' },
    storageKey: { type: String, required: true },
    publicUrl: String,
    thumbnailUrl: String,
    durationSeconds: { type: Number, default: 0, min: 0 },
    sizeBytes: { type: Number, default: 0, min: 0 },
    mimeType: String,
    visibility: { type: String, enum: ['PRIVATE', 'ENROLLED', 'PUBLIC'], default: 'ENROLLED' },
    status: { type: String, enum: ['READY', 'PROCESSING', 'FAILED'], default: 'READY' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

VideoSchema.index({ organizationId: 1, courseId: 1 });
VideoSchema.index({ organizationId: 1, title: 'text' });

export const Video = mongoose.model<IVideo>('Video', VideoSchema);
