import { z } from 'zod';
import { FilterQuery } from 'mongoose';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().max(120).optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export function buildSort(sort?: string, order: 'asc' | 'desc' = 'desc', fallback = 'createdAt'): Record<string, 1 | -1> {
  const field = (sort && /^[a-zA-Z0-9_.]+$/.test(sort) ? sort : fallback);
  return { [field]: order === 'asc' ? 1 : -1 };
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive OR search across the given fields. */
export function searchFilter<T>(search: string | undefined, fields: string[]): FilterQuery<T> {
  if (!search?.trim()) return {};
  const rx = new RegExp(escapeRegex(search.trim()), 'i');
  return { $or: fields.map((f) => ({ [f]: rx })) } as FilterQuery<T>;
}

export function dateRangeFilter(from?: string, to?: string): Record<string, Date> | undefined {
  const range: Record<string, Date> = {};
  if (from) range.$gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return Object.keys(range).length ? range : undefined;
}

export const objectIdString = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, 'Must be a valid identifier');

export const idParamSchema = z.object({ id: objectIdString });
