import crypto from 'crypto';
import { env } from '../../config/env';
import { StorageProvider, UploadInput, UploadResult } from './StorageProvider';
import { ApiError } from '../../utils/ApiError';

/**
 * S3 / S3-compatible (MinIO, R2, Wasabi, Spaces) provider implemented with
 * SigV4 request signing over fetch — no AWS SDK dependency required.
 * Activated by setting STORAGE_DRIVER=s3 plus S3_* credentials.
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';
  private bucket = env.S3_BUCKET!;
  private region = env.S3_REGION || 'us-east-1';
  private endpoint = env.S3_ENDPOINT || `https://s3.${env.S3_REGION || 'us-east-1'}.amazonaws.com`;
  private accessKey = env.S3_ACCESS_KEY_ID!;
  private secretKey = env.S3_SECRET_ACCESS_KEY!;

  private objectUrl(key: string): string {
    const base = this.endpoint.replace(/\/$/, '');
    return `${base}/${this.bucket}/${encodeURI(key)}`;
  }

  private sign(method: string, key: string, payloadHash: string, extraHeaders: Record<string, string> = {}) {
    const url = new URL(this.objectUrl(key));
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...extraHeaders,
    };
    const sortedKeys = Object.keys(headers).sort();
    const canonicalHeaders = sortedKeys.map((h) => `${h}:${headers[h]}\n`).join('');
    const signedHeaders = sortedKeys.join(';');
    const canonicalRequest = [method, url.pathname, url.search.slice(1), canonicalHeaders, signedHeaders, payloadHash].join('\n');

    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const hmac = (k: Buffer | string, d: string) => crypto.createHmac('sha256', k).update(d).digest();
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.secretKey}`, dateStamp), this.region), 's3'), 'aws4_request');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    headers.Authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return { url: url.toString(), headers };
  }

  async upload({ key, body, mimeType }: UploadInput): Promise<UploadResult> {
    const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
    const { url, headers } = this.sign('PUT', key, payloadHash, mimeType ? { 'content-type': mimeType } : {});
    const res = await fetch(url, { method: 'PUT', headers, body });
    if (!res.ok) throw ApiError.internal(`S3 upload failed (${res.status})`);
    return { key, size: body.length, provider: this.name, url: this.objectUrl(key) };
  }

  async delete(key: string): Promise<void> {
    const payloadHash = crypto.createHash('sha256').update('').digest('hex');
    const { url, headers } = this.sign('DELETE', key, payloadHash);
    await fetch(url, { method: 'DELETE', headers });
  }

  getUrl(key: string): string | null {
    return this.objectUrl(key);
  }

  /** Presigned GET (SigV4 query signing). */
  async getSignedUrl(key: string, ttlSeconds = env.STORAGE_SIGNED_URL_TTL): Promise<string> {
    const url = new URL(this.objectUrl(key));
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;

    url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
    url.searchParams.set('X-Amz-Credential', `${this.accessKey}/${scope}`);
    url.searchParams.set('X-Amz-Date', amzDate);
    url.searchParams.set('X-Amz-Expires', String(ttlSeconds));
    url.searchParams.set('X-Amz-SignedHeaders', 'host');

    const canonicalRequest = [
      'GET', url.pathname, url.searchParams.toString(), `host:${url.host}\n`, 'host', 'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256', amzDate, scope, crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const hmac = (k: Buffer | string, d: string) => crypto.createHmac('sha256', k).update(d).digest();
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.secretKey}`, dateStamp), this.region), 's3'), 'aws4_request');
    url.searchParams.set('X-Amz-Signature', crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex'));
    return url.toString();
  }

  async read(key: string): Promise<Buffer> {
    const payloadHash = crypto.createHash('sha256').update('').digest('hex');
    const { url, headers } = this.sign('GET', key, payloadHash);
    const res = await fetch(url, { headers });
    if (!res.ok) throw ApiError.notFound('Object not found in S3');
    return Buffer.from(await res.arrayBuffer());
  }

  async exists(key: string): Promise<boolean> {
    const payloadHash = crypto.createHash('sha256').update('').digest('hex');
    const { url, headers } = this.sign('HEAD', key, payloadHash);
    const res = await fetch(url, { method: 'HEAD', headers });
    return res.ok;
  }

  async stat(key: string) {
    const payloadHash = crypto.createHash('sha256').update('').digest('hex');
    const { url, headers } = this.sign('HEAD', key, payloadHash);
    const res = await fetch(url, { method: 'HEAD', headers });
    if (!res.ok) return null;
    return { size: Number(res.headers.get('content-length') || 0) };
  }
}
