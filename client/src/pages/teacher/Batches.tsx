import { Layers, Users, MapPin, Clock } from 'lucide-react';
import { useApiQuery } from '@/hooks/useApi';
import {
  PageHeader, Card, Skeleton, EmptyState, ErrorState, Badge, StatusBadge, ProgressBar,
} from '@/components/ui';
import { formatDate, labelOf } from '@/lib/utils';
import type { Batch } from '@/types';

export function TeacherBatches() {
  const { data, isLoading, error, refetch } = useApiQuery<{ items: Batch[] }>(['me', 'batches'], '/portal/me/batches');
  const batches = data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title="My batches" description={`${batches.length} batch${batches.length === 1 ? '' : 'es'} assigned to you`} />

      {error ? (
        <ErrorState title="Could not load your batches" description={error.message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : batches.length === 0 ? (
        <Card><EmptyState icon={<Layers className="h-6 w-6" />} title="No batches assigned" description="An administrator will assign you to batches." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {batches.map((b) => {
            const pct = b.capacity ? Math.round((b.enrolledCount / b.capacity) * 100) : 0;
            return (
              <Card key={b._id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-base font-bold text-ink-900">{b.name}</h3>
                    <p className="truncate text-[13px] text-ink-500">{labelOf(b.courseId, 'title', b.code)}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>

                <div className="mt-3 space-y-1.5 text-[13px] text-ink-600">
                  <p className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-ink-400" />{b.enrolledCount} of {b.capacity} enrolled</p>
                  {b.room && <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-ink-400" />{b.room}</p>}
                  {b.schedule?.length ? (
                    <p className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-ink-400" />
                      {b.schedule.map((s) => s.day.slice(0, 3)).join(', ')} · {b.schedule[0].startTime}–{b.schedule[0].endTime}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3">
                  <ProgressBar value={pct} tone={pct >= 100 ? 'rose' : 'brand'} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge>{b.code}</Badge>
                  {b.startDate && <Badge>Starts {formatDate(b.startDate, 'DD MMM')}</Badge>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
