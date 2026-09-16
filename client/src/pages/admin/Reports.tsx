import { useState } from 'react';
import { Download, TrendingUp, Users, ClipboardCheck, Award } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useApiQuery } from '@/hooks/useApi';
import {
  PageHeader, Card, CardHeader, Button, Select, Tabs, Skeleton, ErrorState, EmptyState, useToast, Badge,
} from '@/components/ui';
import { StatCard } from '@/components/StatCard';
import { downloadFile, ApiError } from '@/lib/api';
import { formatCurrency, formatDate, titleCase } from '@/lib/utils';

const COLORS = ['#4f46e5', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#f97316'];
const TABS = [
  { id: 'revenue', label: 'Revenue' },
  { id: 'admissions', label: 'Admissions' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'performance', label: 'Performance' },
];

export function ReportsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('revenue');
  const [range, setRange] = useState('12m');

  const exportCsv = async (entity: string) => {
    try {
      await downloadFile(`/reports/export/${entity}`, `${entity}-${Date.now()}.csv`);
      toast.success('Export ready', 'Your CSV download has started.');
    } catch (e) {
      toast.error('Export failed', (e as ApiError).message);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Live aggregates computed in MongoDB across your academy's data."
        actions={
          <>
            <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-36">
              <option value="3m">Last 3 months</option>
              <option value="6m">Last 6 months</option>
              <option value="12m">Last 12 months</option>
            </Select>
            <Button variant="outline" size="sm" onClick={() => exportCsv(tab === 'revenue' ? 'payments' : 'students')} icon={<Download className="h-4 w-4" />}>
              Export CSV
            </Button>
          </>
        }
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'revenue' && <RevenueReport range={range} />}
      {tab === 'admissions' && <AdmissionsReport range={range} />}
      {tab === 'attendance' && <AttendanceReport range={range} />}
      {tab === 'performance' && <PerformanceReport range={range} />}
    </div>
  );
}

function useReport<T>(name: string, range: string) {
  return useApiQuery<T>([`report-${name}`, range], `/reports/${name}`, { range });
}

function ChartFrame({
  title, subtitle, loading, error, empty, children, height = 300,
}: {
  title: string; subtitle?: string; loading: boolean; error?: { message: string } | null;
  empty?: boolean; children: React.ReactNode; height?: number;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="p-4" style={{ height }}>
        {loading ? <Skeleton className="h-full w-full" />
          : error ? <ErrorState title="Could not load" description={error.message} />
          : empty ? <EmptyState title="No data in this range" description="Try widening the date range." />
          : <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>}
      </div>
    </Card>
  );
}

const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 };

/* -------------------------------- Revenue --------------------------------- */

interface RevenueData {
  series: { period: string; amount: number; count: number }[];
  byMethod: { method: string; total: number; count: number }[];
  byCourse: { course: string; total: number; students?: number }[];
  totals: { collected: number; payments: number; averagePayment: number; pending: number; pendingCount: number; overdue: number; overdueCount: number };
}

function RevenueReport({ range }: { range: string }) {
  const { data, isLoading, error } = useReport<RevenueData>('revenue', range);
  const t = data?.totals;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collected" value={formatCurrency(t?.collected, { compact: true })} hint={`${t?.payments ?? 0} payments`} tone="emerald" icon={<TrendingUp className="h-[18px] w-[18px]" />} loading={isLoading} />
        <StatCard label="Average payment" value={formatCurrency(t?.averagePayment, { compact: true })} loading={isLoading} />
        <StatCard label="Pending" value={formatCurrency(t?.pending, { compact: true })} hint={`${t?.pendingCount ?? 0} instalments`} tone="amber" loading={isLoading} />
        <StatCard label="Overdue" value={formatCurrency(t?.overdue, { compact: true })} hint={`${t?.overdueCount ?? 0} instalments`} tone="rose" loading={isLoading} />
      </div>

      <ChartFrame title="Revenue over time" subtitle="Collected per period" loading={isLoading} error={error} empty={!data?.series?.length}>
        <AreaChart data={data?.series ?? []}>
          <defs>
            <linearGradient id="rr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${v / 1000}k` : v)} />
          <Tooltip formatter={(v: number) => [formatCurrency(v), 'Collected']} contentStyle={tooltipStyle} />
          <Area type="monotone" dataKey="amount" stroke="#4f46e5" strokeWidth={2.5} fill="url(#rr)" />
        </AreaChart>
      </ChartFrame>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartFrame title="By payment method" loading={isLoading} error={error} empty={!data?.byMethod?.length}>
          <PieChart>
            <Pie data={data?.byMethod ?? []} dataKey="total" nameKey="method" innerRadius={50} outerRadius={80} paddingAngle={2}>
              {(data?.byMethod ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number, n: string) => [formatCurrency(v), titleCase(n)]} contentStyle={tooltipStyle} />
            <Legend formatter={(v: string) => <span className="text-[11px] text-ink-600">{titleCase(v)}</span>} />
          </PieChart>
        </ChartFrame>

        <ChartFrame title="By course" subtitle="Revenue contribution" loading={isLoading} error={error} empty={!data?.byCourse?.length}>
          <BarChart data={(data?.byCourse ?? []).slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${v / 1000}k` : v)} />
            <YAxis type="category" dataKey="course" width={110} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} cursor={{ fill: '#f1f5f9' }} contentStyle={tooltipStyle} />
            <Bar dataKey="total" fill="#0ea5e9" radius={[0, 6, 6, 0]} maxBarSize={22} />
          </BarChart>
        </ChartFrame>
      </div>
    </div>
  );
}

/* ------------------------------- Admissions -------------------------------- */

interface AdmissionsData {
  series: { period: string; count: number }[];
  bySource: { source: string; count: number }[];
  byCourse: { course: string; count: number }[];
  funnel?: { status: string; count: number }[];
  totals?: { admissions: number; leads: number; conversionRate: number };
}

function AdmissionsReport({ range }: { range: string }) {
  const { data, isLoading, error } = useReport<AdmissionsData>('admissions', range);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Admissions" value={data?.totals?.admissions ?? 0} icon={<Users className="h-[18px] w-[18px]" />} loading={isLoading} />
        <StatCard label="Leads captured" value={data?.totals?.leads ?? 0} tone="sky" loading={isLoading} />
        <StatCard label="Conversion rate" value={`${data?.totals?.conversionRate ?? 0}%`} tone="emerald" loading={isLoading} />
      </div>

      <ChartFrame title="Admissions over time" loading={isLoading} error={error} empty={!data?.series?.length}>
        <BarChart data={data?.series ?? []}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={tooltipStyle} />
          <Bar dataKey="count" name="Admissions" fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ChartFrame>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartFrame title="Lead sources" loading={isLoading} error={error} empty={!data?.bySource?.length}>
          <PieChart>
            <Pie data={data?.bySource ?? []} dataKey="count" nameKey="source" innerRadius={50} outerRadius={80} paddingAngle={2}>
              {(data?.bySource ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number, n: string) => [v, titleCase(n)]} contentStyle={tooltipStyle} />
            <Legend formatter={(v: string) => <span className="text-[11px] text-ink-600">{titleCase(v)}</span>} />
          </PieChart>
        </ChartFrame>

        <ChartFrame title="Admissions by course" loading={isLoading} error={error} empty={!data?.byCourse?.length}>
          <BarChart data={(data?.byCourse ?? []).slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="course" width={110} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={tooltipStyle} />
            <Bar dataKey="count" name="Admissions" fill="#22c55e" radius={[0, 6, 6, 0]} maxBarSize={22} />
          </BarChart>
        </ChartFrame>
      </div>
    </div>
  );
}

/* ------------------------------- Attendance -------------------------------- */

interface AttendanceData {
  series: { period: string; total: number; present: number; percentage: number }[];
  byBatch: { batch: string; code: string; total: number; present: number; percentage: number }[];
  byStatus: { status: string; count: number }[];
  lowestStudents: { studentId: string; name?: string; percentage?: number }[];
}

function AttendanceReport({ range }: { range: string }) {
  const { data, isLoading, error } = useReport<AttendanceData>('attendance', range);
  const overall = data?.series?.length
    ? Math.round(data.series.reduce((s, x) => s + x.percentage, 0) / data.series.length)
    : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Overall attendance" value={`${overall}%`} icon={<ClipboardCheck className="h-[18px] w-[18px]" />} tone={overall >= 75 ? 'emerald' : 'amber'} loading={isLoading} />
        <StatCard label="Batches tracked" value={data?.byBatch?.length ?? 0} loading={isLoading} />
        <StatCard label="Students below 75%" value={data?.lowestStudents?.length ?? 0} tone="rose" loading={isLoading} />
      </div>

      <ChartFrame title="Attendance trend" subtitle="Percentage present per period" loading={isLoading} error={error} empty={!data?.series?.length}>
        <AreaChart data={data?.series ?? []}>
          <defs>
            <linearGradient id="att" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: number) => [`${v}%`, 'Present']} contentStyle={tooltipStyle} />
          <Area type="monotone" dataKey="percentage" stroke="#14b8a6" strokeWidth={2.5} fill="url(#att)" />
        </AreaChart>
      </ChartFrame>

      <ChartFrame title="Attendance by batch" loading={isLoading} error={error} empty={!data?.byBatch?.length} height={340}>
        <BarChart data={data?.byBatch ?? []} layout="vertical" margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="batch" width={120} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: number) => [`${v}%`, 'Attendance']} cursor={{ fill: '#f1f5f9' }} contentStyle={tooltipStyle} />
          <Bar dataKey="percentage" fill="#0ea5e9" radius={[0, 6, 6, 0]} maxBarSize={20} />
        </BarChart>
      </ChartFrame>
    </div>
  );
}

/* ------------------------------ Performance -------------------------------- */

interface PerformanceData {
  distribution?: { band: string; count: number }[];
  bySubject?: { subject: string; average: number; count?: number }[];
  topStudents?: { studentId: string; name: string; average: number; exams?: number }[];
  totals?: { results: number; average: number; passRate: number };
}

function PerformanceReport({ range }: { range: string }) {
  const { data, isLoading, error } = useReport<PerformanceData>('performance', range);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Results recorded" value={data?.totals?.results ?? 0} icon={<Award className="h-[18px] w-[18px]" />} loading={isLoading} />
        <StatCard label="Average score" value={`${data?.totals?.average ?? 0}%`} tone="violet" loading={isLoading} />
        <StatCard label="Pass rate" value={`${data?.totals?.passRate ?? 0}%`} tone="emerald" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartFrame title="Score distribution" loading={isLoading} error={error} empty={!data?.distribution?.length}>
          <BarChart data={data?.distribution ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="band" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={tooltipStyle} />
            <Bar dataKey="count" name="Students" fill="#a855f7" radius={[6, 6, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ChartFrame>

        <ChartFrame title="Average by subject" loading={isLoading} error={error} empty={!data?.bySubject?.length}>
          <BarChart data={data?.bySubject ?? []} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="subject" width={100} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => [`${v}%`, 'Average']} cursor={{ fill: '#f1f5f9' }} contentStyle={tooltipStyle} />
            <Bar dataKey="average" fill="#f59e0b" radius={[0, 6, 6, 0]} maxBarSize={20} />
          </BarChart>
        </ChartFrame>
      </div>

      {!!data?.topStudents?.length && (
        <Card>
          <CardHeader title="Top performers" subtitle="Highest average across exams in this range" />
          <div className="divide-y divide-ink-100">
            {data.topStudents.slice(0, 10).map((s, i) => (
              <div key={s.studentId} className="flex items-center gap-3 px-5 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-600">{i + 1}</span>
                <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-900">{s.name}</p>
                {s.exams ? <Badge>{s.exams} exams</Badge> : null}
                <span className="shrink-0 text-[13px] font-bold text-emerald-700">{Math.round(s.average)}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export const reportDate = formatDate;
