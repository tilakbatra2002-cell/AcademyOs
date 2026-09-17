import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function bool(v: string | undefined, def = false): boolean {
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/academyos',
  /**
   * Mongo connection-pool size per process.
   *
   * On an always-on server a larger pool is good. In a serverless deployment
   * every warm Function instance keeps its own pool, so a high value multiplied
   * by many instances can exhaust the cluster's connection limit (~500 on Atlas
   * M0/M2). Default to a small pool when running on Vercel.
   */
  MONGO_MAX_POOL_SIZE: parseInt(
    process.env.MONGO_MAX_POOL_SIZE || (process.env.VERCEL ? '5' : '20'),
    10,
  ),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL || '2h',
  JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL || '7d',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,
  COOKIE_SECURE: bool(process.env.COOKIE_SECURE, false),
  COOKIE_SAMESITE: (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'strict' | 'none',
  SESSION_IDLE_MINUTES: parseInt(process.env.SESSION_IDLE_MINUTES || '240', 10),
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '600', 10),
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '30', 10),

  STORAGE_DRIVER: (process.env.STORAGE_DRIVER || 'local') as 'local' | 's3' | 'cloudinary',
  STORAGE_LOCAL_DIR: process.env.STORAGE_LOCAL_DIR || path.resolve(process.cwd(), 'storage'),
  STORAGE_SIGNED_URL_TTL: parseInt(process.env.STORAGE_SIGNED_URL_TTL || '3600', 10),

  S3_BUCKET: process.env.S3_BUCKET,
  S3_REGION: process.env.S3_REGION,
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,

  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,

  SMS_PROVIDER: process.env.SMS_PROVIDER,
  SMS_API_KEY: process.env.SMS_API_KEY,
  WHATSAPP_PROVIDER: process.env.WHATSAPP_PROVIDER,
  WHATSAPP_API_KEY: process.env.WHATSAPP_API_KEY,

  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  PAYMENT_PROVIDER: (process.env.PAYMENT_PROVIDER || 'manual') as 'manual' | 'razorpay' | 'stripe',

  TRIAL_DAYS: parseInt(process.env.TRIAL_DAYS || '14', 10),
};

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
