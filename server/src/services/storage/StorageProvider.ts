export interface UploadInput {
  /** Tenant-aware object key, e.g. organizations/<orgId>/courses/<courseId>/file.pdf */
  key: string;
  body: Buffer;
  mimeType?: string;
  /** PRIVATE objects must never be served without an authorization check. */
  visibility?: 'PRIVATE' | 'PUBLIC';
}

export interface UploadResult {
  key: string;
  size: number;
  provider: string;
  url?: string;
}

export interface StorageProvider {
  readonly name: string;
  upload(input: UploadInput): Promise<UploadResult>;
  delete(key: string): Promise<void>;
  /** Permanent (public) URL. Returns null for private objects. */
  getUrl(key: string): string | null;
  /** Short-lived authorized URL for private objects. */
  getSignedUrl(key: string, ttlSeconds?: number): Promise<string>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  stat(key: string): Promise<{ size: number } | null>;
}

/** Builds tenant-scoped storage keys. Every object lives under its organization prefix. */
export const StorageKeys = {
  student: (orgId: string, studentId: string, file: string) => `organizations/${orgId}/students/${studentId}/${file}`,
  course: (orgId: string, courseId: string, file: string) => `organizations/${orgId}/courses/${courseId}/${file}`,
  lesson: (orgId: string, lessonId: string, file: string) => `organizations/${orgId}/lessons/${lessonId}/${file}`,
  video: (orgId: string, videoId: string, file: string) => `organizations/${orgId}/videos/${videoId}/${file}`,
  org: (orgId: string, file: string) => `organizations/${orgId}/branding/${file}`,
  assignment: (orgId: string, assignmentId: string, file: string) =>
    `organizations/${orgId}/assignments/${assignmentId}/${file}`,
  material: (orgId: string, file: string) => `organizations/${orgId}/materials/${file}`,
};

/** Verifies a key belongs to the given tenant (defence-in-depth against path traversal/IDOR). */
export function keyBelongsToOrg(key: string, orgId: string): boolean {
  if (key.includes('..')) return false;
  return key.startsWith(`organizations/${orgId}/`);
}
