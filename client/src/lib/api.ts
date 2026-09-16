/**
 * Single entry point for every network call.
 *
 * - Always relative `/api/...` so the browser talks to the Vite proxy / same
 *   origin in production; never a hardcoded localhost:4000.
 * - `credentials: 'include'` so the httpOnly JWT cookies travel with requests.
 *   No token is ever read or written from JS/localStorage.
 * - Unwraps the backend envelope { success, data } / { success, error }.
 */

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

  const res = await fetch(`/api${path}`, {
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
  const res = await fetch(`/api${path}${buildQuery(params)}`, { credentials: 'include' });
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
