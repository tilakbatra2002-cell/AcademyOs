import { Link, useNavigate } from 'react-router-dom';
import {
  Users, UserPlus, Wallet, AlertTriangle, BookOpen, Layers, ClipboardCheck,
  ArrowUpRight, PhoneCall, CalendarDays, Trophy, TrendingDown,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/lib/auth';
import { StatCard } from '@/components/StatCard';
import {
  Card, CardHeader, PageHeader, CardsSkeleton, Skeleton, EmptyState, ErrorState, Badge,
  StatusBadge, Avatar, Button,
} from '@/components/ui';
import { formatCurrency, formatDate, formatClock, titleCase, labelOf } from '@/lib/utils';

/** Mirrors the real payload of GET /api/portal/dashboard/admin. */
interface AdminDashboardData {
  cards: {
    totalStudents: number; activeStudents: number; newLeads: number; admissionsThisMonth: number;
    conversionRate: number; feesCollected: number; feesPending: number; feesOverdue: number;
    overdueCount: number; attendancePercentage: number; activeCourses: number; activeBatches: number;
    averageResult: number; totalFees: number;
  };
  charts: {
    admissionsTrend: { month: string; admissions: number }[];
    revenueTrend: { month: string; revenue: number }[];
    leadSources: { source: string; count: number }[];
    attendanceTrend: { month: string; percentage: number }[];
    courseEnrollment: { course: string; students: number }[];
    studentPerformance: { band: string; students: number }[];
  };
  actionCenter: {
    todaysFollowUps: Array<{
      _id: string; mode: string; scheduledAt: string; scheduledTime?: string; priority: string;
      leadId?: { _id: string; name: string; phone: string; status: string } | string;
    }>;
    overdueFollowUpCount: number;
    overdueFees: Array<{
      _id: string; title: string; amount: number; paidAmount: number; dueDate: string;
      studentId?: { _id: string; name: string; studentCode: string; phone?: string } | string;
    }>;
    lowAttendance: Array<{
      studentId: string; percentage: number; total: number; present: number; threshold: number;
      student?: { _id: string; name: string; studentCode: string };
    }>;
    todaysClasses: Array<{
      _id: string; title: string; startTime: string; endTime: string; room?: string; status: string;
      batchId?: { name: string } | string; teacherId?: { name: string } | string;
    }>;
    upcomingExams: Array<{ _id: string; title: string; date: string; totalMarks: number }>;
    pendingAdmissions: Array<{
      _id: string; name: string; phone: string; courseInterest?: string; status: string; priority: string;
    }>;
  };
  meta: { attendanceThreshold: number; currencySymbol: string; organizationName: string };
}

const PIE_COLORS = ['#4f46e5', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#f97316', '#64748b', '#ec4899'];

export function AdminDashboard() {
  const { user, organization } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useApiQuery<AdminDashboardData>(
    ['dashboard', 'admin'],
    '/portal/dashboard/admin',
  );

  if (error) {
    return <ErrorState title="Could not load the dashboard" description={error.message} onRetry={() => refetch()} />;
  }

  const c = data?.cards;
  const ac = data?.actionCenter;
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good ${greeting()}, ${firstName}`}
        description={`Here's what's happening at ${organization?.name ?? 'your academy'} today.`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/leads?new=1')} icon={<UserPlus className="h-4 w-4" />}>
              New lead
            </Button>
            <Button size="sm" onClick={() => navigate('/admin/admissions?new=1')} icon={<ArrowUpRight className="h-4 w-4" />}>
              New admission
            </Button>
          </>
        }
      />

      {isLoading ? (
        <CardsSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Active students" value={c?.activeStudents ?? 0}
            hint={`${c?.totalStudents ?? 0} total on the roll`}
            icon={<Users className="h-[18px] w-[18px]" />}
            onClick={() => navigate('/admin/students')}
          />
          <StatCard
            label="Fees collected" value={formatCurrency(c?.feesCollected, { compact: true })}
            hint={`${formatCurrency(c?.feesPending, { compact: true })} still pending`}
            icon={<Wallet className="h-[18px] w-[18px]" />} tone="emerald"
            onClick={() => navigate('/admin/payments')}
          />
          <StatCard
            label="Overdue fees" value={formatCurrency(c?.feesOverdue, { compact: true })}
            hint={`${c?.overdueCount ?? 0} instalments past due`}
            icon={<AlertTriangle className="h-[18px] w-[18px]" />}
            tone={c?.overdueCount ? 'rose' : 'emerald'}
            onClick={() => navigate('/admin/fee-plans')}
          />
          <StatCard
            label="New leads" value={c?.newLeads ?? 0}
            hint={`${c?.conversionRate ?? 0}% conversion rate`}
            icon={<UserPlus className="h-[18px] w-[18px]" />} tone="sky"
            onClick={() => navigate('/admin/pipeline')}
          />
        </div>
      )}

      {isLoading ? (
        <CardsSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard label="Attendance" value={`${c?.attendancePercentage ?? 0}%`} icon={<ClipboardCheck className="h-[18px] w-[18px]" />} tone="violet" hint="Last 30 days" />
          <StatCard label="Average result" value={`${c?.averageResult ?? 0}%`} icon={<Trophy className="h-[18px] w-[18px]" />} tone="amber" hint="Published exams" />
          <StatCard label="Active courses" value={c?.activeCourses ?? 0} icon={<BookOpen className="h-[18px] w-[18px]" />} onClick={() => navigate('/admin/courses')} />
          <StatCard label="Running batches" value={c?.activeBatches ?? 0} icon={<Layers className="h-[18px] w-[18px]" />} tone="sky" onClick={() => navigate('/admin/batches')} />
        </div>
      )}

      {/* -------------------------------- Charts -------------------------------- */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Revenue collected" subtitle="Payments received per month" />
          <div className="h-[280px] p-4">
            {isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.charts.revenueTrend ?? []}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--brand-primary)" strokeWidth={2.5} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Lead sources" subtitle="Where enquiries come from" />
          <div className="h-[280px] p-4">
            {isLoading ? <Skeleton className="h-full w-full" /> : (data?.charts.leadSources?.length ?? 0) === 0 ? (
              <EmptyState title="No leads yet" description="Sources appear once enquiries are captured." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data?.charts.leadSources ?? []} dataKey="count" nameKey="source"
                    innerRadius={50} outerRadius={78} paddingAngle={2}>
                    {(data?.charts.leadSources ?? []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [v, titleCase(n)]}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  <Legend verticalAlign="bottom" height={54}
                    formatter={(v: string) => <span className="text-[11px] text-ink-600">{titleCase(v)}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Admissions trend" subtitle="Confirmed admissions per month" />
          <div className="h-[260px] p-4">
            {isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.charts.admissionsTrend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  <Bar dataKey="admissions" fill="var(--brand-primary)" radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Result distribution" subtitle="Students by score band" />
          <div className="h-[260px] p-4">
            {isLoading ? <Skeleton className="h-full w-full" /> : (data?.charts.studentPerformance?.length ?? 0) === 0 ? (
              <EmptyState title="No results yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.charts.studentPerformance ?? []} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="band" width={52} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  <Bar dataKey="students" fill="var(--brand-accent)" radius={[0, 6, 6, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* ------------------------------ Action centre ----------------------------- */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Today's classes"
            subtitle={`${ac?.todaysClasses?.length ?? 0} scheduled`}
            action={<Link to="/admin/timetable" className="text-[13px] font-medium text-[var(--brand-primary)] hover:underline">View all</Link>}
          />
          {isLoading ? (
            <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (ac?.todaysClasses?.length ?? 0) === 0 ? (
            <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No classes today" description="Nothing is scheduled for today." />
          ) : (
            <div className="max-h-[300px] divide-y divide-ink-100 overflow-y-auto">
              {ac?.todaysClasses.map((cl) => (
                <div key={cl._id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-[62px] shrink-0 text-center">
                    <p className="text-[13px] font-semibold text-ink-900">{formatClock(cl.startTime)}</p>
                    <p className="text-[11px] text-ink-400">{formatClock(cl.endTime)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{labelOf(cl.batchId, 'name', cl.title)}</p>
                    <p className="truncate text-xs text-ink-500">
                      {labelOf(cl.teacherId, 'name', 'Unassigned')}{cl.room ? ` · ${cl.room}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={cl.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Follow-ups due today"
            subtitle={ac?.overdueFollowUpCount ? `${ac.overdueFollowUpCount} also overdue` : 'Calls and visits for today'}
            action={<Link to="/admin/follow-ups" className="text-[13px] font-medium text-[var(--brand-primary)] hover:underline">View all</Link>}
          />
          {isLoading ? (
            <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (ac?.todaysFollowUps?.length ?? 0) === 0 ? (
            <EmptyState icon={<PhoneCall className="h-6 w-6" />} title="No follow-ups today" description="Your team is all caught up." />
          ) : (
            <div className="max-h-[300px] divide-y divide-ink-100 overflow-y-auto">
              {ac?.todaysFollowUps.map((f) => {
                const lead = typeof f.leadId === 'object' ? f.leadId : null;
                return (
                  <Link key={f._id} to={lead ? `/admin/leads/${lead._id}` : '/admin/follow-ups'}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-50">
                    <Avatar name={lead?.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink-900">{lead?.name ?? 'Lead'}</p>
                      <p className="truncate text-xs text-ink-500">
                        {titleCase(f.mode)} · {f.scheduledTime ?? formatDate(f.scheduledAt, 'h:mm A')}
                      </p>
                    </div>
                    <Badge tone={f.priority}>{titleCase(f.priority)}</Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Overdue fees"
            subtitle="Instalments past their due date"
            action={<Link to="/admin/fee-plans" className="text-[13px] font-medium text-[var(--brand-primary)] hover:underline">View all</Link>}
          />
          {isLoading ? (
            <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (ac?.overdueFees?.length ?? 0) === 0 ? (
            <EmptyState icon={<Wallet className="h-6 w-6" />} title="Nothing overdue" description="Every instalment is on track." />
          ) : (
            <div className="max-h-[320px] divide-y divide-ink-100 overflow-y-auto">
              {ac?.overdueFees.slice(0, 8).map((f) => {
                const s = typeof f.studentId === 'object' ? f.studentId : null;
                return (
                  <Link key={f._id} to={s ? `/admin/students/${s._id}` : '/admin/fee-plans'}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-50">
                    <Avatar name={s?.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink-900">{s?.name ?? 'Student'}</p>
                      <p className="truncate text-xs text-ink-500">{f.title} · due {formatDate(f.dueDate, 'DD MMM')}</p>
                    </div>
                    <span className="shrink-0 text-[13px] font-semibold text-rose-600">
                      {formatCurrency(f.amount - f.paidAmount)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Low attendance"
            subtitle={`Below the ${data?.meta?.attendanceThreshold ?? 75}% threshold`}
            action={<Link to="/admin/attendance" className="text-[13px] font-medium text-[var(--brand-primary)] hover:underline">View all</Link>}
          />
          {isLoading ? (
            <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (ac?.lowAttendance?.length ?? 0) === 0 ? (
            <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="Attendance looks healthy" description="No student is below the threshold." />
          ) : (
            <div className="max-h-[320px] divide-y divide-ink-100 overflow-y-auto">
              {ac?.lowAttendance.slice(0, 8).map((a) => (
                <Link key={a.studentId} to={`/admin/students/${a.student?._id ?? a.studentId}`}
                  className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-50">
                  <Avatar name={a.student?.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{a.student?.name ?? 'Student'}</p>
                    <p className="truncate text-xs text-ink-500">
                      {a.present}/{a.total} classes attended
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-700">
                    <TrendingDown className="h-3 w-3" />
                    {a.percentage}%
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
