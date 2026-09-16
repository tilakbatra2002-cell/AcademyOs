import { Link } from 'react-router-dom';
import { BookOpen, PlayCircle, CheckCircle2 } from 'lucide-react';
import { useApiQuery } from '@/hooks/useApi';
import {
  PageHeader, Card, Skeleton, EmptyState, ErrorState, ProgressBar, Badge, Button,
} from '@/components/ui';
import { formatDate, labelOf } from '@/lib/utils';
import type { CourseEnrollment } from '@/types';

export function StudentCourses() {
  const { data, isLoading, error, refetch } = useApiQuery<{ items: CourseEnrollment[] }>(
    ['me', 'courses'],
    '/portal/me/courses',
  );
  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title="My courses" description={`${items.length} course${items.length === 1 ? '' : 's'} you're enrolled in`} />

      {error ? (
        <ErrorState title="Could not load your courses" description={error.message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-52" />)}</div>
      ) : items.length === 0 ? (
        <Card><EmptyState icon={<BookOpen className="h-6 w-6" />} title="No courses yet" description="Once you're enrolled, your courses appear here." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((e) => {
            const courseId = typeof e.courseId === 'object' ? e.courseId._id : e.courseId;
            const pct = Math.round(e.progressPercent ?? 0);
            const done = pct >= 100;
            return (
              <Card key={e._id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  {done ? <Badge tone="ACTIVE">Completed</Badge> : <Badge tone={e.status}>{e.status}</Badge>}
                </div>

                <h3 className="mt-3 font-display text-base font-bold leading-snug text-ink-900">
                  {labelOf(e.courseId, 'title', 'Course')}
                </h3>
                {e.batchId && <p className="mt-0.5 text-[13px] text-ink-500">{labelOf(e.batchId, 'name', '')}</p>}

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-ink-500">{e.completedLessons ?? 0} of {e.totalLessons ?? 0} lessons</span>
                    <span className="font-semibold text-ink-900">{pct}%</span>
                  </div>
                  <ProgressBar value={pct} tone={done ? 'emerald' : 'brand'} />
                </div>

                {e.lastAccessedAt && (
                  <p className="mt-2 text-xs text-ink-400">Last opened {formatDate(e.lastAccessedAt, 'DD MMM YYYY')}</p>
                )}

                <div className="mt-4 flex-1" />
                <Link to={`/student/courses/${courseId}`}>
                  <Button className="w-full" icon={done ? <CheckCircle2 className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}>
                    {done ? 'Review course' : pct > 0 ? 'Continue learning' : 'Start course'}
                  </Button>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
