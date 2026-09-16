import { FileText, Download, Trash2, Upload } from 'lucide-react';
import { useListQuery, useApiMutation } from '@/hooks/useApi';
import { DataTable, Column } from '@/components/DataTable';
import { PageHeader, Button, Badge, useToast, useConfirm } from '@/components/ui';
import { downloadFile, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatBytes, formatDate, titleCase } from '@/lib/utils';
import type { DocumentItem } from '@/types';

const CATEGORIES = ['ID_PROOF', 'PHOTO', 'CERTIFICATE', 'MARKSHEET', 'AGREEMENT', 'NOTES', 'OTHER'];

export function DocumentsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const list = useListQuery<DocumentItem>('documents', '/comm/documents');

  const remove = useApiMutation<{ id: string }>((b) => `/comm/documents/${b.id}`, {
    method: 'delete',
    invalidate: ['documents'],
    successMessage: 'Document deleted',
  });

  const handleDownload = async (d: DocumentItem) => {
    try {
      await downloadFile(`/comm/documents/${d._id}/download`, d.fileName ?? d.title);
    } catch (e) {
      toast.error('Download failed', (e as ApiError).message);
    }
  };

  const handleDelete = async (d: DocumentItem) => {
    const ok = await confirm({
      title: `Delete "${d.title}"?`,
      description: 'The file will be removed from storage permanently.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) remove.mutate({ id: d._id });
  };

  const columns: Column<DocumentItem>[] = [
    {
      key: 'title',
      header: 'Document',
      render: (d) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{d.title}</p>
            <p className="truncate text-xs text-ink-500">{d.fileName ?? ''}</p>
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (d) => <Badge>{titleCase(d.category)}</Badge> },
    { key: 'owner', header: 'Linked to', hideBelow: 'lg', render: (d) => <span className="text-[13px]">{d.ownerName ?? titleCase(d.ownerType ?? '—')}</span> },
    { key: 'size', header: 'Size', hideBelow: 'xl', render: (d) => <span className="text-[13px] text-ink-500">{d.sizeBytes ? formatBytes(d.sizeBytes) : '—'}</span> },
    { key: 'uploaded', header: 'Uploaded', hideBelow: 'md', render: (d) => <span className="text-[13px] text-ink-500">{formatDate(d.createdAt, 'DD MMM YYYY')}</span> },
    {
      key: 'actions',
      header: '',
      className: 'w-px',
      render: (d) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" title="Download" onClick={() => handleDownload(d)}>
            <Download className="h-4 w-4" />
          </Button>
          {can('document:delete') && (
            <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(d)}>
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
        title="Documents"
        description={`${list.total} file${list.total === 1 ? '' : 's'} stored`}
      />
      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(d) => d._id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search documents…"
        filters={[
          { key: 'category', label: 'All categories', options: CATEGORIES.map((c) => ({ value: c, label: titleCase(c) })) },
        ]}
        filterValues={list.filters}
        onFilter={list.setFilter}
        onClearFilters={list.clearFilters}
        activeFilterCount={list.activeFilterCount}
        page={list.page}
        pages={list.pages}
        total={list.total}
        limit={list.limit}
        onPage={list.setPage}
        emptyTitle="No documents yet"
        emptyDescription="Upload ID proofs, certificates and marksheets from a student's profile page."
      />
    </div>
  );
}

export const UploadIcon = Upload;
