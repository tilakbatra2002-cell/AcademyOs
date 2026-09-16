import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Download, Receipt as ReceiptIcon, Undo2, Wallet, TrendingUp, AlertTriangle, Clock } from 'lucide-react';
import { useListQuery, useApiMutation, useApiQuery, applyFieldErrors } from '@/hooks/useApi';
import { DataTable, Column } from '@/components/DataTable';
import { StatCard } from '@/components/StatCard';
import {
  PageHeader, Button, Modal, Field, Input, Select, Textarea, StatusBadge, Avatar, Badge,
  useToast, useConfirm, Card, CardHeader, CardsSkeleton,
} from '@/components/ui';
import { downloadFile, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate, labelOf, titleCase } from '@/lib/utils';
import type { Payment, Student, FeePlan, FeeInstallment } from '@/types';

const METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'ONLINE', 'CHEQUE'];

interface FinanceSummary {
  collected: number; collectedThisMonth: number; totalFees: number;
  pending: number; overdue: number; overdueCount: number;
  byMethod: { method: string; total: number; count: number }[];
}

export function PaymentsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);

  const list = useListQuery<Payment>('payments', '/finance/payments');
  const { data: summary, isLoading: summaryLoading } = useApiQuery<FinanceSummary>(['finance', 'summary'], '/finance/summary');

  const refund = useApiMutation<{ id: string; reason: string }>((b) => `/finance/payments/${b.id}/refund`, {
    invalidate: ['payments', 'finance', 'fee-plans', 'dashboard'],
    successMessage: 'Payment refunded',
  });

  const handleRefund = async (p: Payment) => {
    const ok = await confirm({
      title: `Refund ${formatCurrency(p.amount)}?`,
      description: `Payment ${p.paymentNumber} will be marked as refunded and the fee plan balance will reopen.`,
      confirmLabel: 'Refund payment',
      danger: true,
    });
    if (ok) refund.mutate({ id: p._id, reason: 'Refunded by admin' });
  };

  const handleExport = async () => {
    try {
      await downloadFile('/reports/export/payments', `payments-${Date.now()}.csv`, list.params);
      toast.success('Export ready', 'Your CSV download has started.');
    } catch (e) {
      toast.error('Export failed', (e as ApiError).message);
    }
  };

  const columns: Column<Payment>[] = [
    {
      key: 'number',
      header: 'Payment',
      render: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{p.paymentNumber}</p>
          <p className="truncate text-xs text-ink-500">{formatDate(p.paidAt, 'DD MMM YYYY')}</p>
        </div>
      ),
    },
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
    { key: 'method', header: 'Method', hideBelow: 'md', render: (p) => <Badge>{titleCase(p.method)}</Badge> },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-right',
      render: (p) => <span className="font-semibold text-ink-900">{formatCurrency(p.amount)}</span>,
    },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
    {
      key: 'actions',
      header: '',
      className: 'w-px',
      render: (p) => (
        <div className="flex items-center justify-end gap-1">
          {p.receiptId && (
            <Button
              variant="ghost"
              size="icon"
              title="Download receipt"
              onClick={() => downloadFile(`/finance/receipts/${p.receiptId}`, `receipt-${p.paymentNumber}.json`).catch(() => toast.error('Could not download receipt'))}
            >
              <ReceiptIcon className="h-4 w-4" />
            </Button>
          )}
          {can('payment:update') && p.status === 'SUCCESS' && (
            <Button variant="ghost" size="icon" title="Refund payment" onClick={() => handleRefund(p)}>
              <Undo2 className="h-4 w-4 text-rose-500" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments"
        description={`${list.total} payment${list.total === 1 ? '' : 's'} recorded`}
        actions={
          <>
            {can('export:run') && (
              <Button variant="outline" size="sm" onClick={handleExport} icon={<Download className="h-4 w-4" />}>Export</Button>
            )}
            {can('payment:create') && (
              <Button size="sm" onClick={() => setShowForm(true)} icon={<Plus className="h-4 w-4" />}>Record payment</Button>
            )}
          </>
        }
      />

      {summaryLoading ? (
        <CardsSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total collected" value={formatCurrency(summary?.collected, { compact: true })} icon={<Wallet className="h-[18px] w-[18px]" />} tone="emerald" />
          <StatCard label="This month" value={formatCurrency(summary?.collectedThisMonth, { compact: true })} icon={<TrendingUp className="h-[18px] w-[18px]" />} />
          <StatCard label="Pending" value={formatCurrency(summary?.pending, { compact: true })} icon={<Clock className="h-[18px] w-[18px]" />} tone="amber" />
          <StatCard label="Overdue" value={formatCurrency(summary?.overdue, { compact: true })} hint={`${summary?.overdueCount ?? 0} instalments`} icon={<AlertTriangle className="h-[18px] w-[18px]" />} tone="rose" />
        </div>
      )}

      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(p) => p._id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search by payment number or student…"
        filters={[
          { key: 'method', label: 'All methods', options: METHODS.map((m) => ({ value: m, label: titleCase(m) })) },
          { key: 'status', label: 'All statuses', options: ['SUCCESS', 'PENDING', 'FAILED', 'REFUNDED'].map((s) => ({ value: s, label: titleCase(s) })) },
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
        emptyTitle="No payments recorded"
        emptyDescription="Record your first fee payment and a receipt will be generated automatically."
        emptyAction={can('payment:create') ? <Button size="sm" onClick={() => setShowForm(true)} icon={<Plus className="h-4 w-4" />}>Record payment</Button> : undefined}
      />

      {summary?.byMethod && summary.byMethod.length > 0 && (
        <Card>
          <CardHeader title="Collection by method" subtitle="Where the money comes from" />
          <div className="grid grid-cols-2 gap-px bg-ink-200 sm:grid-cols-3 lg:grid-cols-5">
            {summary.byMethod.map((m) => (
              <div key={m.method} className="bg-white px-4 py-3">
                <p className="text-xs font-medium text-ink-500">{titleCase(m.method)}</p>
                <p className="mt-1 text-lg font-bold text-ink-900">{formatCurrency(m.total, { compact: true })}</p>
                <p className="text-xs text-ink-400">{m.count} payment{m.count === 1 ? '' : 's'}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {showForm && <RecordPaymentModal onClose={() => setShowForm(false)} />}
    </div>
  );
}

/* --------------------------- Record payment modal -------------------------- */

interface PaymentForm {
  studentId: string;
  feePlanId: string;
  installmentId: string;
  amount: number;
  method: string;
  transactionId: string;
  notes: string;
}

export function RecordPaymentModal({
  onClose,
  presetStudentId,
  presetFeePlanId,
}: {
  onClose: () => void;
  presetStudentId?: string;
  presetFeePlanId?: string;
}) {
  const { register, handleSubmit, watch, setError, formState: { errors } } = useForm<PaymentForm>({
    defaultValues: {
      studentId: presetStudentId ?? '',
      feePlanId: presetFeePlanId ?? '',
      method: 'CASH',
    },
  });

  const studentId = watch('studentId');
  const feePlanId = watch('feePlanId');

  const { data: students } = useApiQuery<{ items: Student[] }>(['students', 'options'], '/people/students', { limit: 100 });
  const { data: plans } = useApiQuery<{ items: FeePlan[] }>(
    ['fee-plans', studentId],
    '/finance/fee-plans',
    { studentId: studentId || undefined, limit: 50 },
    { enabled: !!studentId },
  );
  const { data: installments } = useApiQuery<{ items: FeeInstallment[] }>(
    ['installments', feePlanId],
    '/finance/installments',
    { feePlanId: feePlanId || undefined, limit: 50 },
    { enabled: !!feePlanId },
  );

  const selectedPlan = plans?.items.find((p) => p._id === feePlanId);
  const pendingInstallments = (installments?.items ?? []).filter((i) => i.status !== 'PAID' && i.status !== 'WAIVED');

  const mutation = useApiMutation<Record<string, unknown>>('/finance/payments', {
    invalidate: ['payments', 'finance', 'fee-plans', 'dashboard', 'installments'],
    successMessage: 'Payment recorded — receipt generated',
    silentError: true,
    onSuccess: onClose,
  });

  const onSubmit = (v: PaymentForm) => {
    mutation.mutate(
      {
        studentId: v.studentId,
        feePlanId: v.feePlanId,
        installmentId: v.installmentId || undefined,
        amount: Number(v.amount),
        method: v.method,
        transactionId: v.transactionId || undefined,
        notes: v.notes || undefined,
      },
      { onError: (e) => applyFieldErrors(e, setError as never) },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Record a payment"
      description="An invoice and receipt are generated automatically."
      size="lg"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={mutation.isPending} onClick={handleSubmit(onSubmit)}>Record payment</Button>
        </>
      }
    >
      {mutation.error && !Object.keys(mutation.error.fields ?? {}).length && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {mutation.error.message}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Student" error={errors.studentId?.message} required className="sm:col-span-2">
          <Select invalid={!!errors.studentId} {...register('studentId', { required: 'Select a student' })}>
            <option value="">Select a student…</option>
            {(students?.items ?? []).map((s) => (
              <option key={s._id} value={s._id}>{s.name} — {s.studentCode}</option>
            ))}
          </Select>
        </Field>

        <Field label="Fee plan" error={errors.feePlanId?.message} required className="sm:col-span-2">
          <Select disabled={!studentId} invalid={!!errors.feePlanId} {...register('feePlanId', { required: 'Select a fee plan' })}>
            <option value="">{studentId ? 'Select a fee plan…' : 'Pick a student first'}</option>
            {(plans?.items ?? []).map((p) => (
              <option key={p._id} value={p._id}>
                {p.title} — {formatCurrency(p.pendingAmount)} pending
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Instalment" hint="Leave blank to auto-allocate to the oldest due" className="sm:col-span-2">
          <Select disabled={!feePlanId} {...register('installmentId')}>
            <option value="">Auto-allocate (oldest first)</option>
            {pendingInstallments.map((i) => (
              <option key={i._id} value={i._id}>
                {i.title} — {formatCurrency(i.amount - i.paidAmount)} due {formatDate(i.dueDate, 'DD MMM')}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Amount" error={errors.amount?.message} required>
          <Input
            type="number"
            min={1}
            invalid={!!errors.amount}
            placeholder="0"
            {...register('amount', { required: 'Enter an amount', min: { value: 1, message: 'Must be more than zero' } })}
          />
        </Field>
        <Field label="Method" required>
          <Select {...register('method')}>
            {METHODS.filter((m) => m !== 'ONLINE').map((m) => (
              <option key={m} value={m}>{titleCase(m)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Transaction / cheque reference" className="sm:col-span-2">
          <Input placeholder="Optional" {...register('transactionId')} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea placeholder="Optional note for the receipt" {...register('notes')} />
        </Field>
      </form>

      {selectedPlan && (
        <div className="mt-4 rounded-xl bg-ink-50 px-3.5 py-3">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-ink-500">Plan balance</span>
            <span className="font-semibold text-ink-900">{formatCurrency(selectedPlan.pendingAmount)}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
