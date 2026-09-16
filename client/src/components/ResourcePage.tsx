import { useState, ReactNode } from 'react';
import { useForm, DefaultValues, FieldValues, UseFormReturn } from 'react-hook-form';
import { Plus, Pencil, Trash2, Download } from 'lucide-react';
import { useListQuery, useApiMutation, applyFieldErrors } from '@/hooks/useApi';
import { DataTable, Column, FilterDef } from '@/components/DataTable';
import { PageHeader, Button, Modal, useToast, useConfirm } from '@/components/ui';
import { downloadFile, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export interface ResourcePageProps<T extends { _id: string }, F extends FieldValues> {
  /** Query key + cache namespace, e.g. 'subjects'. */
  resource: string;
  /** Collection endpoint, e.g. '/academics/subjects'. */
  endpoint: string;
  title: string;
  /** Called with the live total so the subtitle can be accurate. */
  describe?: (total: number) => string;
  columns: Column<T>[];
  filters?: FilterDef[];
  searchPlaceholder?: string;
  /** Permission prefix, e.g. 'subject' → subject:create / :update / :delete. */
  permission: string;
  /** Extra query params always sent with the list request. */
  baseParams?: Record<string, string | number | undefined>;

  /* ------------------------------ Create / edit ----------------------------- */
  formTitle?: (row: T | null) => string;
  formDescription?: string;
  formSize?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Render the form body. Receives react-hook-form methods. */
  renderForm?: (form: UseFormReturn<F>, row: T | null) => ReactNode;
  defaultValues?: (row: T | null) => DefaultValues<F>;
  /** Transform form values into the API payload. */
  toPayload?: (values: F, row: T | null) => Record<string, unknown>;

  /* --------------------------------- Options -------------------------------- */
  deleteConfirm?: (row: T) => { title: string; description: string };
  exportPath?: string;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Extra buttons in the header. */
  headerActions?: ReactNode;
  /** Extra content rendered above the table (e.g. KPI cards). */
  children?: ReactNode;
  /** Invalidate these query keys on mutation, in addition to the resource itself. */
  invalidate?: string[];
  /** Hide the built-in row action column. */
  hideRowActions?: boolean;
}

/**
 * A complete list + create + edit + delete page.
 *
 * Search, filters and pagination are all server-side (see useListQuery), so this
 * scales past the few hundred rows a client-side table could handle.
 */
export function ResourcePage<T extends { _id: string }, F extends FieldValues>(props: ResourcePageProps<T, F>) {
  const {
    resource, endpoint, title, describe, columns, filters, searchPlaceholder, permission,
    baseParams, formTitle, formDescription, formSize = 'lg', renderForm, defaultValues, toPayload,
    deleteConfirm, exportPath, onRowClick, emptyTitle, emptyDescription, headerActions, children,
    invalidate = [], hideRowActions,
  } = props;

  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<T | null>(null);
  const [showForm, setShowForm] = useState(false);

  const list = useListQuery<T>(resource, endpoint, baseParams);
  const canCreate = can(`${permission}:create`) && !!renderForm;
  const canUpdate = can(`${permission}:update`) && !!renderForm;
  const canDelete = can(`${permission}:delete`);

  const remove = useApiMutation<{ id: string }>((b) => `${endpoint}/${b.id}`, {
    method: 'delete',
    invalidate: [resource, ...invalidate],
    successMessage: `${singular(title)} deleted`,
  });

  const handleDelete = async (row: T) => {
    const copy = deleteConfirm?.(row) ?? {
      title: `Delete this ${singular(title).toLowerCase()}?`,
      description: 'This action cannot be undone.',
    };
    const ok = await confirm({ ...copy, confirmLabel: 'Delete', danger: true });
    if (ok) remove.mutate({ id: row._id });
  };

  const handleExport = async () => {
    if (!exportPath) return;
    try {
      await downloadFile(exportPath, `${resource}-${Date.now()}.csv`, list.params);
      toast.success('Export ready', 'Your CSV download has started.');
    } catch (e) {
      toast.error('Export failed', (e as ApiError).message);
    }
  };

  const allColumns: Column<T>[] =
    hideRowActions || (!canUpdate && !canDelete)
      ? columns
      : [
          ...columns,
          {
            key: '__actions',
            header: '',
            className: 'w-px',
            render: (row: T) => (
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                {canUpdate && (
                  <Button variant="ghost" size="icon" title="Edit" onClick={() => { setEditing(row); setShowForm(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {canDelete && (
                  <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(row)}>
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                )}
              </div>
            ),
          },
        ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        description={describe ? describe(list.total) : `${list.total} record${list.total === 1 ? '' : 's'}`}
        actions={
          <>
            {headerActions}
            {exportPath && can('export:run') && (
              <Button variant="outline" size="sm" onClick={handleExport} icon={<Download className="h-4 w-4" />}>Export</Button>
            )}
            {canCreate && (
              <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} icon={<Plus className="h-4 w-4" />}>
                New {singular(title).toLowerCase()}
              </Button>
            )}
          </>
        }
      />

      {children}

      <DataTable
        columns={allColumns}
        rows={list.items}
        rowKey={(r) => r._id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder={searchPlaceholder}
        filters={filters}
        filterValues={list.filters}
        onFilter={list.setFilter}
        onClearFilters={list.clearFilters}
        activeFilterCount={list.activeFilterCount}
        page={list.page}
        pages={list.pages}
        total={list.total}
        limit={list.limit}
        onPage={list.setPage}
        onRowClick={onRowClick}
        emptyTitle={emptyTitle ?? `No ${title.toLowerCase()} yet`}
        emptyDescription={emptyDescription}
        emptyAction={
          canCreate ? (
            <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} icon={<Plus className="h-4 w-4" />}>
              New {singular(title).toLowerCase()}
            </Button>
          ) : undefined
        }
      />

      {showForm && renderForm && (
        <ResourceFormModal<T, F>
          row={editing}
          endpoint={endpoint}
          resource={resource}
          invalidate={invalidate}
          title={formTitle?.(editing) ?? (editing ? `Edit ${singular(title).toLowerCase()}` : `New ${singular(title).toLowerCase()}`)}
          description={formDescription}
          size={formSize}
          renderForm={renderForm}
          defaultValues={defaultValues}
          toPayload={toPayload}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ResourceFormModal<T extends { _id: string }, F extends FieldValues>({
  row, endpoint, resource, invalidate, title, description, size, renderForm, defaultValues, toPayload, onClose,
}: {
  row: T | null;
  endpoint: string;
  resource: string;
  invalidate: string[];
  title: string;
  description?: string;
  size: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  renderForm: (form: UseFormReturn<F>, row: T | null) => ReactNode;
  defaultValues?: (row: T | null) => DefaultValues<F>;
  toPayload?: (values: F, row: T | null) => Record<string, unknown>;
  onClose: () => void;
}) {
  const isEdit = !!row;
  const form = useForm<F>({ defaultValues: defaultValues?.(row) });

  const mutation = useApiMutation<Record<string, unknown>>(isEdit ? `${endpoint}/${row!._id}` : endpoint, {
    method: isEdit ? 'patch' : 'post',
    invalidate: [resource, 'dashboard', ...invalidate],
    successMessage: isEdit ? 'Changes saved' : 'Created successfully',
    silentError: true,
    onSuccess: onClose,
  });

  const submit = form.handleSubmit((values) => {
    const payload = toPayload ? toPayload(values, row) : clean(values as object);
    mutation.mutate(payload, { onError: (e) => applyFieldErrors(e, form.setError as never) });
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      size={size}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={mutation.isPending} onClick={submit}>
            {isEdit ? 'Save changes' : 'Create'}
          </Button>
        </>
      }
    >
      {mutation.error && !Object.keys(mutation.error.fields ?? {}).length && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {mutation.error.message}
        </div>
      )}
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {renderForm(form, row)}
      </form>
    </Modal>
  );
}

/** Drop empty strings so optional fields are omitted rather than sent as ''. */
export function clean(values: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
    if (v === '' || v === undefined || v === null) continue;
    out[k] = v;
  }
  return out;
}

function singular(title: string) {
  if (title.endsWith('ies')) return `${title.slice(0, -3)}y`;
  if (title.endsWith('ses')) return title.slice(0, -2);
  if (title.endsWith('s')) return title.slice(0, -1);
  return title;
}
