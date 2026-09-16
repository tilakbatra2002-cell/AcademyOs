import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, Mail, MapPin, Cake, School, Pencil, Wallet, ClipboardCheck, Award,
  BookOpen, FileText, Plus, KeyRound, Users,
} from 'lucide-react';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import {
  PageHeader, Card, CardHeader, Button, Badge, StatusBadge, Avatar, Skeleton, ErrorState,
  EmptyState, Tabs, ProgressBar, useToast,
} from '@/components/ui';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/lib/auth';
import { cn, formatCurrency, formatDate, gradeStyle, labelOf, titleCase } from '@/lib/utils';
import type { Student, FeePlan, FeeInstallment, Payment, Result, CourseEnrollment } from '@/types';
import { RecordPaymentModal } from './Payments';

interface StudentDetailData {
  student: Student;
  account: { _id: string; email: string; isActive: boolean } | null;
  admission?: { admissionNumber: string; admissionDate: string; netFee: number; status: string } | null;
  enrollments: CourseEnrollment[];
  attendance: {
    present: number; absent: number; late: number; leave: number;
    totalSessions: number; percentage: number;
    recent: Array<{ _id: string; date: string; status: string; classSessionId?: { title?: string } | string }>;
  };
  finance: {
    total: number; paid: number; pending: number; overdue: number;
    feePlans: FeePlan[]; installments: FeeInstallment[]; payments: Payment[];
  };
  academics: { results: Result[]; avgPercentage: number; submissions: unknown[] };
  documents: Array<{ _id: string; title: string; category: string; createdAt: string }>;
}

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [collecting, setCollecting] = useState(false);

  const { data, isLoading, error, refetch } = useApiQuery<StudentDetailData>(['students', id], `/people/students/${id}`);

  const resetLogin = useApiMutation<void, { password?: string }>(`/people/students/${id}/reset-login`, {
    invalidate: ['students'],
    onSuccess: (res) =>
      toast.success('Login reset', res.password ? `Temporary password: ${res.password}` : 'A new password was generated.'),
  });

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-5 lg:grid-cols-3"><Skeleton className="h-72 lg:col-span-2" /><Skeleton className="h-72" /></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title={error?.isNotFound ? 'Student not found' : 'Could not load this student'}
        description={error?.isNotFound ? 'They may have been removed, or belong to another academy.' : error?.message}
        onRetry={error?.isNotFound ? undefined : () => refetch()}
      />
    );
  }

  const s = data.student;
  const fin = data.finance;
  const att = data.attendance;

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/admin/students')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 transition hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back to students
      </button>

      <PageHeader
        title={s.name}
        description={`${s.studentCode} · admitted ${formatDate(s.admissionDate)}`}
        actions={
          <>
            {can('student:update') && (
              <Button variant="outline" size="sm" onClick={() => resetLogin.mutate()} loading={resetLogin.isPending} icon={<KeyRound className="h-4 w-4" />}>
                Reset login
              </Button>
            )}
            {can('payment:create') && fin.pending > 0 && (
              <Button size="sm" onClick={() => setCollecting(true)} icon={<Wallet className="h-4 w-4" />}>Collect fees</Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Attendance" value={`${att.percentage}%`} hint={`${att.present}/${att.totalSessions} classes`} icon={<ClipboardCheck className="h-[18px] w-[18px]" />} tone={att.percentage >= 75 ? 'emerald' : 'rose'} />
        <StatCard label="Average result" value={`${Math.round(data.academics.avgPercentage ?? 0)}%`} hint={`${data.academics.results.length} exams`} icon={<Award className="h-[18px] w-[18px]" />} tone="violet" />
        <StatCard label="Fees paid" value={formatCurrency(fin.paid, { compact: true })} hint={`of ${formatCurrency(fin.total, { compact: true })}`} icon={<Wallet className="h-[18px] w-[18px]" />} tone="emerald" />
        <StatCard label="Outstanding" value={formatCurrency(fin.pending, { compact: true })} hint={fin.overdue > 0 ? `${formatCurrency(fin.overdue, { compact: true })} overdue` : 'On track'} tone={fin.pending > 0 ? 'amber' : 'emerald'} />
      </div>

      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'fees', label: 'Fees' },
          { id: 'attendance', label: 'Attendance' },
          { id: 'results', label: 'Results' },
          { id: 'learning', label: 'Learning' },
          { id: 'documents', label: 'Documents' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Student information" />
            <dl className="grid grid-cols-1 gap-px bg-ink-100 sm:grid-cols-2">
              <Info icon={<Phone className="h-4 w-4" />} label="Phone" value={s.phone} />
              <Info icon={<Mail className="h-4 w-4" />} label="Email" value={s.email} />
              <Info icon={<Cake className="h-4 w-4" />} label="Date of birth" value={s.dateOfBirth ? formatDate(s.dateOfBirth) : undefined} />
              <Info label="Gender" value={s.gender ? titleCase(s.gender) : undefined} />
              <Info icon={<School className="h-4 w-4" />} label="School" value={s.schoolName} />
              <Info label="Blood group" value={s.bloodGroup} />
              <Info icon={<BookOpen className="h-4 w-4" />} label="Course" value={labelOf(s.primaryCourseId, 'title', undefined)} />
              <Info label="Batch" value={labelOf(s.primaryBatchId, 'name', undefined)} />
              <Info icon={<MapPin className="h-4 w-4" />} label="Address" value={[s.address?.line1, s.address?.city, s.address?.state].filter(Boolean).join(', ')} />
              <Info label="Status" value={<StatusBadge status={s.status} />} />
            </dl>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader title="Guardian" />
              {s.guardianId && typeof s.guardianId === 'object' ? (
                <div className="p-5">
                  <div className="flex items-center gap-3">
                    <Avatar name={s.guardianId.name} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink-900">{s.guardianId.name}</p>
                      <p className="truncate text-[13px] text-ink-500">{titleCase(s.guardianId.relation ?? 'Guardian')}</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5 text-[13px]">
                    {s.guardianId.phone && <p className="flex items-center gap-2 text-ink-700"><Phone className="h-3.5 w-3.5 text-ink-400" />{s.guardianId.phone}</p>}
                    {s.guardianId.email && <p className="flex items-center gap-2 break-all text-ink-700"><Mail className="h-3.5 w-3.5 shrink-0 text-ink-400" />{s.guardianId.email}</p>}
                  </div>
                </div>
              ) : (
                <EmptyState icon={<Users className="h-6 w-6" />} title="No guardian linked" description="Link a parent from the Parents page." />
              )}
            </Card>

            {data.admission && (
              <Card>
                <CardHeader title="Admission" />
                <dl className="divide-y divide-ink-100">
                  <MiniRow label="Number" value={data.admission.admissionNumber} />
                  <MiniRow label="Date" value={formatDate(data.admission.admissionDate)} />
                  <MiniRow label="Net fee" value={formatCurrency(data.admission.netFee)} />
                  <MiniRow label="Status" value={<StatusBadge status={data.admission.status} />} />
                </dl>
              </Card>
            )}

            <Card>
              <CardHeader title="Portal access" />
              <div className="p-5">
                {data.account ? (
                  <>
                    <p className="break-all text-[13px] text-ink-700">{data.account.email}</p>
                    <div className="mt-2"><Badge tone={data.account.isActive ? 'ACTIVE' : 'INACTIVE'}>{data.account.isActive ? 'Active' : 'Disabled'}</Badge></div>
                  </>
                ) : (
                  <p className="text-[13px] text-ink-500">No student login has been created yet.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'fees' && (
        <div className="space-y-5">
          {fin.feePlans.length === 0 ? (
            <Card><EmptyState icon={<Wallet className="h-6 w-6" />} title="No fee plan" description="This student does not have a fee plan yet." /></Card>
          ) : (
            fin.feePlans.map((p) => (
              <Card key={p._id}>
                <CardHeader
                  title={p.title}
                  subtitle={`${formatCurrency(p.paidAmount)} of ${formatCurrency(p.netAmount)} collected`}
                  action={<StatusBadge status={p.status} />}
                />
                <div className="px-5 pb-2 pt-3">
                  <ProgressBar value={p.netAmount ? Math.round((p.paidAmount / p.netAmount) * 100) : 0} tone="emerald" />
                </div>
                <div className="divide-y divide-ink-100">
                  {fin.installments.filter((i) => String(i.feePlanId) === p._id).map((i) => {
                    const overdue = i.status !== 'PAID' && new Date(i.dueDate) < new Date();
                    return (
                      <div key={i._id} className="flex items-center gap-3 px-5 py-2.5">
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
              </Card>
            ))
          )}

          <Card>
            <CardHeader
              title="Payment history"
              subtitle={`${fin.payments.length} payment${fin.payments.length === 1 ? '' : 's'}`}
              action={can('payment:create') && fin.pending > 0 ? <Button variant="outline" size="sm" onClick={() => setCollecting(true)} icon={<Plus className="h-4 w-4" />}>Collect</Button> : undefined}
            />
            {fin.payments.length === 0 ? (
              <EmptyState title="No payments yet" />
            ) : (
              <div className="divide-y divide-ink-100">
                {fin.payments.map((p) => (
                  <div key={p._id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink-900">{p.paymentNumber}</p>
                      <p className="truncate text-xs text-ink-500">{formatDate(p.paidAt, 'DD MMM YYYY')} · {titleCase(p.method)}</p>
                    </div>
                    <span className="shrink-0 text-[13px] font-semibold text-emerald-700">{formatCurrency(p.amount)}</span>
                    <StatusBadge status={p.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'attendance' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Present" value={att.present} tone="emerald" />
            <StatCard label="Absent" value={att.absent} tone="rose" />
            <StatCard label="Late" value={att.late} tone="amber" />
            <StatCard label="On leave" value={att.leave} tone="sky" />
          </div>
          <Card>
            <CardHeader title="Recent attendance" />
            {att.recent?.length ? (
              <div className="divide-y divide-ink-100">
                {att.recent.map((r) => (
                  <div key={r._id} className="flex items-center justify-between px-5 py-2.5">
                    <p className="text-[13px] text-ink-800">{formatDate(r.date, 'DD MMM YYYY')}</p>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="No attendance records" />
            )}
          </Card>
        </div>
      )}

      {tab === 'results' && (
        <Card>
          <CardHeader title="Exam results" subtitle={`Average ${Math.round(data.academics.avgPercentage ?? 0)}%`} />
          {data.academics.results.length === 0 ? (
            <EmptyState icon={<Award className="h-6 w-6" />} title="No results yet" />
          ) : (
            <div className="divide-y divide-ink-100">
              {data.academics.results.map((r) => (
                <div key={r._id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{labelOf(r.examId, 'title', 'Exam')}</p>
                    <p className="truncate text-xs text-ink-500">{r.marksObtained} / {r.totalMarks} marks</p>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold text-ink-900">{r.percentage}%</span>
                  <span className={cn('inline-flex h-7 min-w-[34px] items-center justify-center rounded-lg px-2 text-xs font-bold', gradeStyle(r.grade))}>{r.grade}</span>
                  <Badge tone={r.passed ? 'ACTIVE' : 'CANCELLED'}>{r.passed ? 'Pass' : 'Fail'}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'learning' && (
        <Card>
          <CardHeader title="Course progress" />
          {data.enrollments.length === 0 ? (
            <EmptyState icon={<BookOpen className="h-6 w-6" />} title="Not enrolled in any course" />
          ) : (
            <div className="divide-y divide-ink-100">
              {data.enrollments.map((e) => (
                <div key={e._id} className="px-5 py-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink-900">{labelOf(e.courseId, 'title', 'Course')}</p>
                      <p className="truncate text-xs text-ink-500">{e.completedLessons ?? 0} of {e.totalLessons ?? 0} lessons complete</p>
                    </div>
                    <span className="shrink-0 text-[13px] font-semibold text-ink-900">{Math.round(e.progressPercent ?? 0)}%</span>
                  </div>
                  <ProgressBar value={Math.round(e.progressPercent ?? 0)} />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'documents' && (
        <Card>
          <CardHeader title="Documents" subtitle={`${data.documents.length} file${data.documents.length === 1 ? '' : 's'}`} />
          {data.documents.length === 0 ? (
            <EmptyState icon={<FileText className="h-6 w-6" />} title="No documents" description="ID proofs and certificates uploaded for this student appear here." />
          ) : (
            <div className="divide-y divide-ink-100">
              {data.documents.map((d) => (
                <div key={d._id} className="flex items-center gap-3 px-5 py-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-ink-400" />
                  <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-900">{d.title}</p>
                  <Badge>{titleCase(d.category)}</Badge>
                  <span className="shrink-0 text-xs text-ink-400">{formatDate(d.createdAt, 'DD MMM YYYY')}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {collecting && (
        <RecordPaymentModal
          onClose={() => setCollecting(false)}
          presetStudentId={s._id}
          presetFeePlanId={fin.feePlans.find((p) => p.pendingAmount > 0)?._id}
        />
      )}
    </div>
  );
}

function Info({ icon, label, value }: { icon?: React.ReactNode; label: string; value?: React.ReactNode }) {
  return (
    <div className="bg-white px-5 py-3">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-500">{icon}{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium text-ink-900">{value || <span className="text-ink-300">—</span>}</dd>
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <dt className="text-[13px] text-ink-500">{label}</dt>
      <dd className="text-[13px] font-medium text-ink-900">{value}</dd>
    </div>
  );
}

export const StudentEditIcon = Pencil;
