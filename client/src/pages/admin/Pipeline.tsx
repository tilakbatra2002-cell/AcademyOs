import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Phone, IndianRupee, GripVertical, Plus, RefreshCw } from 'lucide-react';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import {
  PageHeader, Card, Skeleton, ErrorState, EmptyState, Badge, Avatar, Button, useToast,
} from '@/components/ui';
import { cn, formatCurrency, fromNow, titleCase } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import type { Lead } from '@/types';
import { LeadFormModal } from './Leads';

interface KanbanColumn {
  status: string;
  count: number;
  items: Lead[];
}

const COLUMN_TONE: Record<string, string> = {
  NEW: 'border-t-sky-400',
  CONTACTED: 'border-t-indigo-400',
  QUALIFIED: 'border-t-violet-400',
  DEMO_SCHEDULED: 'border-t-amber-400',
  NEGOTIATION: 'border-t-orange-400',
  ADMITTED: 'border-t-emerald-500',
  LOST: 'border-t-rose-400',
  FOLLOW_UP: 'border-t-teal-400',
};

export function PipelinePage() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useApiQuery<{ columns: KanbanColumn[] }>(
    ['leads', 'kanban'],
    '/crm/leads/kanban',
  );

  const move = useApiMutation<{ id: string; status: string }>((b) => `/crm/leads/${b.id}/status`, {
    method: 'patch',
    invalidate: ['leads', 'dashboard'],
    silentError: true,
  });

  const onDrop = (status: string) => {
    const id = dragging;
    setDragging(null);
    setDragOver(null);
    if (!id) return;
    const from = data?.columns.find((c) => c.items.some((i) => i._id === id));
    if (from?.status === status) return;

    move.mutate(
      { id, status },
      {
        onSuccess: () => toast.success('Lead moved', `Now in ${titleCase(status)}.`),
        onError: (e) => {
          toast.error('Could not move lead', e.message);
          qc.invalidateQueries({ queryKey: ['leads'] });
        },
      },
    );
  };

  if (error) return <ErrorState title="Could not load the pipeline" description={error.message} onRetry={() => refetch()} />;

  const columns = data?.columns ?? [];
  const totalValue = columns
    .filter((c) => !['LOST', 'ADMITTED'].includes(c.status))
    .reduce((sum, c) => sum + c.items.reduce((s, i) => s + (i.expectedValue ?? 0), 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Admission pipeline"
        description={`${columns.reduce((s, c) => s + c.count, 0)} leads · ${formatCurrency(totalValue, { compact: true })} in open opportunities`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} loading={isFetching} icon={<RefreshCw className="h-4 w-4" />}>
              Refresh
            </Button>
            {can('lead:create') && (
              <Button size="sm" onClick={() => setShowForm(true)} icon={<Plus className="h-4 w-4" />}>
                New lead
              </Button>
            )}
          </>
        }
      />

      {can('lead:update') && (
        <p className="text-[13px] text-ink-500">
          Drag a card to another column to change its stage — the change is saved immediately.
        </p>
      )}

      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="w-[300px] shrink-0 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <div
              key={col.status}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.status);
              }}
              onDragLeave={() => setDragOver((s) => (s === col.status ? null : s))}
              onDrop={() => onDrop(col.status)}
              className={cn(
                'flex w-[300px] shrink-0 flex-col rounded-2xl border border-t-[3px] border-ink-200/80 bg-ink-100/40 transition',
                COLUMN_TONE[col.status] ?? 'border-t-ink-300',
                dragOver === col.status && 'bg-[var(--brand-primary)]/[0.06] ring-2 ring-[var(--brand-primary)]/30',
              )}
            >
              <div className="flex items-center justify-between px-3.5 py-3">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-600">
                  {titleCase(col.status)}
                </h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink-600 shadow-ring">
                  {col.count}
                </span>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto px-2.5 pb-3" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                {col.items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-ink-300 px-3 py-6 text-center">
                    <p className="text-xs text-ink-400">No leads here</p>
                  </div>
                ) : (
                  col.items.map((lead) => (
                    <Link
                      key={lead._id}
                      to={`/admin/leads/${lead._id}`}
                      draggable={can('lead:update')}
                      onDragStart={() => setDragging(lead._id)}
                      onDragEnd={() => setDragging(null)}
                      className={cn(
                        'group block rounded-xl border border-ink-200 bg-white p-3 shadow-card transition hover:shadow-lift',
                        dragging === lead._id && 'opacity-40',
                        can('lead:update') && 'cursor-grab active:cursor-grabbing',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {can('lead:update') && (
                          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-300 opacity-0 transition group-hover:opacity-100" />
                        )}
                        <Avatar name={lead.name} size="xs" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-ink-900">{lead.name}</p>
                          <p className="truncate text-[11px] text-ink-500">
                            {lead.courseInterest ?? 'No course specified'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={lead.priority} className="text-[10px]">
                          {titleCase(lead.priority)}
                        </Badge>
                        {lead.expectedValue ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">
                            <IndianRupee className="h-2.5 w-2.5" />
                            {formatCurrency(lead.expectedValue, { compact: true }).replace('₹', '')}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 flex items-center justify-between border-t border-ink-100 pt-2">
                        <span className="inline-flex items-center gap-1 text-[11px] text-ink-500">
                          <Phone className="h-3 w-3" />
                          {lead.phone}
                        </span>
                        <span className="text-[10px] text-ink-400">{fromNow(lead.createdAt)}</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && columns.every((c) => c.count === 0) && (
        <Card>
          <EmptyState
            title="No leads in the pipeline"
            description="Capture your first enquiry and it will appear here as a card you can drag through the stages."
            action={
              can('lead:create') ? (
                <Button size="sm" onClick={() => setShowForm(true)} icon={<Plus className="h-4 w-4" />}>
                  New lead
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {showForm && <LeadFormModal lead={null} onClose={() => setShowForm(false)} />}
    </div>
  );
}
