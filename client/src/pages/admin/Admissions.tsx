import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, GraduationCap } from 'lucide-react';
import { useListQuery } from '@/hooks/useApi';
import { DataTable, Column } from '@/components/DataTable';
import { PageHeader, Button, Avatar, StatusBadge, Badge } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate, labelOf } from '@/lib/utils';
import type { Admission } from '@/types';
import { AdmissionWizard } from './AdmissionWizard';

export function AdmissionsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [showWizard, setShowWizard] = useState(params.get('new') === '1');

  const list = useListQuery<Admission>('admissions', '/crm/admissions');

  const close = () => {
    setShowWizard(false);
    if (params.get('new')) {
      params.delete('new');
      setParams(params, { replace: true });
    }
  };

  const columns: Column<Admission>[] = [
    {
      key: 'number',
      header: 'Admission',
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{a.admissionNumber}</p>
          <p className="truncate text-xs text-ink-500">{formatDate(a.admissionDate)}</p>
        </div>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      render: (a) => {
        const s = typeof a.studentId === 'object' ? a.studentId : null;
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
    { key: 'course', header: 'Course', hideBelow: 'md', render: (a) => <span className="text-[13px]">{labelOf(a.courseId, 'title', '—')}</span> },
    { key: 'batch', header: 'Batch', hideBelow: 'xl', render: (a) => <span className="text-[13px]">{labelOf(a.batchId, 'name', 'Unassigned')}</span> },
    {
      key: 'fee',
      header: 'Net fee',
      className: 'text-right',
      hideBelow: 'lg',
      render: (a) => <span className="font-medium text-ink-900">{formatCurrency(a.netAmount ?? a.totalAmount)}</span>,
    },
    { key: 'source', header: 'Source', hideBelow: 'xl', render: (a) => <Badge>{a.source ? a.source.replace('_', ' ') : 'Direct'}</Badge> },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Admissions"
        description={`${list.total} admission${list.total === 1 ? '' : 's'} processed`}
        actions={
          can('admission:create') ? (
            <Button size="sm" onClick={() => setShowWizard(true)} icon={<Plus className="h-4 w-4" />}>
              New admission
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(a) => a._id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search by admission number or student…"
        filters={[
          { key: 'status', label: 'All statuses', options: ['CONFIRMED', 'PENDING', 'CANCELLED'].map((s) => ({ value: s, label: s })) },
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
        onRowClick={(a) => {
          const s = typeof a.studentId === 'object' ? a.studentId : null;
          if (s) navigate(`/admin/students/${s._id}`);
        }}
        emptyTitle="No admissions yet"
        emptyDescription="Run the admission wizard to enrol a student with their fee plan and first payment."
        emptyAction={
          can('admission:create') ? (
            <Button size="sm" onClick={() => setShowWizard(true)} icon={<GraduationCap className="h-4 w-4" />}>
              Start an admission
            </Button>
          ) : undefined
        }
      />

      {showWizard && (
        <AdmissionWizard
          onClose={close}
          onDone={(studentId) => studentId && navigate(`/admin/students/${studentId}`)}
        />
      )}
    </div>
  );
}
