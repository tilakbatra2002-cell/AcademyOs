import { Download, FileText } from 'lucide-react';
import { useListQuery, useApiQuery } from '@/hooks/useApi';
import { DataTable, Column } from '@/components/DataTable';
import { PageHeader, Button, StatusBadge, Avatar, useToast } from '@/components/ui';
import { downloadFile, ApiError } from '@/lib/api';
import { formatCurrency, formatDate, labelOf } from '@/lib/utils';
import type { Invoice, Course } from '@/types';

export function InvoicesPage() {
  const toast = useToast();
  const { data: courses } = useApiQuery<{ items: Course[] }>(['courses', 'options'], '/academics/courses', { limit: 100 });
  const list = useListQuery<Invoice>('invoices', '/finance/invoices');

  const open = async (i: Invoice) => {
    try {
      await downloadFile(`/finance/invoices/${i._id}`, `${i.invoiceNumber}.json`);
    } catch (e) {
      toast.error('Could not download', (e as ApiError).message);
    }
  };

  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      header: 'Invoice',
      render: (i) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{i.invoiceNumber}</p>
            <p className="truncate text-xs text-ink-500">{formatDate(i.issueDate, 'DD MMM YYYY')}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      render: (i) => {
        const s = typeof i.studentId === 'object' ? i.studentId : null;
        return (
          <div className="flex items-center gap-2.5">
            <Avatar name={s?.name} size="xs" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink-900">{s?.name ?? '—'}</p>
              <p className="truncate text-xs text-ink-500">{s?.studentCode ?? ''}</p>
            </div>
          </div>
        );
      },
    },
    { key: 'course', header: 'Course', hideBelow: 'lg', render: (i) => <span className="text-[13px]">{labelOf(i.courseId, 'title', '—')}</span> },
    { key: 'due', header: 'Due', hideBelow: 'xl', render: (i) => <span className="text-[13px] text-ink-500">{i.dueDate ? formatDate(i.dueDate, 'DD MMM YYYY') : '—'}</span> },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-right',
      render: (i) => <span className="font-semibold text-ink-900">{formatCurrency(i.totalAmount ?? i.amount)}</span>,
    },
    { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
    {
      key: 'dl',
      header: '',
      className: 'w-px',
      render: (i) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" title="Download invoice" onClick={() => open(i)}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Invoices" description={`${list.total} invoice${list.total === 1 ? '' : 's'} issued`} />
      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(i) => i._id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search by invoice number or student…"
        filters={[
          { key: 'status', label: 'All statuses', options: ['PAID', 'UNPAID', 'PARTIAL', 'CANCELLED'].map((s) => ({ value: s, label: s })) },
          { key: 'courseId', label: 'All courses', options: (courses?.items ?? []).map((c) => ({ value: c._id, label: c.title })) },
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
        emptyTitle="No invoices yet"
        emptyDescription="Invoices are generated automatically whenever a payment is recorded."
      />
    </div>
  );
}
