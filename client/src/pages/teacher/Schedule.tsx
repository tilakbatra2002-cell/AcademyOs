import { useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, MapPin } from 'lucide-react';
import { useApiQuery } from '@/hooks/useApi';
import {
  PageHeader, Card, Button, Skeleton, EmptyState, ErrorState, StatusBadge, Badge,
} from '@/components/ui';
import { cn, formatDate, labelOf } from '@/lib/utils';
import type { ClassSession } from '@/types';

const DAY_MS = 86400000;

function startOfWeek(d: Date) {
  const c = new Date(d);
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  c.setHours(0, 0, 0, 0);
  return c;
}

export function TeacherSchedule() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const from = weekStart.toISOString().slice(0, 10);
  const to = new Date(weekStart.getTime() + 6 * DAY_MS).toISOString().slice(0, 10);

  const { data, isLoading, error, refetch } = useApiQuery<{ items: ClassSession[] }>(
    ['me', 'classes', from],
    '/portal/me/classes',
    { from, to },
  );

  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS));
  const sessions = data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title="My schedule" description="Your teaching timetable for the week." />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY_MS))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY_MS))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[13px] font-medium text-ink-600">
          {formatDate(weekStart, 'DD MMM')} – {formatDate(new Date(weekStart.getTime() + 6 * DAY_MS), 'DD MMM YYYY')}
        </p>
      </div>

      {error ? (
        <ErrorState title="Could not load your schedule" description={error.message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7">{days.map((_, i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : sessions.length === 0 ? (
        <Card><EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No classes this week" description="Nothing is scheduled for you in this range." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
          {days.map((d) => {
            const key = d.toISOString().slice(0, 10);
            const list = sessions
              .filter((s) => String(s.date).slice(0, 10) === key)
              .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
            const isToday = d.toDateString() === new Date().toDateString();
            return (
              <div key={key} className={cn('rounded-xl border bg-white', isToday ? 'border-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]/20' : 'border-ink-200')}>
                <div className={cn('border-b px-3 py-2', isToday ? 'border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/5' : 'border-ink-200 bg-ink-50')}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{formatDate(d, 'ddd')}</p>
                  <p className={cn('text-sm font-bold', isToday ? 'text-[var(--brand-primary)]' : 'text-ink-900')}>{formatDate(d, 'DD MMM')}</p>
                </div>
                <div className="space-y-2 p-2" style={{ minHeight: 110 }}>
                  {list.length === 0 ? (
                    <p className="px-1 py-4 text-center text-xs text-ink-300">Free</p>
                  ) : (
                    list.map((s) => (
                      <div key={s._id} className="rounded-lg border border-ink-200 bg-white p-2">
                        <p className="text-[11px] font-semibold text-[var(--brand-primary)]">{s.startTime}–{s.endTime}</p>
                        <p className="mt-0.5 truncate text-[12px] font-medium text-ink-900">{labelOf(s.batchId, 'name', s.title)}</p>
                        {s.room && <p className="flex items-center gap-1 truncate text-[11px] text-ink-500"><MapPin className="h-2.5 w-2.5" />{s.room}</p>}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {s.attendanceMarked ? <Badge tone="ACTIVE" className="text-[9px]">Marked</Badge> : <Badge tone="PENDING" className="text-[9px]">To mark</Badge>}
                          {s.status !== 'SCHEDULED' && <StatusBadge status={s.status} />}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
