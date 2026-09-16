import { Link } from 'react-router-dom';
import {
  Building2, Users, TrendingUp, CreditCard, BookOpen, Activity, ArrowRight, Clock,
} from 'lucide-react';
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useApiQuery } from '@/hooks/useApi';
import { StatCard } from '@/components/StatCard';
import {
  Card, CardHeader, PageHeader, CardsSkeleton, Skeleton, EmptyState, ErrorState, Badge, StatusBadge, Avatar,
} from '@/components/ui';
import { formatCurrency, formatDate, fromNow, titleCase } from '@/lib/utils';
import type { Organization, AuditLogItem } from '@/types';

const COLORS = ['#4f46e5', '#0ea5e9', '#22c55e'];

interface OwnerDashboardData {
  cards: {
    totalOrganizations: number; activeOrganizations: number; trialOrganizations: number;
    suspendedOrganizations: number; newOrganizationsThisMonth: number;
    totalStudents: number; totalStaff: number; totalCourses: number;
    platformRevenue: number; mrr: number;
  };
  planDistribution: { plan: string; count: number; mrr: number }[];
  growthSeries: { month: string; organizations: number }[];
  recentOrganizations: Organization[];
  recentActivity: AuditLogItem[];
}

export function OwnerDashboard() {
  const { data, isLoading, error, refetch } = useApiQuery<OwnerDashboardData>(['owner', 'dashboard'], '/owner/dashboard');

  if (error) return <ErrorState title="Could not load the platform dashboard" description={error.message} onRetry={() => refetch()} />;
  const c = data?.cards;

  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" description="Every academy running on AcademyOS." />

      {isLoading ? (
        <CardsSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Academies" value={c?.totalOrganizations ?? 0} hint={`${c?.activeOrganizations ?? 0} active · ${c?.trialOrganizations ?? 0} on trial`} icon={<Building2 className="h-[18px] w-[18px]" />} />
          <StatCard label="Monthly recurring revenue" value={formatCurrency(c?.mrr, { compact: true })} hint={`${formatCurrency(c?.platformRevenue, { compact: true })} collected`} icon={<TrendingUp className="h-[18px] w-[18px]" />} tone="emerald" />
          <StatCard label="Students on platform" value={c?.totalStudents ?? 0} hint={`${c?.totalStaff ?? 0} staff accounts`} icon={<Users className="h-[18px] w-[18px]" />} tone="sky" />
          <StatCard label="Courses published" value={c?.totalCourses ?? 0} hint={`${c?.newOrganizationsThisMonth ?? 0} new academies this month`} icon={<BookOpen className="h-[18px] w-[18px]" />} tone="violet" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Academy growth" subtitle="New academies per month" />
          <div className="h-[280px] p-4">
            {isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.growthSeries ?? []}>
                  <defs>
                    <linearGradient id="grw" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  <Area type="monotone" dataKey="organizations" name="Academies" stroke="#4f46e5" strokeWidth={2.5} fill="url(#grw)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Plan mix" subtitle="Academies per plan" />
          <div className="h-[280px] p-4">
            {isLoading ? <Skeleton className="h-full w-full" /> : (data?.planDistribution?.length ?? 0) === 0 ? (
              <EmptyState title="No subscriptions yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data?.planDistribution ?? []} dataKey="count" nameKey="plan" innerRadius={50} outerRadius={78} paddingAngle={2}>
                    {(data?.planDistribution ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [`${v} academies`, titleCase(n)]} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  <Legend formatter={(v: string) => <span className="text-[11px] text-ink-600">{titleCase(v)}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent academies"
            action={<Link to="/owner/organizations" className="text-[13px] font-medium text-[var(--brand-primary)] hover:underline">View all</Link>}
          />
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (data?.recentOrganizations?.length ?? 0) === 0 ? (
            <EmptyState icon={<Building2 className="h-6 w-6" />} title="No academies yet" description="Create your first academy to get started." />
          ) : (
            <div className="divide-y divide-ink-100">
              {data?.recentOrganizations.map((o) => (
                <Link key={o._id} to={`/owner/organizations/${o._id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-50">
                  <Avatar name={o.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{o.name}</p>
                    <p className="truncate text-xs text-ink-500">{o.code} · {o.email}</p>
                  </div>
                  <StatusBadge status={o.status} />
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-400" />
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent platform activity"
            action={<Link to="/owner/audit-logs" className="text-[13px] font-medium text-[var(--brand-primary)] hover:underline">Audit log</Link>}
          />
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (data?.recentActivity?.length ?? 0) === 0 ? (
            <EmptyState icon={<Activity className="h-6 w-6" />} title="No activity yet" />
          ) : (
            <div className="max-h-[320px] divide-y divide-ink-100 overflow-y-auto">
              {data?.recentActivity.slice(0, 10).map((a) => (
                <div key={a._id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{a.action}</p>
                    <p className="truncate text-xs text-ink-500">
                      {a.userName ?? 'System'}{a.entity ? ` · ${a.entity}` : ''}
                    </p>
                  </div>
                  <Badge tone={a.status === 'SUCCESS' ? 'ACTIVE' : 'CANCELLED'}>{a.status}</Badge>
                  <span className="shrink-0 text-[11px] text-ink-400">{fromNow(a.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {!isLoading && (c?.suspendedOrganizations ?? 0) > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Clock className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            {c?.suspendedOrganizations} academy(ies) are suspended.{' '}
            <Link to="/owner/organizations?status=SUSPENDED" className="font-medium underline">Review them</Link>.
          </p>
        </div>
      )}

      <p className="text-xs text-ink-400">
        Platform revenue is the sum of subscription payments recorded across all academies.
        Last refreshed {formatDate(new Date(), 'DD MMM YYYY')}.
      </p>
    </div>
  );
}

export const OwnerCreditIcon = CreditCard;
