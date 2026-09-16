import { useState } from 'react';
import {
  ClipboardCheck, Award, Wallet, FileText, BookOpen, Download, ExternalLink, CalendarDays,
  Upload, CheckCircle2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import {
  PageHeader, Card, CardHeader, Skeleton, EmptyState, ErrorState, Badge, StatusBadge,
  Button, Modal, Textarea, Field, useToast,
} from '@/components/ui';
import { StatCard } from '@/components/StatCard';
import { downloadFile, ApiError } from '@/lib/api';
import { cn, formatCurrency, formatDate, gradeStyle, labelOf, titleCase } from '@/lib/utils';
import type {
  AttendanceRecord, TestResult, FeePlan, FeeInstallment, Payment, Receipt, Assignment,
  StudyMaterial, ClassSession,
} from '@/types';

const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 };

/* ------------------------------- Attendance -------------------------------- */

export function StudentAttendance() {
  const { data, isLoading, error, refetch } = useApiQuery<{
    summary: { present: number; absent: number; late: number; leave: number; total: number; percentage: number };
    monthly: { month: string; present: number; absent: number; late: number; leave: number; percentage: number }[];
    recent: AttendanceRecord[];
  }>(['me', 'attendance'], '/portal/me/attendance');

  if (error) return <ErrorState title="Could not load attendance" description={error.message} onRetry={() => refetch()} />;
  const s = data?.summary;

  return (
    <div className="space-y-5">
      <PageHeader title="My attendance" description="Your classroom attendance record." />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Overall" value={`${s?.percentage ?? 0}%`} tone={(s?.percentage ?? 0) >= 75 ? 'emerald' : 'rose'} loading={isLoading} />
        <StatCard label="Present" value={s?.present ?? 0} tone="emerald" loading={isLoading} />
        <StatCard label="Absent" value={s?.absent ?? 0} tone="rose" loading={isLoading} />
        <StatCard label="Late" value={s?.late ?? 0} tone="amber" loading={isLoading} />
      </div>

      {(s?.percentage ?? 100) < 75 && !isLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your attendance is below the 75% threshold. Please speak to your teacher.
        </div>
      )}

      <Card>
        <CardHeader title="Monthly trend" />
        <div className="h-[260px] p-4">
          {isLoading ? <Skeleton className="h-full w-full" /> : (data?.monthly?.length ?? 0) === 0 ? (
            <EmptyState title="No attendance data" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.monthly ?? []}>
                <defs>
                  <linearGradient id="att-s" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Attendance']} contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="percentage" stroke="#14b8a6" strokeWidth={2.5} fill="url(#att-s)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Recent classes" />
        {isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (data?.recent?.length ?? 0) === 0 ? (
          <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="No records yet" />
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

/* --------------------------------- Results --------------------------------- */

export function StudentResults() {
  const { data, isLoading, error, refetch } = useApiQuery<{
    items: TestResult[];
    summary: { exams: number; average: number; passed: number; failed: number; best: number };
    trend: { label: string; percentage: number; date: string }[];
  }>(['me', 'results'], '/portal/me/results');

  if (error) return <ErrorState title="Could not load results" description={error.message} onRetry={() => refetch()} />;
  const s = data?.summary;

  return (
    <div className="space-y-5">
      <PageHeader title="My results" description="Exam scores and grades." />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Exams taken" value={s?.exams ?? 0} loading={isLoading} />
        <StatCard label="Average" value={`${Math.round(s?.average ?? 0)}%`} tone="violet" loading={isLoading} />
        <StatCard label="Best score" value={`${Math.round(s?.best ?? 0)}%`} tone="emerald" loading={isLoading} />
        <StatCard label="Passed" value={`${s?.passed ?? 0}/${(s?.passed ?? 0) + (s?.failed ?? 0)}`} loading={isLoading} />
      </div>

      <Card>
        <CardHeader title="Score trend" />
        <div className="h-[260px] p-4">
          {isLoading ? <Skeleton className="h-full w-full" /> : (data?.trend?.length ?? 0) === 0 ? (
            <EmptyState title="No results yet" description="Your scores will be plotted here." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.trend ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Score']} cursor={{ fill: '#f1f5f9' }} contentStyle={tooltipStyle} />
                <Bar dataKey="percentage" fill="var(--brand-primary)" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="All results" />
        {isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (data?.items?.length ?? 0) === 0 ? (
          <EmptyState icon={<Award className="h-6 w-6" />} title="No results published yet" />
        ) : (
          <div className="divide-y divide-ink-100">
            {data?.items.map((r) => (
              <div key={r._id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink-900">{labelOf(r.examId, 'title', 'Exam')}</p>
                  <p className="truncate text-xs text-ink-500">{r.marksObtained} / {r.totalMarks} marks{r.rank ? ` · rank ${r.rank}` : ''}</p>
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

/* ----------------------------------- Fees ---------------------------------- */

export function StudentFees() {
  const toast = useToast();
  const { data, isLoading, error, refetch } = useApiQuery<{
    plans: FeePlan[]; installments: FeeInstallment[]; payments: Payment[]; receipts: Receipt[];
    totals: { total: number; paid: number; pending: number; overdue: number };
  }>(['me', 'fees'], '/portal/me/fees');

  if (error) return <ErrorState title="Could not load your fees" description={error.message} onRetry={() => refetch()} />;
  const t = data?.totals;

  return (
    <div className="space-y-5">
      <PageHeader title="My fees" description="Your fee plan, dues and payment history." />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total fee" value={formatCurrency(t?.total, { compact: true })} loading={isLoading} />
        <StatCard label="Paid" value={formatCurrency(t?.paid, { compact: true })} tone="emerald" loading={isLoading} />
        <StatCard label="Pending" value={formatCurrency(t?.pending, { compact: true })} tone={(t?.pending ?? 0) > 0 ? 'amber' : 'emerald'} loading={isLoading} />
        <StatCard label="Overdue" value={formatCurrency(t?.overdue, { compact: true })} tone={(t?.overdue ?? 0) > 0 ? 'rose' : 'emerald'} loading={isLoading} />
      </div>

      <Card>
        <CardHeader title="Instalments" subtitle="Your payment schedule" />
        {isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (data?.installments?.length ?? 0) === 0 ? (
          <EmptyState icon={<Wallet className="h-6 w-6" />} title="No fee plan" description="No instalments have been set up for you." />
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
        <CardHeader title="Payments & receipts" />
        {isLoading ? (
          <div className="space-y-2 p-4">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (data?.payments?.length ?? 0) === 0 ? (
          <EmptyState title="No payments yet" description="Payments recorded by the academy appear here." />
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
                    <Button
                      variant="ghost" size="icon" title="Download receipt"
                      onClick={() =>
                        downloadFile(`/finance/receipts/${receipt._id}`, `${receipt.receiptNumber}.json`).catch((e) =>
                          toast.error('Could not download', (e as ApiError).message),
                        )
                      }
                    >
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

/* -------------------------------- Schedule --------------------------------- */

export function StudentSchedule() {
  const { data, isLoading, error, refetch } = useApiQuery<{ items: ClassSession[] }>(
    ['me', 'schedule'], '/portal/me/schedule',
  );
  const items = data?.items ?? [];

  const byDate = items.reduce<Record<string, ClassSession[]>>((acc, c) => {
    const k = String(c.date).slice(0, 10);
    (acc[k] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <PageHeader title="My schedule" description="Your upcoming classes." />
      {error ? (
        <ErrorState title="Could not load your schedule" description={error.message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : items.length === 0 ? (
        <Card><EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No upcoming classes" description="Your timetable is clear." /></Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(byDate).map(([date, list]) => (
            <Card key={date}>
              <CardHeader title={formatDate(date, 'dddd, DD MMM YYYY')} subtitle={`${list.length} class${list.length === 1 ? '' : 'es'}`} />
              <div className="divide-y divide-ink-100">
                {list.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '')).map((c) => (
                  <div key={c._id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-[70px] shrink-0">
                      <p className="text-[13px] font-semibold text-ink-900">{c.startTime}</p>
                      <p className="text-[11px] text-ink-400">{c.endTime}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink-900">{labelOf(c.batchId, 'name', c.title)}</p>
                      <p className="truncate text-xs text-ink-500">
                        {labelOf(c.teacherId, 'name', 'Teacher')}{c.room ? ` · ${c.room}` : ''}{c.topic ? ` · ${c.topic}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Assignments -------------------------------- */

export function StudentAssignments() {
  const [submitting, setSubmitting] = useState<Assignment | null>(null);
  const { data, isLoading, error, refetch } = useApiQuery<{ items: (Assignment & { submission?: { _id: string; status: string; marksAwarded?: number; feedback?: string; submittedAt?: string } })[] }>(
    ['me', 'assignments'], '/portal/me/assignments',
  );
  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title="My assignments" description="Homework and projects set by your teachers." />
      {error ? (
        <ErrorState title="Could not load assignments" description={error.message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : items.length === 0 ? (
        <Card><EmptyState icon={<FileText className="h-6 w-6" />} title="No assignments" description="Nothing has been set for you yet." /></Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
            const overdue = new Date(a.dueDate) < new Date() && !a.submission;
            return (
              <Card key={a._id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-bold text-ink-900">{a.title}</h3>
                    <p className="mt-0.5 text-[13px] text-ink-500">{labelOf(a.courseId, 'title', '')}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {a.submission ? (
                      <Badge tone={a.submission.status === 'GRADED' ? 'ACTIVE' : 'PENDING'}>
                        {a.submission.status === 'GRADED' ? `Graded ${a.submission.marksAwarded ?? 0}/${a.totalMarks}` : 'Submitted'}
                      </Badge>
                    ) : overdue ? (
                      <Badge tone="CANCELLED">Overdue</Badge>
                    ) : (
                      <Badge tone="PENDING">Pending</Badge>
                    )}
                  </div>
                </div>

                {a.description && <p className="mt-2 text-[13px] leading-relaxed text-ink-600">{a.description}</p>}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/70 pt-3">
                  <p className={cn('text-[13px]', overdue ? 'font-medium text-rose-600' : 'text-ink-500')}>
                    Due {formatDate(a.dueDate, 'DD MMM YYYY')} · {a.totalMarks} marks
                  </p>
                  {a.submission?.status === 'GRADED' ? (
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> Graded
                    </span>
                  ) : (
                    <Button size="sm" variant={a.submission ? 'outline' : 'primary'} onClick={() => setSubmitting(a)} icon={<Upload className="h-4 w-4" />}>
                      {a.submission ? 'Update submission' : 'Submit'}
                    </Button>
                  )}
                </div>

                {a.submission?.feedback && (
                  <div className="mt-3 rounded-xl bg-emerald-50 px-3.5 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Teacher feedback</p>
                    <p className="mt-0.5 text-[13px] text-emerald-900">{a.submission.feedback}</p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {submitting && <SubmitModal assignment={submitting} onClose={() => setSubmitting(null)} onDone={() => refetch()} />}
    </div>
  );
}

function SubmitModal({ assignment, onClose, onDone }: { assignment: Assignment; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [link, setLink] = useState('');

  const submit = useApiMutation<Record<string, unknown>>(`/portal/me/assignments/${assignment._id}/submit`, {
    invalidate: ['me', 'dashboard'],
    successMessage: 'Assignment submitted',
    silentError: true,
    onSuccess: () => { onDone(); onClose(); },
  });

  return (
    <Modal
      open onClose={onClose} title={`Submit: ${assignment.title}`}
      description={`Due ${formatDate(assignment.dueDate, 'DD MMM YYYY')} · ${assignment.totalMarks} marks`}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={submit.isPending} disabled={!text && !link}
            onClick={() => submit.mutate({ contentText: text || undefined, link: link || undefined })}>
            Submit work
          </Button>
        </>
      }
    >
      {submit.error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{submit.error.message}</div>
      )}
      <div className="space-y-4">
        <Field label="Your answer">
          <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer or a note for your teacher…" />
        </Field>
        <Field label="Link" hint="A Google Drive, GitHub or document link">
          <input className="input-base" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------- Materials -------------------------------- */

export function StudentMaterials() {
  const toast = useToast();
  const { data, isLoading, error, refetch } = useApiQuery<{ items: StudyMaterial[] }>(
    ['me', 'materials'], '/portal/me/materials',
  );
  const items = data?.items ?? [];

  const open = async (m: StudyMaterial) => {
    if (m.externalUrl && m.type === 'LINK') {
      window.open(m.externalUrl, '_blank', 'noopener');
      return;
    }
    try {
      await downloadFile(`/academics/materials/${m._id}/download`, m.title);
    } catch (e) {
      toast.error('Download failed', (e as ApiError).message);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Study material" description="Notes and resources shared by your teachers." />
      {error ? (
        <ErrorState title="Could not load material" description={error.message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : items.length === 0 ? (
        <Card><EmptyState icon={<BookOpen className="h-6 w-6" />} title="No material yet" description="Resources shared with your course appear here." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((m) => (
            <Card key={m._id} className="flex flex-col p-4">
              <div className="flex items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink-900">{m.title}</p>
                  <p className="truncate text-xs text-ink-500">{labelOf(m.courseId, 'title', titleCase(m.type))}</p>
                </div>
                <Badge>{m.type}</Badge>
              </div>
              {m.description && <p className="mt-2 line-clamp-2 text-xs text-ink-500">{m.description}</p>}
              <div className="mt-3 flex-1" />
              <Button variant="outline" size="sm" className="w-full" onClick={() => open(m)}
                icon={m.type === 'LINK' ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}>
                {m.type === 'LINK' ? 'Open link' : 'Download'}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
