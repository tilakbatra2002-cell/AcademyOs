import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ClipboardCheck, Award, Wallet, FileText, CalendarDays, BookOpen, Download,
} from 'lucide-react';
import { useApiQuery } from '@/hooks/useApi';
import {
  Card, CardHeader, Skeleton, EmptyState, ErrorState, Tabs, Badge, StatusBadge,
  Avatar, ProgressBar, Button, useToast,
} from '@/components/ui';
import { StatCard } from '@/components/StatCard';
import { downloadFile, ApiError } from '@/lib/api';
import { cn, formatCurrency, formatDate, gradeStyle, labelOf, titleCase } from '@/lib/utils';
import type {
  Student, TestResult, AttendanceRecord, FeeInstallment, Payment, Receipt, Assignment,
  ClassSession, CourseEnrollment,
} from '@/types';

export function ChildDetail() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState('attendance');

  const { data: children, isLoading: childrenLoading } = useApiQuery<{ items: Student[] }>(
    ['me', 'children'], '/portal/me/children',
  );
  const child = children?.items.find((c) => c._id === studentId);

  if (childrenLoading) return <div className="space-y-4"><Skeleton className="h-9 w-56" /><Skeleton className="h-64" /></div>;
  if (!child) {
    return <ErrorState title="Child not found" description="This student is not linked to your account." />;
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/parent')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 transition hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </button>

      <div className="flex items-center gap-3">
        <Avatar name={child.name} size="lg" />
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">{child.name}</h1>
          <p className="text-[13px] text-ink-500">
            {child.studentCode} · {labelOf(child.primaryCourseId, 'title', 'No course')} · {labelOf(child.primaryBatchId, 'name', 'No batch')}
          </p>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'attendance', label: 'Attendance' },
          { id: 'results', label: 'Results' },
          { id: 'fees', label: 'Fees' },
          { id: 'assignments', label: 'Assignments' },
          { id: 'schedule', label: 'Schedule' },
          { id: 'progress', label: 'Course progress' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'attendance' && <ChildAttendance studentId={studentId!} />}
      {tab === 'results' && <ChildResults studentId={studentId!} />}
      {tab === 'fees' && <ChildFees studentId={studentId!} />}
      {tab === 'assignments' && <ChildAssignments studentId={studentId!} />}
      {tab === 'schedule' && <ChildSchedule studentId={studentId!} />}
      {tab === 'progress' && <ChildProgress studentId={studentId!} />}
    </div>
  );
}

function useChild<T>(studentId: string, path: string) {
  return useApiQuery<T>(['me', 'children', studentId, path], `/portal/me/children/${studentId}/${path}`);
}

function Loading() {
  return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
}

function ChildAttendance({ studentId }: { studentId: string }) {
  const { data, isLoading, error } = useChild<{
    summary: { present: number; absent: number; late: number; leave: number; total: number; percentage: number };
    recent: AttendanceRecord[];
  }>(studentId, 'attendance');

  if (error) return <ErrorState title="Could not load attendance" description={error.message} />;
  const s = data?.summary;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Attendance" value={`${s?.percentage ?? 0}%`} tone={(s?.percentage ?? 0) >= 75 ? 'emerald' : 'rose'} loading={isLoading} />
        <StatCard label="Present" value={s?.present ?? 0} tone="emerald" loading={isLoading} />
        <StatCard label="Absent" value={s?.absent ?? 0} tone="rose" loading={isLoading} />
        <StatCard label="Late" value={s?.late ?? 0} tone="amber" loading={isLoading} />
      </div>
      <Card>
        <CardHeader title="Recent classes" />
        {isLoading ? <div className="p-4"><Loading /></div> : (data?.recent?.length ?? 0) === 0 ? (
          <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="No attendance records" />
        ) : (
          <div className="divide-y divide-ink-100">
            {data?.recent.map((r) => (
              <div key={r._id} className="flex items-center justify-between px-5 py-2.5">
                <p className="text-[13px] text-ink-800">{formatDate(r.date, 'DD MMM YYYY')}</p>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ChildResults({ studentId }: { studentId: string }) {
  const { data, isLoading, error } = useChild<{
    items: TestResult[];
    summary?: { exams: number; average: number; passed: number; failed: number; best: number };
  }>(studentId, 'results');

  if (error) return <ErrorState title="Could not load results" description={error.message} />;
  const s = data?.summary;

  return (
    <div className="space-y-5">
      {s && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Exams" value={s.exams} loading={isLoading} />
          <StatCard label="Average" value={`${Math.round(s.average)}%`} tone="violet" loading={isLoading} />
          <StatCard label="Best" value={`${Math.round(s.best)}%`} tone="emerald" loading={isLoading} />
          <StatCard label="Passed" value={`${s.passed}/${s.passed + s.failed}`} loading={isLoading} />
        </div>
      )}
      <Card>
        <CardHeader title="All results" />
        {isLoading ? <div className="p-4"><Loading /></div> : (data?.items?.length ?? 0) === 0 ? (
          <EmptyState icon={<Award className="h-6 w-6" />} title="No results published" />
        ) : (
          <div className="divide-y divide-ink-100">
            {data?.items.map((r) => (
              <div key={r._id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink-900">{labelOf(r.examId, 'title', 'Exam')}</p>
                  <p className="truncate text-xs text-ink-500">{r.marksObtained}/{r.totalMarks} marks</p>
                </div>
                <span className="shrink-0 text-[13px] font-semibold text-ink-900">{r.percentage}%</span>
                <span className={cn('inline-flex h-7 min-w-[34px] items-center justify-center rounded-lg px-2 text-xs font-bold', gradeStyle(r.grade))}>{r.grade}</span>
                <Badge tone={r.passed ? 'ACTIVE' : 'CANCELLED'}>{r.passed ? 'Pass' : 'Fail'}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ChildFees({ studentId }: { studentId: string }) {
  const toast = useToast();
  const { data, isLoading, error } = useChild<{
    installments: FeeInstallment[]; payments: Payment[]; receipts?: Receipt[];
    totals: { total: number; paid: number; pending: number; overdue: number };
  }>(studentId, 'fees');

  if (error) return <ErrorState title="Could not load fees" description={error.message} />;
  const t = data?.totals;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total" value={formatCurrency(t?.total, { compact: true })} loading={isLoading} />
        <StatCard label="Paid" value={formatCurrency(t?.paid, { compact: true })} tone="emerald" loading={isLoading} />
        <StatCard label="Pending" value={formatCurrency(t?.pending, { compact: true })} tone={(t?.pending ?? 0) > 0 ? 'amber' : 'emerald'} loading={isLoading} />
        <StatCard label="Overdue" value={formatCurrency(t?.overdue, { compact: true })} tone={(t?.overdue ?? 0) > 0 ? 'rose' : 'emerald'} loading={isLoading} />
      </div>

      <Card>
        <CardHeader title="Instalments" />
        {isLoading ? <div className="p-4"><Loading /></div> : (data?.installments?.length ?? 0) === 0 ? (
          <EmptyState icon={<Wallet className="h-6 w-6" />} title="No fee plan" />
        ) : (
          <div className="divide-y divide-ink-100">
            {data?.installments.map((i) => {
              const overdue = i.status !== 'PAID' && new Date(i.dueDate) < new Date();
              return (
                <div key={i._id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{i.title}</p>
                    <p className={cn('truncate text-xs', overdue ? 'font-medium text-rose-600' : 'text-ink-500')}>
                      Due {formatDate(i.dueDate, 'DD MMM YYYY')}{overdue ? ' · overdue' : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold text-ink-900">{formatCurrency(i.amount)}</span>
                  <Badge tone={i.status}>{i.status}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Payments" />
        {isLoading ? <div className="p-4"><Loading /></div> : (data?.payments?.length ?? 0) === 0 ? (
          <EmptyState title="No payments yet" />
        ) : (
          <div className="divide-y divide-ink-100">
            {data?.payments.map((p) => {
              const receipt = data.receipts?.find((r) => String(r.paymentId) === p._id);
              return (
                <div key={p._id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{p.paymentNumber}</p>
                    <p className="truncate text-xs text-ink-500">{formatDate(p.paidAt, 'DD MMM YYYY')} · {titleCase(p.method)}</p>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold text-emerald-700">{formatCurrency(p.amount)}</span>
                  {receipt && (
                    <Button variant="ghost" size="icon" title="Download receipt"
                      onClick={() => downloadFile(`/finance/receipts/${receipt._id}`, `${receipt.receiptNumber}.json`).catch((e) => toast.error('Could not download', (e as ApiError).message))}>
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function ChildAssignments({ studentId }: { studentId: string }) {
  const { data, isLoading, error } = useChild<{ items: (Assignment & { submission?: { status: string; marksAwarded?: number } })[] }>(
    studentId, 'assignments',
  );
  if (error) return <ErrorState title="Could not load assignments" description={error.message} />;

  return (
    <Card>
      <CardHeader title="Assignments" />
      {isLoading ? <div className="p-4"><Loading /></div> : (data?.items?.length ?? 0) === 0 ? (
        <EmptyState icon={<FileText className="h-6 w-6" />} title="No assignments" />
      ) : (
        <div className="divide-y divide-ink-100">
          {data?.items.map((a) => {
            const overdue = new Date(a.dueDate) < new Date() && !a.submission;
            return (
              <div key={a._id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink-900">{a.title}</p>
                  <p className={cn('truncate text-xs', overdue ? 'font-medium text-rose-600' : 'text-ink-500')}>
                    Due {formatDate(a.dueDate, 'DD MMM YYYY')}{overdue ? ' · overdue' : ''}
                  </p>
                </div>
                {a.submission ? (
                  <Badge tone={a.submission.status === 'GRADED' ? 'ACTIVE' : 'PENDING'}>
                    {a.submission.status === 'GRADED' ? `${a.submission.marksAwarded ?? 0}/${a.totalMarks}` : 'Submitted'}
                  </Badge>
                ) : (
                  <Badge tone={overdue ? 'CANCELLED' : 'PENDING'}>{overdue ? 'Overdue' : 'Pending'}</Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ChildSchedule({ studentId }: { studentId: string }) {
  const { data, isLoading, error } = useChild<{ items: ClassSession[] }>(studentId, 'schedule');
  if (error) return <ErrorState title="Could not load the schedule" description={error.message} />;

  return (
    <Card>
      <CardHeader title="Upcoming classes" />
      {isLoading ? <div className="p-4"><Loading /></div> : (data?.items?.length ?? 0) === 0 ? (
        <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No upcoming classes" />
      ) : (
        <div className="divide-y divide-ink-100">
          {data?.items.map((c) => (
            <div key={c._id} className="flex items-center gap-3 px-5 py-3">
              <div className="w-[76px] shrink-0">
                <p className="text-[13px] font-semibold text-ink-900">{c.startTime}</p>
                <p className="text-[11px] text-ink-400">{formatDate(c.date, 'DD MMM')}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink-900">{labelOf(c.batchId, 'name', c.title)}</p>
                <p className="truncate text-xs text-ink-500">{labelOf(c.teacherId, 'name', '')}{c.room ? ` · ${c.room}` : ''}</p>
              </div>
              <StatusBadge status={c.status} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ChildProgress({ studentId }: { studentId: string }) {
  const { data, isLoading, error } = useChild<{ items: CourseEnrollment[] }>(studentId, 'progress');
  if (error) return <ErrorState title="Could not load progress" description={error.message} />;

  return (
    <Card>
      <CardHeader title="Course progress" />
      {isLoading ? <div className="p-4"><Loading /></div> : (data?.items?.length ?? 0) === 0 ? (
        <EmptyState icon={<BookOpen className="h-6 w-6" />} title="Not enrolled in any course" />
      ) : (
        <div className="divide-y divide-ink-100">
          {data?.items.map((e) => (
            <div key={e._id} className="px-5 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink-900">{labelOf(e.courseId, 'title', 'Course')}</p>
                  <p className="truncate text-xs text-ink-500">{e.completedLessons ?? 0} of {e.totalLessons ?? 0} lessons</p>
                </div>
                <span className="shrink-0 text-[13px] font-semibold text-ink-900">{Math.round(e.progressPercent ?? 0)}%</span>
              </div>
              <ProgressBar value={Math.round(e.progressPercent ?? 0)} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
