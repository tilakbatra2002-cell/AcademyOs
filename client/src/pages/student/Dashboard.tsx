import { Link } from 'react-router-dom';
import {
  BookOpen, ClipboardCheck, Award, Wallet, CalendarDays, FileText, PlayCircle, TrendingUp,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/lib/auth';
import { StatCard } from '@/components/StatCard';
import {
  Card, CardHeader, PageHeader, CardsSkeleton, Skeleton, EmptyState, ErrorState, ProgressBar,
  Badge, StatusBadge,
} from '@/components/ui';
import { cn, formatCurrency, formatDate, gradeStyle, labelOf } from '@/lib/utils';
import type { ClassSession, TestResult, Assignment, CourseEnrollment } from '@/types';

interface StudentDashboardData {
  cards: {
    courses: number; averageProgress: number; attendancePercentage: number; averageResult: number;
    feesPending: number; feesPaid: number; nextDueDate?: string; nextDueAmount?: number;
  };
  courses: CourseEnrollment[];
  todaysClasses: ClassSession[];
  upcomingClasses: ClassSession[];
  recentResults: TestResult[];
  assignments: Assignment[];
  performanceSeries: { exam: string; percentage: number }[];
}

export function StudentDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useApiQuery<StudentDashboardData>(
    ['dashboard', 'student'],
    '/portal/dashboard/student',
  );

  if (error) return <ErrorState title="Could not load your dashboard" description={error.message} onRetry={() => refetch()} />;
  const c = data?.cards;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hi ${user?.name?.split(' ')[0] ?? 'there'}`}
        description="Your courses, classes and progress at a glance."
      />

      {isLoading ? (
        <CardsSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="My courses" value={c?.courses ?? 0} hint={`${c?.averageProgress ?? 0}% average progress`} icon={<BookOpen className="h-[18px] w-[18px]" />} />
          <StatCard label="Attendance" value={`${c?.attendancePercentage ?? 0}%`} icon={<ClipboardCheck className="h-[18px] w-[18px]" />} tone={(c?.attendancePercentage ?? 0) >= 75 ? 'emerald' : 'rose'} />
          <StatCard label="Average result" value={`${c?.averageResult ?? 0}%`} icon={<Award className="h-[18px] w-[18px]" />} tone="violet" />
          <StatCard
            label="Fees due"
            value={formatCurrency(c?.feesPending, { compact: true })}
            hint={c?.nextDueDate ? `Next ${formatCurrency(c.nextDueAmount)} on ${formatDate(c.nextDueDate, 'DD MMM')}` : 'All cleared'}
            icon={<Wallet className="h-[18px] w-[18px]" />}
            tone={(c?.feesPending ?? 0) > 0 ? 'amber' : 'emerald'}
          />
        </div>
      )}

      <Card>
        <CardHeader
          title="Continue learning"
          subtitle="Pick up where you left off"
          action={<Link to="/student/courses" className="text-[13px] font-medium text-[var(--brand-primary)] hover:underline">All courses</Link>}
        />
        {isLoading ? (
          <div className="space-y-2 p-4">{[0, 1].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : (data?.courses?.length ?? 0) === 0 ? (
          <EmptyState icon={<BookOpen className="h-6 w-6" />} title="Not enrolled yet" description="Once you are enrolled in a course it will appear here." />
        ) : (
          <div className="divide-y divide-ink-100">
            {data?.courses.map((e) => {
              const courseId = typeof e.courseId === 'object' ? e.courseId._id : e.courseId;
              const pct = Math.round(e.progressPercent ?? 0);
              return (
                <Link key={e._id} to={`/student/courses/${courseId}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-ink-50">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                    <PlayCircle className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink-900">{labelOf(e.courseId, 'title', 'Course')}</p>
                    <p className="truncate text-xs text-ink-500">{e.completedLessons ?? 0} of {e.totalLessons ?? 0} lessons complete</p>
                    <div className="mt-1.5"><ProgressBar value={pct} /></div>
                  </div>
                  <span className="shrink-0 text-[13px] font-bold text-ink-900">{pct}%</span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Upcoming classes" action={<Link to="/student/schedule" className="text-[13px] font-medium text-[var(--brand-primary)] hover:underline">Schedule</Link>} />
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (data?.upcomingClasses?.length ?? 0) === 0 && (data?.todaysClasses?.length ?? 0) === 0 ? (
            <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No upcoming classes" />
          ) : (
            <div className="divide-y divide-ink-100">
              {[...(data?.todaysClasses ?? []), ...(data?.upcomingClasses ?? [])].slice(0, 6).map((cl) => (
                <div key={cl._id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-[70px] shrink-0">
                    <p className="text-[13px] font-semibold text-ink-900">{cl.startTime}</p>
                    <p className="text-[11px] text-ink-400">{formatDate(cl.date, 'DD MMM')}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{labelOf(cl.batchId, 'name', cl.title)}</p>
                    <p className="truncate text-xs text-ink-500">{labelOf(cl.teacherId, 'name', '')}{cl.room ? ` · ${cl.room}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent results" action={<Link to="/student/results" className="text-[13px] font-medium text-[var(--brand-primary)] hover:underline">All results</Link>} />
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (data?.recentResults?.length ?? 0) === 0 ? (
            <EmptyState icon={<Award className="h-6 w-6" />} title="No results yet" />
          ) : (
            <div className="divide-y divide-ink-100">
              {data?.recentResults.map((r) => (
                <div key={r._id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{labelOf(r.examId, 'title', 'Exam')}</p>
                    <p className="truncate text-xs text-ink-500">{r.marksObtained}/{r.totalMarks} · {r.percentage}%</p>
                  </div>
                  <span className={cn('inline-flex h-7 min-w-[34px] items-center justify-center rounded-lg px-2 text-xs font-bold', gradeStyle(r.grade))}>{r.grade}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Performance trend" subtitle="Your scores over recent exams" />
          <div className="h-[240px] p-4">
            {isLoading ? <Skeleton className="h-full w-full" /> : (data?.performanceSeries?.length ?? 0) === 0 ? (
              <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="Not enough data" description="Your trend appears after a few exams." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.performanceSeries ?? []}>
                  <defs>
                    <linearGradient id="perf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="exam" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => [`${v}%`, 'Score']} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  <Area type="monotone" dataKey="percentage" stroke="var(--brand-primary)" strokeWidth={2.5} fill="url(#perf)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Assignments due" action={<Link to="/student/assignments" className="text-[13px] font-medium text-[var(--brand-primary)] hover:underline">View all</Link>} />
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (data?.assignments?.length ?? 0) === 0 ? (
            <EmptyState icon={<FileText className="h-6 w-6" />} title="Nothing due" description="You're all caught up." />
          ) : (
            <div className="divide-y divide-ink-100">
              {data?.assignments.slice(0, 6).map((a) => {
                const overdue = new Date(a.dueDate) < new Date();
                return (
                  <Link key={a._id} to="/student/assignments" className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink-900">{a.title}</p>
                      <p className={cn('truncate text-xs', overdue ? 'font-medium text-rose-600' : 'text-ink-500')}>
                        Due {formatDate(a.dueDate, 'DD MMM YYYY')}{overdue ? ' · overdue' : ''}
                      </p>
                    </div>
                    {overdue ? <Badge tone="CANCELLED">Overdue</Badge> : <StatusBadge status={a.status} />}
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
