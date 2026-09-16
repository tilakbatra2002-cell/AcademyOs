import { ReactNode } from 'react';
import { Inbox, SlidersHorizontal, X } from 'lucide-react';
import {
  Card, Table, Th, Td, TableSkeleton, EmptyState, ErrorState, Pagination, SearchInput, Select, Button,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ApiError } from '@/lib/api';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  /** Hide on small screens to keep mobile tables readable. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: ApiError | null;
  onRetry?: () => void;

  /* search + filters */
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  filterValues?: Record<string, string>;
  onFilter?: (key: string, value: string) => void;
  onClearFilters?: () => void;
  activeFilterCount?: number;

  /* pagination */
  page?: number;
  pages?: number;
  total?: number;
  limit?: number;
  onPage?: (p: number) => void;

  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  toolbarExtra?: ReactNode;
  /** Rendered above the table, e.g. bulk actions. */
  banner?: ReactNode;
}

const HIDE: Record<string, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

export function DataTable<T>({
  columns, rows, rowKey, loading, error, onRetry,
  search, onSearch, searchPlaceholder, filters, filterValues = {}, onFilter, onClearFilters, activeFilterCount = 0,
  page = 1, pages = 1, total = 0, limit = 20, onPage,
  onRowClick, emptyTitle = 'Nothing here yet', emptyDescription, emptyAction, toolbarExtra, banner,
}: DataTableProps<T>) {
  const hasToolbar = !!onSearch || (filters && filters.length > 0) || !!toolbarExtra;

  return (
    <Card className="overflow-hidden">
      {hasToolbar && (
        <div className="flex flex-col gap-3 border-b border-ink-200/70 px-4 py-3 lg:flex-row lg:items-center">
          {onSearch && (
            <SearchInput
              value={search ?? ''}
              onChange={onSearch}
              placeholder={searchPlaceholder ?? 'Search…'}
              className="lg:max-w-xs"
            />
          )}
          {filters && filters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {filters.map((f) => (
                <Select
                  key={f.key}
                  value={filterValues[f.key] ?? ''}
                  onChange={(e) => onFilter?.(f.key, e.target.value)}
                  className="h-10 w-auto min-w-[140px] py-0 text-[13px]"
                  aria-label={f.label}
                >
                  <option value="">{f.label}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ))}
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={onClearFilters} icon={<X className="h-3.5 w-3.5" />}>
                  Clear ({activeFilterCount})
                </Button>
              )}
            </div>
          )}
          {toolbarExtra && <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{toolbarExtra}</div>}
        </div>
      )}

      {banner}

      {error ? (
        <ErrorState
          title="Could not load this list"
          description={error.message}
          onRetry={onRetry}
        />
      ) : loading ? (
        <TableSkeleton rows={6} cols={Math.min(columns.length, 6)} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={activeFilterCount > 0 || search ? <SlidersHorizontal className="h-6 w-6" /> : <Inbox className="h-6 w-6" />}
          title={activeFilterCount > 0 || search ? 'No matches' : emptyTitle}
          description={
            activeFilterCount > 0 || search
              ? 'Try a different search term or clear the filters.'
              : emptyDescription
          }
          action={
            activeFilterCount > 0 || search ? (
              <Button variant="outline" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            ) : (
              emptyAction
            )
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              {columns.map((c) => (
                <Th key={c.key} className={cn(c.className, c.hideBelow && HIDE[c.hideBelow])}>
                  {c.header}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('transition', onRowClick && 'cursor-pointer hover:bg-ink-50')}
              >
                {columns.map((c) => (
                  <Td key={c.key} className={cn(c.className, c.hideBelow && HIDE[c.hideBelow])}>
                    {c.render(row)}
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {!loading && !error && rows.length > 0 && onPage && (
        <Pagination page={page} pages={pages} total={total} limit={limit} onPage={onPage} />
      )}
    </Card>
  );
}
