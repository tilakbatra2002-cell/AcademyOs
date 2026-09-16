import { useListQuery, useApiQuery } from '@/hooks/useApi';
import { DataTable, Column } from '@/components/DataTable';
import { PageHeader, Avatar, StatusBadge } from '@/components/ui';
import type { Student, Batch } from '@/types';

export function TeacherStudents() {
  const list = useListQuery<Student>('me-students', '/portal/me/students');
  const { data: batches } = useApiQuery<{ items: Batch[] }>(['me', 'batches'], '/portal/me/batches');

  const columns: Column<Student>[] = [
    {
      key: 'name',
      header: 'Student',
      render: (s) => (
        <div className="flex items-center gap-3">
          <Avatar name={s.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{s.name}</p>
            <p className="truncate text-xs text-ink-500">{s.studentCode}</p>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', hideBelow: 'md', render: (s) => <span className="text-[13px]">{s.phone ?? '—'}</span> },
    { key: 'email', header: 'Email', hideBelow: 'lg', render: (s) => <span className="text-[13px] text-ink-500">{s.email ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="My students" description={`${list.total} student${list.total === 1 ? '' : 's'} in your batches`} />
      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(s) => s._id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search your students…"
        filters={[
          { key: 'batchId', label: 'All my batches', options: (batches?.items ?? []).map((b) => ({ value: b._id, label: b.name })) },
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
        emptyTitle="No students yet"
        emptyDescription="Students appear here once they are enrolled into your batches."
      />
    </div>
  );
}
