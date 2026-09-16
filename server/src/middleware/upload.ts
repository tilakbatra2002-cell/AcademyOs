import multer from 'multer';
import { ApiError } from '../utils/ApiError';

const MB = 1024 * 1024;

/** In-memory storage: buffers are handed straight to the storage provider, never to MongoDB. */
const memory = multer.memoryStorage();

const DOCUMENT_TYPES = [
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'application/zip', 'audio/mpeg',
];

const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-matroska'];

function filter(allowed: string[]) {
  return (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(ApiError.validation(`Unsupported file type "${file.mimetype}"`, { file: 'Unsupported type' }) as unknown as Error);
  };
}

export const documentUpload = multer({ storage: memory, limits: { fileSize: 25 * MB }, fileFilter: filter(DOCUMENT_TYPES) });
export const videoUpload = multer({ storage: memory, limits: { fileSize: 500 * MB }, fileFilter: filter(VIDEO_TYPES) });
export const csvUpload = multer({
  storage: memory,
  limits: { fileSize: 5 * MB },
  fileFilter: (_req, file, cb) => {
    if (['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream'].includes(file.mimetype)
      || file.originalname.toLowerCase().endsWith('.csv')) return cb(null, true);
    cb(ApiError.validation('Upload a .csv file', { file: 'Must be CSV' }) as unknown as Error);
  },
});
export const anyFileUpload = multer({ storage: memory, limits: { fileSize: 50 * MB }, fileFilter: filter([...DOCUMENT_TYPES, ...VIDEO_TYPES]) });
