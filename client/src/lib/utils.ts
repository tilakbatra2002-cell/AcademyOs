import clsx, { type ClassValue } from 'clsx';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/* --------------------------------- Currency -------------------------------- */

export function formatCurrency(value?: number | null, opts: { compact?: boolean } = {}) {
  const n = Number(value ?? 0);
  if (opts.compact && Math.abs(n) >= 100000) {
    if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
    return `₹${(n / 100000).toFixed(2)} L`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatNumber(value?: number | null) {
  return new Intl.NumberFormat('en-IN').format(Number(value ?? 0));
}

/* ---------------------------------- Dates ---------------------------------- */

export const formatDate = (d?: string | Date | null, f = 'DD MMM YYYY') => (d ? dayjs(d).format(f) : '—');
export const formatDateTime = (d?: string | Date | null) => (d ? dayjs(d).format('DD MMM YYYY, h:mm A') : '—');
export const formatTime = (d?: string | Date | null) => (d ? dayjs(d).format('h:mm A') : '—');
export const fromNow = (d?: string | Date | null) => (d ? dayjs(d).fromNow() : '—');
export const toInputDate = (d?: string | Date | null) => (d ? dayjs(d).format('YYYY-MM-DD') : '');
export const isPast = (d?: string | Date | null) => (d ? dayjs(d).isBefore(dayjs()) : false);

/** "10:00" -> "10:00 AM" */
export function formatClock(hhmm?: string) {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatDuration(seconds?: number | null) {
  const s = Number(seconds ?? 0);
  if (!s) return '0m';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatBytes(bytes?: number | null) {
  const b = Number(bytes ?? 0);
  if (b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/* --------------------------------- Display --------------------------------- */

export function initials(name?: string) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function titleCase(value?: string) {
  if (!value) return '';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Deterministic pastel avatar colour from a string. */
export function avatarColor(seed?: string) {
  const palette = [
    'bg-indigo-100 text-indigo-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-sky-100 text-sky-700',
    'bg-violet-100 text-violet-700',
    'bg-teal-100 text-teal-700',
  ];
  if (!seed) return palette[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/** Pulls an id out of a field that may be populated or a raw string. */
export function idOf(ref?: { _id: string } | string | null): string {
  if (!ref) return '';
  return typeof ref === 'string' ? ref : ref._id;
}

/** Pulls a display label out of a possibly-populated ref. */
export function labelOf(
  ref?: Record<string, unknown> | string | null,
  key = 'name',
  fallback = '—',
): string {
  if (!ref) return fallback;
  if (typeof ref === 'string') return fallback;
  return (ref[key] as string) ?? fallback;
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms = 300) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ------------------------------ Status colours ----------------------------- */

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  ONGOING: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  PUBLISHED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  PAID: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  SUCCESS: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  COMPLETED: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  PRESENT: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  GRADED: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  ADMITTED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  UPCOMING: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  PARTIAL: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  PROCESSING: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  LATE: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  SUBMITTED: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  TRIALING: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  TRIAL: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  DRAFT: 'bg-ink-100 text-ink-600 ring-ink-500/20',
  SCHEDULED: 'bg-ink-100 text-ink-600 ring-ink-500/20',
  INACTIVE: 'bg-ink-100 text-ink-600 ring-ink-500/20',
  LEAVE: 'bg-ink-100 text-ink-600 ring-ink-500/20',
  ARCHIVED: 'bg-ink-100 text-ink-600 ring-ink-500/20',
  OVERDUE: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  ABSENT: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  FAILED: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  CANCELLED: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  LOST: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  DROPPED: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  SUSPENDED: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  EXPIRED: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  REFUNDED: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  WAIVED: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

export function statusStyle(status?: string) {
  if (!status) return 'bg-ink-100 text-ink-600 ring-ink-500/20';
  return STATUS_STYLES[status.toUpperCase()] ?? 'bg-brand-50 text-brand-700 ring-brand-600/20';
}

export const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'bg-ink-100 text-ink-600 ring-ink-500/20',
  MEDIUM: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  NORMAL: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  HIGH: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  URGENT: 'bg-rose-50 text-rose-700 ring-rose-600/20',
};

export function gradeStyle(grade?: string) {
  if (!grade) return 'bg-ink-100 text-ink-600';
  if (grade.startsWith('A')) return 'bg-emerald-100 text-emerald-800';
  if (grade.startsWith('B')) return 'bg-sky-100 text-sky-800';
  if (grade.startsWith('C')) return 'bg-amber-100 text-amber-800';
  if (grade.startsWith('D')) return 'bg-orange-100 text-orange-800';
  return 'bg-rose-100 text-rose-800';
}
