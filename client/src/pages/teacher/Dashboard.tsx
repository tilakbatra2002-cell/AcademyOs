import { Link } from 'react-router-dom';
import {
  Users, CalendarDays, ClipboardCheck, FileText, Award, Layers, ArrowRight, GraduationCap,
} from 'lucide-react';
import { useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/lib/auth';
import { StatCard } from '@/components/StatCard';
import {
  Card, CardHeader, PageHeader, CardsSkeleton, Skeleton, EmptyState, ErrorState, StatusBadge, Badge,
} from '@/components/ui';
import { formatDate, labelOf } from '@/lib/utils';
import type { ClassSession, Assignment, Exam, Batch } from '@/types';

interface TeacherDashboard {
  cards: {
    batches: number; students: number; todaysClasses: number; pendingAttendance: number;
    assignments: number; upcomingExams: number; attendancePercentage: number; submissionsToGrade: number;
  };
  todaysClasses: ClassSession[];
  upcomingClasses: ClassSession[];
  pendingAttendance: ClassSession[];
  assignments: Assignment[];
  exams: Exam[];
  batches: (Batch & { enrolledCount: number })[];
}

export function TeacherDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useApiQuery<TeacherDashboard>(
    ['dashboard', 'teacher'],
    '/portal/dashboard/teacher',
  );

  if (error) return <ErrorState title="Could not load your dashboard" description={error.message} onRetry={() => refetch()} />;

  const c = data?.cards;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] ?? 'teacher'}`}
        description="Your classes, attendance and grading for today."
      />

      {isLoading ? (
        <CardsSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="My students" value={c?.students ?? 0} hint={`across ${c?.batches ?? 0} batches`} icon={<Users className="h-[18px] w-[18px]" />} />
          <StatCard label="Classes today" value={c?.todaysClasses ?? 0} hint={c?.pendingAttendance ? `${c.pendingAttendance} need attendance` : 'All marked'} icon={<CalendarDays className="h-[18px] w-[18px]" />} tone={c?.pendingAttendance ? 'amber' : 'emerald'} />
          <StatCard label="To grade" value={c?.submissionsToGrade ?? 0} hint={`${c?.assignments ?? 0} active assignments`} icon={<FileText className="h-[18px] w-[18px]" />} tone={c?.submissionsToGrade ? 'violet' : 'emerald'} />
          <StatCard label="Class attendance" value={`${c?.attendancePercentage ?? 0}%`} hint="Across your batches" icon={<ClipboardCheck className="h-[18px] w-[18px]" />} tone={(c?.attendancePercentage ?? 0) >= 75 ? 'emerald' : 'amber'} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Today's classes"
            subtitle={`${data?.todaysClasses?.length ?? 0} scheduled`}
            action={<Link to="/teacher/schedule" className="text-[13px] font-medium text-[var(--brand-primary)] hover:underline">Full schedule</Link>}
          />
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (data?.todaysClasses?.length ?? 0) === 0 ? (
            <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No classes today" description="Enjoy the breather." />
          ) : (
            <div className="divide-y divide-ink-100">
              {data?.todaysClasses.map((cl) => (
                <Link key={cl._id} to="/teacher/attendance" className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-50">
                  <div className="w-[62px] shrink-0 text-center">
                    <p className="text-[13px] font-semibold text-ink-900">{cl.startTime}</p>
                    <p className="text-[11px] text-ink-400">{cl.endTime}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{labelOf(cl.batchId, 'name', cl.title)}</p>
                    <p className="truncate text-xs text-ink-500">{cl.room ?? 'No room'}{cl.topic ? ` · ${cl.topic}` : ''}</p>
                  </div>
                  {cl.attendanceMarked ? <Badge tone="ACTIVE">Marked</Badge> : <Badge tone="PENDING">To mark</Badge>}
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Attendance to mark"
            subtitle="Past classes still missing a register"
            action={<Link to="/teacher/attendance" className="text-[13px] font-medium text-[var(--brand-primary)] hover:underline">Mark now</Link>}
          />
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (data?.pendingAttendance?.length ?? 0) === 0 ? (
            <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="All caught up" description="Every class has its attendance recorded." />
          ) : (
            <div className="divide-y divide-ink-100">
              {data?.pendingAttendance.slice(0, 6).map((cl) => (
                <Link key={cl._id} to="/teacher/attendance" className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{labelOf(cl.batchId, 'name', cl.title)}</p>
                    <p className="truncate text-xs text-ink-500">{formatDate(cl.date, 'DD MMM YYYY')} · {cl.startTime}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-400" />
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="My batches"
            action={<Link to="/teacher/batches" className="text-[13px] font-medium text-[var(--brand-primary)] hover:underline">View all</Link>}
          />
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (data?.batches?.length ?? 0) === 0 ? (
            <EmptyState icon={<Layers className="h-6 w-6" />} title="No batches assigned" description="An administrator will assign you to batches." />
          ) : (
            <div className="divide-y divide-ink-100">
              {data?.batches.map((b) => (
                <Link key={b._id} to={`/teacher/batches`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-50">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                    <Layers className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{b.name}</p>
                    <p className="truncate text-xs text-ink-500">{b.enrolledCount} student{b.enrolledCount === 1 ? '' : 's'}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-400" />
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Upcoming exams" />
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (data?.exams?.length ?? 0) === 0 ? (
            <EmptyState icon={<Award className="h-6 w-6" />} title="No upcoming exams" />
          ) : (
            <div className="divide-y divide-ink-100">
              {data?.exams.map((e) => (
                <div key={e._id} className="px-5 py-3">
                  <p className="truncate text-[13px] font-medium text-ink-900">{e.title}</p>
                  <p className="truncate text-xs text-ink-500">{formatDate(e.date, 'DD MMM YYYY')} · {e.totalMarks} marks</p>
                  <div className="mt-1"><StatusBadge status={e.status} /></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Assignments"
          subtitle="Your active assignments"
          action={<Link to="/teacher/assignments" className="text-[13px] font-medium text-[var(--brand-primary)] hover:underline">Grade</Link>}
        />
        {isLoading ? (
          <div className="space-y-2 p-4">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (data?.assignments?.length ?? 0) === 0 ? (
          <EmptyState icon={<GraduationCap className="h-6 w-6" />} title="No assignments yet" description="Set homework from the Assignments page." />
        ) : (
          <div className="divide-y divide-ink-100">
            {data?.assignments.map((a) => (
              <Link key={a._id} to="/teacher/assignments" className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink-900">{a.title}</p>
                  <p className="truncate text-xs text-ink-500">Due {formatDate(a.dueDate, 'DD MMM YYYY')} · {a.totalMarks} marks</p>
                </div>
                <StatusBadge status={a.status} />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
