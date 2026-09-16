import { useState } from 'react';
import { Wallet, Plus } from 'lucide-react';
import { useListQuery, useApiQuery } from '@/hooks/useApi';
import { DataTable, Column } from '@/components/DataTable';
import {
  PageHeader, Button, Badge, StatusBadge, Avatar, Modal, Skeleton, ProgressBar, EmptyState,
} from '@/components/ui';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate, labelOf } from '@/lib/utils';
import type { FeePlan, FeeInstallment, Course } from '@/types';
import { RecordPaymentModal } from './Payments';

export function FeePlansPage() {
  const { can } = useAuth();
  const [detail, setDetail] = useState<FeePlan | null>(null);
  const [collecting, setCollecting] = useState<FeePlan | null>(null);
  const { data: courses } = useApiQuery<{ items: Course[] }>(['courses', 'options'], '/academics/courses', { limit: 100 });

  const list = useListQuery<FeePlan>('fee-plans', '/finance/fee-plans');

  const columns: Column<FeePlan>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (p) => {
        const s = typeof p.studentId === 'object' ? p.studentId : null;
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
    { key: 'course', header: 'Course', hideBelow: 'lg', render: (p) => <span className="text-[13px]">{labelOf(p.courseId, 'title', '—')}</span> },
    {
      key: 'net',
      header: 'Net fee',
      className: 'text-right',
      hideBelow: 'md',
      render: (p) => <span className="text-[13px] font-medium">{formatCurrency(p.netAmount)}</span>,
    },
    {
      key: 'progress',
      header: 'Collected',
      render: (p) => {
        const pct = p.netAmount ? Math.round((p.paidAmount / p.netAmount) * 100) : 0;
        return (
          <div className="w-36">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-ink-700">{formatCurrency(p.paidAmount, { compact: true })}</span>
              <span className="text-ink-400">{pct}%</span>
            </div>
            <ProgressBar value={pct} tone={pct >= 100 ? 'emerald' : pct >= 50 ? 'brand' : 'amber'} />
          </div>
        );
      },
    },
    {
      key: 'pending',
      header: 'Pending',
      className: 'text-right',
      render: (p) => (
        <span className={`text-[13px] font-semibold ${p.pendingAmount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
          {formatCurrency(p.pendingAmount)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
    {
      key: 'collect',
      header: '',
      className: 'w-px',
      render: (p) =>
        can('payment:create') && p.pendingAmount > 0 ? (
          <div onClick={(e) => e.stopPropagation()}>
            <Button variant="outline" size="sm" onClick={() => setCollecting(p)}>Collect</Button>
          </div>
        ) : null,
    },
  ];

  const totals = list.items.reduce(
    (acc, p) => {
      acc.net += p.netAmount;
      acc.paid += p.paidAmount;
      acc.pending += p.pendingAmount;
      return acc;
    },
    { net: 0, paid: 0, pending: 0 },
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Fee plans" description={`${list.total} plan${list.total === 1 ? '' : 's'} across your students`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Billed (this page)" value={formatCurrency(totals.net, { compact: true })} loading={list.isLoading} />
        <StatCard label="Collected" value={formatCurrency(totals.paid, { compact: true })} tone="emerald" loading={list.isLoading} />
        <StatCard label="Outstanding" value={formatCurrency(totals.pending, { compact: true })} tone={totals.pending ? 'rose' : 'emerald'} loading={list.isLoading} />
      </div>

      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(p) => p._id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search by student…"
        filters={[
          { key: 'status', label: 'All statuses', options: ['ACTIVE', 'COMPLETED', 'OVERDUE', 'CANCELLED'].map((s) => ({ value: s, label: s })) },
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
        onRowClick={(p) => setDetail(p)}
        emptyTitle="No fee plans yet"
        emptyDescription="Fee plans are created automatically when you admit a student."
      />

      {detail && <FeePlanDetail plan={detail} onClose={() => setDetail(null)} onCollect={() => { setCollecting(detail); setDetail(null); }} />}
      {collecting && (
        <RecordPaymentModal
          onClose={() => setCollecting(null)}
          presetStudentId={typeof collecting.studentId === 'object' ? collecting.studentId._id : (collecting.studentId as string)}
          presetFeePlanId={collecting._id}
        />
      )}
    </div>
  );
}

function FeePlanDetail({ plan, onClose, onCollect }: { plan: FeePlan; onClose: () => void; onCollect: () => void }) {
  const { can } = useAuth();
  const { data, isLoading } = useApiQuery<{ feePlan: FeePlan; installments: FeeInstallment[] }>(
    ['fee-plans', plan._id],
    `/finance/fee-plans/${plan._id}`,
  );
  const student = typeof plan.studentId === 'object' ? plan.studentId : null;
  const installments = data?.installments ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      title={student?.name ?? 'Fee plan'}
      description={plan.title}
      size="lg"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          {can('payment:create') && plan.pendingAmount > 0 && (
            <Button size="sm" onClick={onCollect} icon={<Plus className="h-4 w-4" />}>Collect payment</Button>
          )}
        </>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-ink-50 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Net fee</p>
          <p className="mt-0.5 text-base font-bold text-ink-900">{formatCurrency(plan.netAmount)}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-600">Paid</p>
          <p className="mt-0.5 text-base font-bold text-emerald-700">{formatCurrency(plan.paidAmount)}</p>
        </div>
        <div className="rounded-xl bg-rose-50 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-rose-600">Pending</p>
          <p className="mt-0.5 text-base font-bold text-rose-700">{formatCurrency(plan.pendingAmount)}</p>
        </div>
      </div>

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Instalments</p>
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : installments.length === 0 ? (
        <EmptyState icon={<Wallet className="h-6 w-6" />} title="No instalments" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-200 divide-y divide-ink-100">
          {installments.map((i) => {
            const overdue = i.status !== 'PAID' && new Date(i.dueDate) < new Date();
            return (
              <div key={i._id} className="flex items-center gap-3 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink-900">{i.title}</p>
                  <p className={`truncate text-xs ${overdue ? 'font-medium text-rose-600' : 'text-ink-500'}`}>
                    Due {formatDate(i.dueDate, 'DD MMM YYYY')}{overdue ? ' · overdue' : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-semibold text-ink-900">{formatCurrency(i.amount)}</p>
                  {i.paidAmount > 0 && i.paidAmount < i.amount && (
                    <p className="text-xs text-ink-500">{formatCurrency(i.paidAmount)} paid</p>
                  )}
                </div>
                <Badge tone={i.status}>{i.status}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
