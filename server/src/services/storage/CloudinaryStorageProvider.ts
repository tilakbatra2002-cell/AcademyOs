import crypto from 'crypto';
import { env } from '../../config/env';
import { StorageProvider, UploadInput, UploadResult } from './StorageProvider';
import { ApiError } from '../../utils/ApiError';

/**
 * Cloudinary provider using the REST upload API (no SDK dependency).
 * Activated by STORAGE_DRIVER=cloudinary + CLOUDINARY_* credentials.
 */
export class CloudinaryStorageProvider implements StorageProvider {
  readonly name = 'cloudinary';
  private cloud = env.CLOUDINARY_CLOUD_NAME!;
  private apiKey = env.CLOUDINARY_API_KEY!;
  private apiSecret = env.CLOUDINARY_API_SECRET!;

  private signParams(params: Record<string, string | number>): string {
    const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
    return crypto.createHash('sha1').update(sorted + this.apiSecret).digest('hex');
  }

  async upload({ key, body, mimeType }: UploadInput): Promise<UploadResult> {
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = key.replace(/\.[^/.]+$/, '');
    const resourceType = mimeType?.startsWith('video/') ? 'video' : mimeType?.startsWith('image/') ? 'image' : 'raw';
    const signature = this.signParams({ public_id: publicId, timestamp, type: 'authenticated' });

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(body)], { type: mimeType || 'application/octet-stream' }));
    form.append('api_key', this.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('public_id', publicId);
    form.append('type', 'authenticated');
    form.append('signature', signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${this.cloud}/${resourceType}/upload`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) throw ApiError.internal(`Cloudinary upload failed (${res.status})`);
    const json = (await res.json()) as { secure_url: string; bytes: number };
    return { key, size: json.bytes ?? body.length, provider: this.name, url: json.secure_url };
  }

  async delete(key: string): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = key.replace(/\.[^/.]+$/, '');
    const signature = this.signParams({ public_id: publicId, timestamp });
    const form = new FormData();
    form.append('api_key', this.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('public_id', publicId);
    form.append('signature', signature);
    await fetch(`https://api.cloudinary.com/v1_1/${this.cloud}/image/destroy`, { method: 'POST', body: form });
  }

  getUrl(key: string): string | null {
    return `https://res.cloudinary.com/${this.cloud}/image/upload/${key}`;
  }

  async getSignedUrl(key: string, ttlSeconds = env.STORAGE_SIGNED_URL_TTL): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const publicId = key.replace(/\.[^/.]+$/, '');
    const toSign = `${publicId}?expires_at=${expiresAt}`;
    const sig = crypto.createHmac('sha256', this.apiSecret).update(toSign).digest('hex');
    return `https://res.cloudinary.com/${this.cloud}/image/authenticated/s--${sig.slice(0, 8)}--/${publicId}?expires_at=${expiresAt}`;
  }

  async read(key: string): Promise<Buffer> {
    const url = await this.getSignedUrl(key, 60);
    const res = await fetch(url);
    if (!res.ok) throw ApiError.notFound('Object not found in Cloudinary');
    return Buffer.from(await res.arrayBuffer());
  }

  async exists(key: string): Promise<boolean> {
    const url = this.getUrl(key);
    if (!url) return false;
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  }

  async stat(key: string) {
    const url = this.getUrl(key);
    if (!url) return null;
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return null;
    return { size: Number(res.headers.get('content-length') || 0) };
  }
}
