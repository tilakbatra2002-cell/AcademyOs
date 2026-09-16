import {
  useQuery, useMutation, useQueryClient, UseQueryOptions, QueryKey,
} from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import { api, ApiError, Paginated } from '@/lib/api';
import { useToast } from '@/components/ui';

/* ------------------------------ Generic fetch ------------------------------ */

export function useApiQuery<T>(
  key: QueryKey,
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  options?: Omit<UseQueryOptions<T, ApiError>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<T, ApiError>({
    queryKey: key,
    queryFn: () => api.get<T>(path, params),
    ...options,
  });
}

/* ---------------------------- List + pagination ---------------------------- */

export interface ListState {
  page: number;
  limit: number;
  search: string;
  sort?: string;
  filters: Record<string, string>;
}

export function useDebounced<T>(value: T, ms = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Drives every list page: search, filters, sorting and pagination all live here
 * and are sent to the backend as query params (server-side, not client-side).
 */
export function useListQuery<T>(
  resource: string,
  path: string,
  /** Params merged into every request (e.g. a fixed courseId). */
  baseParams: Record<string, string | number | undefined> = {},
  initial: Partial<ListState> = {},
) {
  const [page, setPage] = useState(initial.page ?? 1);
  const [limit, setLimit] = useState(initial.limit ?? 20);
  const [search, setSearch] = useState(initial.search ?? '');
  const [sort, setSort] = useState(initial.sort);
  const [filters, setFilters] = useState<Record<string, string>>(initial.filters ?? {});

  // Stable identity so the params memo below doesn't rerun on every render.
  const baseKey = JSON.stringify(baseParams ?? {});

  const debouncedSearch = useDebounced(search);

  // Any change to the result set should bring the user back to page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters, limit]);

  const params = useMemo(
    () => ({
      ...(JSON.parse(baseKey) as Record<string, string | number | undefined>),
      page,
      limit,
      search: debouncedSearch || undefined,
      sort,
      ...filters,
    }),
    [baseKey, page, limit, debouncedSearch, sort, filters],
  );

  const query = useQuery<Paginated<T>, ApiError>({
    queryKey: [resource, params],
    queryFn: () => api.get<Paginated<T>>(path, params),
    placeholderData: (prev) => prev,
  });

  const setFilter = (key: string, value: string) =>
    setFilters((f) => {
      const next = { ...f };
      if (!value) delete next[key];
      else next[key] = value;
      return next;
    });

  const clearFilters = () => {
    setFilters({});
    setSearch('');
  };

  const activeFilterCount = Object.keys(filters).length;

  return {
    ...query,
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    pages: query.data?.totalPages ?? 1,
    extra: query.data as Record<string, unknown> | undefined,
    page,
    setPage,
    limit,
    setLimit,
    search,
    setSearch,
    sort,
    setSort,
    filters,
    setFilter,
    clearFilters,
    activeFilterCount,
    params,
  };
}

/* -------------------------------- Mutations -------------------------------- */

interface MutationConfig<TBody, TResult> {
  method?: 'post' | 'patch' | 'put' | 'delete';
  /** Query keys (prefixes) to invalidate on success. */
  invalidate?: string[];
  successMessage?: string | ((result: TResult, body: TBody) => string);
  onSuccess?: (result: TResult, body: TBody) => void;
  /** Suppress the automatic error toast (e.g. to render field errors inline). */
  silentError?: boolean;
}

export function useApiMutation<TBody = unknown, TResult = unknown>(
  path: string | ((body: TBody) => string),
  config: MutationConfig<TBody, TResult> = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  const { method = 'post', invalidate = [], successMessage, onSuccess, silentError } = config;

  return useMutation<TResult, ApiError, TBody>({
    mutationFn: (body: TBody) => {
      const url = typeof path === 'function' ? path(body) : path;
      if (method === 'delete') return api.del<TResult>(url);
      return api[method]<TResult>(url, body);
    },
    onSuccess: (result, body) => {
      invalidate.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
      if (successMessage) {
        toast.success(typeof successMessage === 'function' ? successMessage(result, body) : successMessage);
      }
      onSuccess?.(result, body);
    },
    onError: (error) => {
      if (silentError) return;
      toast.error(errorTitle(error), error.message);
    },
  });
}

export function errorTitle(error: ApiError) {
  if (error.isForbidden) return 'Not allowed';
  if (error.isNotFound) return 'Not found';
  if (error.isConflict) return 'Conflict';
  if (error.isValidation) return 'Check the form';
  if (error.status === 429) return 'Too many requests';
  if (error.status === 402) return 'Subscription inactive';
  return 'Something went wrong';
}

/** Maps a 422 field-error payload onto react-hook-form. */
export function applyFieldErrors(
  error: ApiError,
  setError: (name: string, err: { type: string; message: string }) => void,
) {
  Object.entries(error.fields ?? {}).forEach(([field, message]) => {
    setError(field, { type: 'server', message: String(message) });
  });
}
