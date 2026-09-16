import { Model, Types, FilterQuery, UpdateQuery, PopulateOptions } from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { buildSort, searchFilter } from '../utils/query';

export interface ListOptions<T> {
  organizationId: Types.ObjectId;
  page: number;
  limit: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  searchFields?: string[];
  filter?: FilterQuery<T>;
  populate?: PopulateOptions | (PopulateOptions | string)[] | string;
  select?: string;
  defaultSort?: string;
}

/**
 * Tenant-safe list helper. `organizationId` is ALWAYS injected from the session
 * and merged last so it cannot be overridden by a caller-supplied filter.
 */
export async function listScoped<T>(model: Model<T>, opts: ListOptions<T>) {
  const filter: FilterQuery<T> = {
    ...(opts.filter ?? {}),
    ...searchFilter<T>(opts.search, opts.searchFields ?? []),
    organizationId: opts.organizationId,
  } as FilterQuery<T>;

  const query = model
    .find(filter)
    .sort(buildSort(opts.sort, opts.order ?? 'desc', opts.defaultSort ?? 'createdAt'))
    .skip((opts.page - 1) * opts.limit)
    .limit(opts.limit);

  if (opts.populate) query.populate(opts.populate as never);
  if (opts.select) query.select(opts.select);

  const [items, total] = await Promise.all([query.lean(), model.countDocuments(filter)]);
  return { items, total };
}

/**
 * Tenant-safe single-document fetch. Returns 404 (never 403) for documents in
 * another organization so tenant existence is not leaked — and it is impossible
 * to read a foreign record by guessing its _id (IDOR protection).
 */
export async function findScoped<T>(
  model: Model<T>,
  id: string | Types.ObjectId,
  organizationId: Types.ObjectId,
  options?: { populate?: PopulateOptions | (PopulateOptions | string)[] | string; select?: string; notFoundMessage?: string },
) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound(options?.notFoundMessage ?? 'Record not found');
  const query = model.findOne({ _id: id, organizationId } as FilterQuery<T>);
  if (options?.populate) query.populate(options.populate as never);
  if (options?.select) query.select(options.select);
  const doc = await query.lean();
  if (!doc) throw ApiError.notFound(options?.notFoundMessage ?? 'Record not found');
  return doc as T;
}

export async function findScopedDoc<T>(
  model: Model<T>,
  id: string | Types.ObjectId,
  organizationId: Types.ObjectId,
  notFoundMessage = 'Record not found',
) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound(notFoundMessage);
  const doc = await model.findOne({ _id: id, organizationId } as FilterQuery<T>);
  if (!doc) throw ApiError.notFound(notFoundMessage);
  return doc;
}

export async function updateScoped<T>(
  model: Model<T>,
  id: string | Types.ObjectId,
  organizationId: Types.ObjectId,
  update: UpdateQuery<T>,
  notFoundMessage = 'Record not found',
) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound(notFoundMessage);
  const doc = await model.findOneAndUpdate(
    { _id: id, organizationId } as FilterQuery<T>,
    update,
    { new: true, runValidators: true },
  ).lean();
  if (!doc) throw ApiError.notFound(notFoundMessage);
  return doc as T;
}

export async function deleteScoped<T>(
  model: Model<T>,
  id: string | Types.ObjectId,
  organizationId: Types.ObjectId,
  notFoundMessage = 'Record not found',
) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound(notFoundMessage);
  const doc = await model.findOneAndDelete({ _id: id, organizationId } as FilterQuery<T>).lean();
  if (!doc) throw ApiError.notFound(notFoundMessage);
  return doc as T;
}

/** Asserts a referenced document exists inside the same tenant before linking it. */
export async function assertBelongsToOrg<T>(
  model: Model<T>,
  id: string | Types.ObjectId | undefined | null,
  organizationId: Types.ObjectId,
  label = 'Referenced record',
): Promise<void> {
  if (!id) return;
  if (!Types.ObjectId.isValid(id)) throw ApiError.validation(`${label} is invalid`);
  const exists = await model.exists({ _id: id, organizationId } as FilterQuery<T>);
  if (!exists) throw ApiError.notFound(`${label} not found in your academy`);
}
