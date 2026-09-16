import { Link } from 'react-router-dom';
import { Users, ArrowRight, Phone, Mail, School } from 'lucide-react';
import { useApiQuery } from '@/hooks/useApi';
import {
  PageHeader, Card, Skeleton, EmptyState, ErrorState, Avatar, StatusBadge, Button, Badge,
} from '@/components/ui';
import { formatDate, labelOf } from '@/lib/utils';
import type { Student } from '@/types';

export function ParentChildren() {
  const { data, isLoading, error, refetch } = useApiQuery<{ items: Student[] }>(['me', 'children'], '/portal/me/children');
  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title="My children" description={`${items.length} student${items.length === 1 ? '' : 's'} linked to your account`} />

      {error ? (
        <ErrorState title="Could not load your children" description={error.message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-52" />)}</div>
      ) : items.length === 0 ? (
        <Card><EmptyState icon={<Users className="h-6 w-6" />} title="No children linked" description="Contact the academy office to link your children." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((s) => (
            <Card key={s._id} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <Avatar name={s.name} size="md" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-display text-base font-bold text-ink-900">{s.name}</h3>
                  <p className="truncate text-[13px] text-ink-500">{s.studentCode}</p>
                </div>
                <StatusBadge status={s.status} />
              </div>

              <div className="mt-3 space-y-1.5 text-[13px] text-ink-600">
                <p className="truncate">{labelOf(s.primaryCourseId, 'title', 'No course assigned')}</p>
                <p className="truncate text-ink-500">{labelOf(s.primaryBatchId, 'name', 'No batch')}</p>
                {s.phone && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-ink-400" />{s.phone}</p>}
                {s.email && <p className="flex items-center gap-1.5 truncate"><Mail className="h-3.5 w-3.5 shrink-0 text-ink-400" />{s.email}</p>}
                {s.schoolName && <p className="flex items-center gap-1.5 truncate"><School className="h-3.5 w-3.5 shrink-0 text-ink-400" />{s.schoolName}</p>}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.admissionDate && <Badge>Admitted {formatDate(s.admissionDate, 'MMM YYYY')}</Badge>}
              </div>

              <div className="mt-4 flex-1" />
              <Link to={`/parent/children/${s._id}`}>
                <Button variant="outline" className="w-full" icon={<ArrowRight className="h-4 w-4" />}>
                  View attendance, results & fees
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
