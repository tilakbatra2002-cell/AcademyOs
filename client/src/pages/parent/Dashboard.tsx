import { Link } from 'react-router-dom';
import { Users, ClipboardCheck, Award, Wallet, ArrowRight, GraduationCap } from 'lucide-react';
import { useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/lib/auth';
import { StatCard } from '@/components/StatCard';
import {
  Card, CardHeader, PageHeader, CardsSkeleton, Skeleton, EmptyState, ErrorState, Avatar, Badge,
} from '@/components/ui';
import { cn, formatCurrency, formatDate, gradeStyle, labelOf } from '@/lib/utils';
import type { Student, TestResult } from '@/types';

interface ChildSummary {
  student: Student;
  attendancePercentage: number;
  averageResult: number;
  fees: { total: number; paid: number; pending: number; overdue: number };
  nextDue?: { amount: number; dueDate: string } | null;
  recentResults: TestResult[];
}

interface ParentDashboardData {
  children: ChildSummary[];
  summary: { children: number; feesPending: number; averageAttendance: number; averageResult: number };
}

export function ParentDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useApiQuery<ParentDashboardData>(
    ['dashboard', 'parent'],
    '/portal/dashboard/parent',
  );

  if (error) return <ErrorState title="Could not load your dashboard" description={error.message} onRetry={() => refetch()} />;
  const s = data?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${user?.name?.split(' ')[0] ?? 'there'}`}
        description="How your children are doing at the academy."
      />

      {isLoading ? (
        <CardsSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Children" value={s?.children ?? 0} icon={<Users className="h-[18px] w-[18px]" />} />
          <StatCard label="Average attendance" value={`${Math.round(s?.averageAttendance ?? 0)}%`} icon={<ClipboardCheck className="h-[18px] w-[18px]" />} tone={(s?.averageAttendance ?? 0) >= 75 ? 'emerald' : 'amber'} />
          <StatCard label="Average result" value={`${Math.round(s?.averageResult ?? 0)}%`} icon={<Award className="h-[18px] w-[18px]" />} tone="violet" />
          <StatCard label="Fees pending" value={formatCurrency(s?.feesPending, { compact: true })} icon={<Wallet className="h-[18px] w-[18px]" />} tone={(s?.feesPending ?? 0) > 0 ? 'amber' : 'emerald'} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-64 w-full" />)}</div>
      ) : (data?.children?.length ?? 0) === 0 ? (
        <Card><EmptyState icon={<GraduationCap className="h-6 w-6" />} title="No children linked" description="Contact the academy to link your children to this account." /></Card>
      ) : (
        <div className="space-y-5">
          {data?.children.map((c) => (
            <Card key={c.student._id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2.5">
                    <Avatar name={c.student.name} size="sm" />
                    {c.student.name}
                  </span>
                }
                subtitle={`${c.student.studentCode} · ${labelOf(c.student.primaryCourseId, 'title', 'No course')}`}
                action={
                  <Link to={`/parent/children/${c.student._id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand-primary)] hover:underline">
                    Full details <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />

              <div className="grid grid-cols-2 gap-px bg-ink-100 lg:grid-cols-4">
                <Tile label="Attendance" value={`${Math.round(c.attendancePercentage)}%`} tone={c.attendancePercentage >= 75 ? 'text-emerald-700' : 'text-rose-700'} />
                <Tile label="Average result" value={`${Math.round(c.averageResult)}%`} tone="text-violet-700" />
                <Tile label="Fees paid" value={formatCurrency(c.fees.paid, { compact: true })} tone="text-emerald-700" />
                <Tile
                  label="Fees pending"
                  value={formatCurrency(c.fees.pending, { compact: true })}
                  tone={c.fees.pending > 0 ? 'text-amber-700' : 'text-emerald-700'}
                  hint={c.nextDue ? `Next ${formatCurrency(c.nextDue.amount)} on ${formatDate(c.nextDue.dueDate, 'DD MMM')}` : undefined}
                />
              </div>

              {c.recentResults?.length > 0 && (
                <div className="border-t border-ink-200/70">
                  <p className="px-5 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Recent results</p>
                  <div className="divide-y divide-ink-100">
                    {c.recentResults.slice(0, 3).map((r) => (
                      <div key={r._id} className="flex items-center gap-3 px-5 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-ink-900">{labelOf(r.examId, 'title', 'Exam')}</p>
                          <p className="truncate text-xs text-ink-500">{r.marksObtained}/{r.totalMarks} · {r.percentage}%</p>
                        </div>
                        <span className={cn('inline-flex h-7 min-w-[34px] items-center justify-center rounded-lg px-2 text-xs font-bold', gradeStyle(r.grade))}>{r.grade}</span>
                        <Badge tone={r.passed ? 'ACTIVE' : 'CANCELLED'}>{r.passed ? 'Pass' : 'Fail'}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, tone, hint }: { label: string; value: string; tone: string; hint?: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className={cn('mt-0.5 font-display text-lg font-bold', tone)}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-400">{hint}</p>}
    </div>
  );
}
