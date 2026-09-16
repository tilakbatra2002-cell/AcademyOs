import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from '../../config/env';
import { StorageProvider, UploadInput, UploadResult } from './StorageProvider';
import { ApiError } from '../../utils/ApiError';

/**
 * Development/self-hosted provider. Files live on disk under STORAGE_LOCAL_DIR.
 * Private objects are NEVER exposed directly — they are only reachable through
 * /api/files/signed/:token which validates an HMAC-signed, expiring token.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private root: string;

  constructor(root = env.STORAGE_LOCAL_DIR) {
    this.root = root;
    if (!fsSync.existsSync(this.root)) fsSync.mkdirSync(this.root, { recursive: true });
  }

  private resolve(key: string): string {
    const safe = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    const full = path.join(this.root, safe);
    if (!full.startsWith(this.root)) throw ApiError.badRequest('Invalid storage key');
    return full;
  }

  async upload({ key, body, mimeType }: UploadInput): Promise<UploadResult> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
    if (mimeType) {
      await fs.writeFile(`${full}.meta`, JSON.stringify({ mimeType }), 'utf8').catch(() => undefined);
    }
    return { key, size: body.length, provider: this.name };
  }

  async delete(key: string): Promise<void> {
    const full = this.resolve(key);
    await fs.rm(full, { force: true });
    await fs.rm(`${full}.meta`, { force: true }).catch(() => undefined);
  }

  getUrl(_key: string): string | null {
    return null; // local objects are always served through the signed endpoint
  }

  async getSignedUrl(key: string, ttlSeconds = env.STORAGE_SIGNED_URL_TTL): Promise<string> {
    return `/api/files/signed/${signKey(key, ttlSeconds)}`;
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async stat(key: string) {
    try {
      const s = await fs.stat(this.resolve(key));
      return { size: s.size };
    } catch {
      return null;
    }
  }
}

/* --------------------------- Signed token helpers --------------------------- */

export function signKey(key: string, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ k: key, e: exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySignedKey(token: string): string {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) throw ApiError.forbidden('Invalid file token');
  const expected = crypto.createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw ApiError.forbidden('Invalid file token signature');
  }
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { k: string; e: number };
  if (data.e < Math.floor(Date.now() / 1000)) throw ApiError.forbidden('File link has expired');
  return data.k;
}
