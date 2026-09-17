/**
 * Single entry point for every network call.
 *
 * - The backend base URL comes from the `VITE_API_URL` build-time env var, so
 *   the deployed frontend can talk to an Express API hosted on a different
 *   origin. Never a hardcoded localhost/127.0.0.1 production base.
 *   When it is empty (local dev) requests stay relative and the Vite dev-server
 *   proxy forwards /api -> the local API.
 * - `credentials: 'include'` so the httpOnly JWT cookies travel with requests.
 *   No token is ever read or written from JS/localStorage.
 * - Unwraps the backend envelope { success, data } / { success, error }.
 */

/**
 * Base origin of the Express API, e.g. https://api.example.com
 *
 * Set `VITE_API_URL` in the Vercel project settings. A trailing slash is
 * tolerated and stripped so `${API_BASE}/api/...` never doubles up. If the var
 * is unset we fall back to a same-origin relative call, which is what local
 * development (Vite proxy) and a same-origin reverse proxy both want.
 */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

/** Builds the absolute (or relative) URL for an API path. */
export function apiUrl(path: string): string {
  return `${API_BASE}/api${path}`;
}

export interface ApiErrorShape {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;

  constructor(status: number, error: ApiErrorShape) {
    super(error.message || 'Something went wrong');
    this.name = 'ApiError';
    this.status = status;
    this.code = error.code || 'UNKNOWN';
    this.fields = error.fields || {};
  }

  get isAuth() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isValidation() {
    return this.status === 422 || this.status === 400;
  }
  get isConflict() {
    return this.status === 409;
  }
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  /** Backend envelope field name (see server utils/http.ts `paginated`). */
  totalPages: number;
  [key: string]: unknown;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function buildQuery(params?: Query): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    sp.append(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Emitted when any request 401s, so the auth layer can drop the session. */
export const AUTH_EXPIRED_EVENT = 'academyos:auth-expired';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Do not broadcast an auth-expired event (used by the session probe itself). */
  silent401?: boolean;
  raw?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, silent401, raw, headers, ...rest } = options;

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const res = await fetch(apiUrl(path), {
    ...rest,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers as Record<string, string>),
    },
    body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (raw) {
    if (!res.ok) throw new ApiError(res.status, { code: 'REQUEST_FAILED', message: 'Download failed' });
    return res as unknown as T;
  }

  // 204 / empty body
  const text = await res.text();
  const payload = text ? safeParse(text) : null;

  if (!res.ok) {
    const error: ApiErrorShape = payload?.error ?? {
      code: 'REQUEST_FAILED',
      message: res.statusText || 'Request failed',
    };
    if (res.status === 401 && !silent401) {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(res.status, error);
  }

  return (payload?.data ?? payload) as T;
}

function safeParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  get: <T>(path: string, params?: Query, options?: RequestOptions) =>
    request<T>(`${path}${buildQuery(params)}`, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  del: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

/** Streams a file response (CSV export, receipt PDF) straight to a download. */
export async function downloadFile(path: string, filename: string, params?: Query) {
  const res = await fetch(apiUrl(`${path}${buildQuery(params)}`), { credentials: 'include' });
  if (!res.ok) {
    const text = await res.text();
    const payload = safeParse(text);
    throw new ApiError(res.status, payload?.error ?? { code: 'DOWNLOAD_FAILED', message: 'Download failed' });
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
