import { Request, Response } from 'express';
import path from 'path';
import { asyncHandler, ok, created } from '../utils/http';
import { requireAuth, requireOrg } from '../middleware/auth';
import { getStorage, StorageKeys, keyBelongsToOrg, verifySignedKey } from '../services/storage';
import { ApiError } from '../utils/ApiError';
import { DocumentFile, Video, Student, Teacher, Course, Lesson, Assignment, Organization } from '../models';
import { assertBelongsToOrg } from '../services/crud.factory';
import { recordAudit } from '../services/audit.service';
import { assertWithinLimit } from '../services/subscription.service';
import { randomToken } from '../utils/ids';
import { LocalStorageProvider } from '../services/storage/LocalStorageProvider';

function safeName(original: string): string {
  const ext = path.extname(original).toLowerCase().slice(0, 10);
  const base = path.basename(original, path.extname(original)).replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 40) || 'file';
  return `${Date.now()}-${randomToken(4)}-${base}${ext}`;
}

function requireFile(req: Request): Express.Multer.File {
  const file = req.file;
  if (!file) throw ApiError.validation('No file was uploaded', { file: 'Required' });
  return file;
}

/** Generic document upload attached to a tenant entity. */
export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const file = requireFile(req);
  const { ownerType, ownerId, category, title, visibility } = req.body as Record<string, string>;
  if (!ownerType || !ownerId) throw ApiError.validation('ownerType and ownerId are required', { ownerId: 'Required' });

  const ownerModels: Record<string, unknown> = {
    STUDENT: Student, TEACHER: Teacher, COURSE: Course, LESSON: Lesson, ASSIGNMENT: Assignment, ORGANIZATION: Organization,
  };
  if (ownerType !== 'ORGANIZATION' && ownerModels[ownerType]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assertBelongsToOrg(ownerModels[ownerType] as any, ownerId, orgId, ownerType);
  }

  const key = StorageKeys.student(String(orgId), ownerId, safeName(file.originalname));
  const uploaded = await getStorage().upload({ key, body: file.buffer, mimeType: file.mimetype, visibility: 'PRIVATE' });

  const doc = await DocumentFile.create({
    organizationId: orgId,
    ownerType,
    ownerId,
    category: category || 'OTHER',
    title: title || file.originalname,
    fileName: file.originalname,
    storageKey: uploaded.key,
    mimeType: file.mimetype,
    sizeBytes: uploaded.size,
    visibility: visibility || 'PRIVATE',
    uploadedBy: auth.userId,
  });

  await recordAudit(req, { action: 'DOCUMENT_UPLOADED', entity: 'DocumentFile', entityId: doc._id, metadata: { ownerType, sizeBytes: uploaded.size } });
  return created(res, { document: doc.toObject(), url: await getStorage().getSignedUrl(uploaded.key, 900) });
});

/** Video binary upload — binaries go to the storage provider, never into MongoDB. */
export const uploadVideoFile = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const file = requireFile(req);
  await assertWithinLimit(orgId, 'videos', 1);
  await assertWithinLimit(orgId, 'storageBytes', file.size);

  const { title, courseId, lessonId, description, durationSeconds } = req.body as Record<string, string>;
  if (courseId) await assertBelongsToOrg(Course, courseId, orgId, 'Course');
  if (lessonId) await assertBelongsToOrg(Lesson, lessonId, orgId, 'Lesson');

  const key = StorageKeys.video(String(orgId), randomToken(6), safeName(file.originalname));
  const uploaded = await getStorage().upload({ key, body: file.buffer, mimeType: file.mimetype, visibility: 'PRIVATE' });

  const video = await Video.create({
    organizationId: orgId,
    title: title || file.originalname,
    description,
    provider: uploaded.provider === 'local' ? 'local' : uploaded.provider,
    storageKey: uploaded.key,
    fileName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: uploaded.size,
    durationSeconds: Number(durationSeconds) || 0,
    courseId: courseId || undefined,
    lessonId: lessonId || undefined,
    visibility: 'ENROLLED',
    status: 'READY',
    uploadedBy: auth.userId,
  });

  if (lessonId) {
    await Lesson.updateOne({ _id: lessonId, organizationId: orgId }, { videoId: video._id, type: 'VIDEO' });
  }

  await recordAudit(req, { action: 'VIDEO_UPLOADED', entity: 'Video', entityId: video._id, metadata: { sizeBytes: uploaded.size } });
  return created(res, { video: video.toObject(), playbackUrl: await getStorage().getSignedUrl(uploaded.key, 3600) });
});

/** Generic file upload that only returns a storage key (used by study material / branding forms). */
export const uploadFile = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const file = requireFile(req);
  const scope = String(req.body.scope ?? 'materials');
  const key = scope === 'branding'
    ? StorageKeys.org(String(orgId), safeName(file.originalname))
    : StorageKeys.material(String(orgId), safeName(file.originalname));
  const uploaded = await getStorage().upload({
    key, body: file.buffer, mimeType: file.mimetype,
    visibility: scope === 'branding' ? 'PUBLIC' : 'PRIVATE',
  });
  return created(res, {
    storageKey: uploaded.key,
    fileName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: uploaded.size,
    url: uploaded.url ?? (await getStorage().getSignedUrl(uploaded.key, 900)),
  });
});

/**
 * Serves a locally stored private object. The token is an HMAC over the key + expiry,
 * so no authenticated session is needed but the URL cannot be forged or re-targeted.
 */
export const serveSignedFile = asyncHandler(async (req: Request, res: Response) => {
  const key = verifySignedKey(String(req.params.token ?? ''));

  const storage = getStorage();
  if (!(storage instanceof LocalStorageProvider)) {
    return ok(res, { url: await storage.getSignedUrl(key, 900) });
  }
  if (!(await storage.exists(key))) throw ApiError.notFound('File not found');
  const buffer = await storage.read(key);
  res.setHeader('Content-Type', lookupMime(key));
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(key)}"`);
  return res.send(buffer);
});

/** Explicit tenant check helper exposed for tests. */
export function assertKeyOwnership(key: string, orgId: string) {
  if (!keyBelongsToOrg(key, orgId)) throw ApiError.forbidden('This file does not belong to your academy');
}

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.csv': 'text/csv', '.txt': 'text/plain',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
};

function lookupMime(key: string): string {
  return MIME_BY_EXT[path.extname(key).toLowerCase()] ?? 'application/octet-stream';
}
