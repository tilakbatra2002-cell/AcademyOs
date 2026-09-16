import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, KeyRound, Power, Activity, TrendingUp, Building2, Users } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useListQuery, useApiQuery, useApiMutation } from '@/hooks/useApi';
import { DataTable, Column } from '@/components/DataTable';
import {
  PageHeader, Card, CardHeader, Button, Badge, StatusBadge, Avatar, Skeleton, EmptyState,
  ErrorState, ProgressBar, useToast, useConfirm,
} from '@/components/ui';
import { StatCard } from '@/components/StatCard';
import { formatBytes, formatCurrency, formatDate, fromNow, titleCase } from '@/lib/utils';
import type { Organization, AuditLogItem, User } from '@/types';

const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 };

/* ------------------------------ Subscriptions ------------------------------ */

interface SubscriptionRow {
  _id: string;
  organizationId: string;
  organization?: Organization;
  plan: string;
  status: string;
  billingCycle: string;
  amount: number;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  limits: Record<string, number>;
  usage: Record<string, number>;
}

export function OwnerSubscriptions() {
  const list = useListQuery<SubscriptionRow>('owner-subs', '/owner/subscriptions');

  const columns: Column<SubscriptionRow>[] = [
    {
      key: 'org',
      header: 'Academy',
      render: (s) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={s.organization?.name} size="xs" />
          <div className="min-w-0">
            <Link to={`/owner/organizations/${s.organizationId}`} className="truncate text-[13px] font-medium text-ink-900 hover:underline">
              {s.organization?.name ?? 'Academy'}
            </Link>
            <p className="truncate text-xs text-ink-500">{s.organization?.code ?? ''}</p>
          </div>
        </div>
      ),
    },
    { key: 'plan', header: 'Plan', render: (s) => <Badge tone="brand">{titleCase(s.plan)}</Badge> },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
    { key: 'cycle', header: 'Billing', hideBelow: 'lg', render: (s) => <span className="text-[13px]">{titleCase(s.billingCycle)}</span> },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-right',
      render: (s) => <span className="text-[13px] font-semibold">{formatCurrency(s.amount)}</span>,
    },
    {
      key: 'students',
      header: 'Student usage',
      hideBelow: 'md',
      render: (s) => {
        const used = s.usage?.students ?? 0;
        const max = s.limits?.students ?? 0;
        const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
        return (
          <div className="w-28">
            <p className="mb-1 text-xs text-ink-600">{used} / {max}</p>
            <ProgressBar value={pct} tone={pct >= 90 ? 'rose' : pct >= 70 ? 'amber' : 'brand'} />
          </div>
        );
      },
    },
    {
      key: 'renews',
      header: 'Renews',
      hideBelow: 'xl',
      render: (s) => (
        <span className="text-[13px] text-ink-500">
          {s.status === 'TRIALING' && s.trialEndsAt
            ? `Trial ends ${formatDate(s.trialEndsAt, 'DD MMM')}`
            : s.currentPeriodEnd ? formatDate(s.currentPeriodEnd, 'DD MMM YYYY') : '—'}
        </span>
      ),
    },
  ];

  const mrr = list.items.reduce((sum, s) => sum + (s.status === 'ACTIVE' ? s.amount : 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Subscriptions" description={`${list.total} subscription(s) across the platform`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Subscriptions" value={list.total} icon={<CreditCard className="h-[18px] w-[18px]" />} loading={list.isLoading} />
        <StatCard label="Active MRR (this page)" value={formatCurrency(mrr, { compact: true })} tone="emerald" icon={<TrendingUp className="h-[18px] w-[18px]" />} loading={list.isLoading} />
        <StatCard label="On trial" value={list.items.filter((s) => s.status === 'TRIALING').length} tone="amber" loading={list.isLoading} />
      </div>
      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(s) => s._id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search by academy…"
        filters={[
          { key: 'plan', label: 'All plans', options: ['STARTER', 'GROWTH', 'PRO'].map((p) => ({ value: p, label: titleCase(p) })) },
          { key: 'status', label: 'All statuses', options: ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELLED'].map((s) => ({ value: s, label: titleCase(s) })) },
        ]}
        filterValues={list.filters}
        onFilter={list.setFilter}
        onClearFilters={list.clearFilters}
        activeFilterCount={list.activeFilterCount}
        page={list.page}
        pages={list.pages}
        total={list.total}
        limit={list.limit}
        onPage={list.setPage}
        emptyTitle="No subscriptions"
        emptyDescription="Subscriptions are created automatically with each academy."
      />
    </div>
  );
}

/* ---------------------------------- Users ---------------------------------- */

export function OwnerUsers() {
  const toast = useToast();
  const confirm = useConfirm();
  const list = useListQuery<User & { organizationId?: string }>('owner-users', '/owner/users');
  const { data: orgs } = useApiQuery<{ items: Organization[] }>(['owner-orgs', 'options'], '/owner/organizations', { limit: 100 });

  const toggleActive = useApiMutation<{ userId: string }>((b) => `/owner/users/${b.userId}/toggle-active`, {
    invalidate: ['owner-users'], onSuccess: () => toast.success('Access updated'),
  });
  const resetPassword = useApiMutation<{ userId: string }, { password?: string }>(
    (b) => `/owner/users/${b.userId}/reset-password`,
    { onSuccess: (r) => toast.success('Password reset', r.password ? `New password: ${r.password}` : 'Done.') },
  );

  const orgName = (id?: string) => orgs?.items.find((o) => o._id === id)?.name ?? '—';

  const columns: Column<User & { organizationId?: string }>[] = [
    {
      key: 'name',
      header: 'User',
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={u.name} size="xs" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink-900">{u.name}</p>
            <p className="truncate text-xs text-ink-500">{u.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'org', header: 'Academy', hideBelow: 'md', render: (u) => <span className="text-[13px]">{orgName(u.organizationId)}</span> },
    { key: 'role', header: 'Role', render: (u) => <Badge>{titleCase(u.role)}</Badge> },
    { key: 'last', header: 'Last login', hideBelow: 'xl', render: (u) => <span className="text-[13px] text-ink-500">{u.lastLoginAt ? formatDate(u.lastLoginAt, 'DD MMM YYYY') : 'Never'}</span> },
    { key: 'status', header: 'Status', render: (u) => <Badge tone={u.isActive ? 'ACTIVE' : 'SUSPENDED'}>{u.isActive ? 'Active' : 'Suspended'}</Badge> },
    {
      key: 'actions',
      header: '',
      className: 'w-px',
      render: (u) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" title="Reset password"
            loading={resetPassword.isPending && resetPassword.variables?.userId === u._id}
            onClick={async () => {
              const ok = await confirm({ title: `Reset the password for ${u.name}?`, description: 'A new temporary password will be generated.', confirmLabel: 'Reset' });
              if (ok) resetPassword.mutate({ userId: u._id });
            }}>
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title={u.isActive ? 'Suspend' : 'Activate'}
            loading={toggleActive.isPending && toggleActive.variables?.userId === u._id}
            onClick={async () => {
              const ok = await confirm({
                title: u.isActive ? `Suspend ${u.name}?` : `Activate ${u.name}?`,
                description: u.isActive ? 'They will be signed out immediately.' : 'They will be able to sign in again.',
                confirmLabel: u.isActive ? 'Suspend' : 'Activate',
                danger: u.isActive,
              });
              if (ok) toggleActive.mutate({ userId: u._id });
            }}>
            <Power className={`h-4 w-4 ${u.isActive ? 'text-rose-500' : 'text-emerald-600'}`} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Platform users" description={`${list.total} account(s) across every academy`} />
      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(u) => u._id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search by name or email…"
        filters={[
          { key: 'organizationId', label: 'All academies', options: (orgs?.items ?? []).map((o) => ({ value: o._id, label: o.name })) },
          {
            key: 'role',
            label: 'All roles',
            options: ['ORGANIZATION_ADMIN', 'COUNSELOR', 'ACCOUNTANT', 'STAFF', 'TEACHER', 'STUDENT', 'PARENT'].map((r) => ({ value: r, label: titleCase(r) })),
          },
          { key: 'isActive', label: 'All statuses', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Suspended' }] },
        ]}
        filterValues={list.filters}
        onFilter={list.setFilter}
        onClearFilters={list.clearFilters}
        activeFilterCount={list.activeFilterCount}
        page={list.page}
        pages={list.pages}
        total={list.total}
        limit={list.limit}
        onPage={list.setPage}
        emptyTitle="No users"
      />
    </div>
  );
}

/* -------------------------------- Audit logs -------------------------------- */

export function OwnerAuditLogs() {
  const list = useListQuery<AuditLogItem & { organizationId?: string }>('owner-audit', '/owner/audit-logs');
  const { data: orgs } = useApiQuery<{ items: Organization[] }>(['owner-orgs', 'options'], '/owner/organizations', { limit: 100 });

  const columns: Column<AuditLogItem & { organizationId?: string }>[] = [
    {
      key: 'action',
      header: 'Action',
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink-900">{a.action}</p>
          <p className="truncate text-xs text-ink-500">{a.entity ?? '—'}{a.entityId ? ` · ${String(a.entityId).slice(-6)}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'user',
      header: 'By',
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] text-ink-800">{a.userName ?? 'System'}</p>
          <p className="truncate text-xs text-ink-400">{a.userRole ? titleCase(a.userRole) : ''}</p>
        </div>
      ),
    },
    {
      key: 'org',
      header: 'Academy',
      hideBelow: 'lg',
      render: (a) => <span className="text-[13px]">{orgs?.items.find((o) => o._id === a.organizationId)?.name ?? '—'}</span>,
    },
    { key: 'ip', header: 'IP', hideBelow: 'xl', render: (a) => <span className="text-xs text-ink-500">{a.ip ?? '—'}</span> },
    { key: 'status', header: 'Result', render: (a) => <Badge tone={a.status === 'SUCCESS' ? 'ACTIVE' : 'CANCELLED'}>{a.status}</Badge> },
    { key: 'when', header: 'When', render: (a) => <span className="text-xs text-ink-500">{fromNow(a.createdAt)}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Audit logs" description={`${list.total} event(s) recorded platform-wide`} />
      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(a) => a._id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search actions…"
        filters={[
          { key: 'organizationId', label: 'All academies', options: (orgs?.items ?? []).map((o) => ({ value: o._id, label: o.name })) },
          { key: 'status', label: 'All results', options: [{ value: 'SUCCESS', label: 'Success' }, { value: 'FAILURE', label: 'Failure' }] },
        ]}
        filterValues={list.filters}
        onFilter={list.setFilter}
        onClearFilters={list.clearFilters}
        activeFilterCount={list.activeFilterCount}
        page={list.page}
        pages={list.pages}
        total={list.total}
        limit={list.limit}
        onPage={list.setPage}
        emptyTitle="No audit events"
        emptyDescription="Security-relevant actions are recorded here automatically."
      />
    </div>
  );
}

/* --------------------------------- Reports --------------------------------- */

interface OwnerReports {
  growth?: { month: string; organizations: number; students?: number }[];
  revenue?: { month: string; amount: number }[];
  byPlan?: { plan: string; count: number; mrr: number }[];
  topOrganizations?: { _id: string; name: string; students: number; revenue: number }[];
  totals?: { organizations: number; students: number; revenue: number; mrr: number };
}

export function OwnerReports() {
  const { data, isLoading, error, refetch } = useApiQuery<OwnerReports>(['owner', 'reports'], '/owner/reports');

  if (error) return <ErrorState title="Could not load reports" description={error.message} onRetry={() => refetch()} />;
  const t = data?.totals;

  return (
    <div className="space-y-5">
      <PageHeader title="Platform reports" description="Growth and revenue across every academy." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Academies" value={t?.organizations ?? 0} icon={<Building2 className="h-[18px] w-[18px]" />} loading={isLoading} />
        <StatCard label="Students" value={t?.students ?? 0} icon={<Users className="h-[18px] w-[18px]" />} tone="sky" loading={isLoading} />
        <StatCard label="Revenue" value={formatCurrency(t?.revenue, { compact: true })} tone="emerald" loading={isLoading} />
        <StatCard label="MRR" value={formatCurrency(t?.mrr, { compact: true })} tone="violet" loading={isLoading} />
      </div>

      <Card>
        <CardHeader title="Platform revenue" subtitle="Subscription income per month" />
        <div className="h-[280px] p-4">
          {isLoading ? <Skeleton className="h-full w-full" /> : (data?.revenue?.length ?? 0) === 0 ? (
            <EmptyState title="No revenue data" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.revenue ?? []}>
                <defs>
                  <linearGradient id="orev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="amount" stroke="#22c55e" strokeWidth={2.5} fill="url(#orev)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Academy growth" />
          <div className="h-[260px] p-4">
            {isLoading ? <Skeleton className="h-full w-full" /> : (data?.growth?.length ?? 0) === 0 ? (
              <EmptyState title="No growth data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.growth ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={tooltipStyle} />
                  <Bar dataKey="organizations" name="Academies" fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Largest academies" subtitle="By student count" />
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (data?.topOrganizations?.length ?? 0) === 0 ? (
            <EmptyState icon={<Activity className="h-6 w-6" />} title="No data" />
          ) : (
            <div className="divide-y divide-ink-100">
              {data?.topOrganizations?.map((o, i) => (
                <Link key={o._id} to={`/owner/organizations/${o._id}`} className="flex items-center gap-3 px-5 py-2.5 transition hover:bg-ink-50">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-600">{i + 1}</span>
                  <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-900">{o.name}</p>
                  <span className="shrink-0 text-[13px] text-ink-600">{o.students} students</span>
                  <span className="shrink-0 text-[13px] font-semibold text-emerald-700">{formatCurrency(o.revenue, { compact: true })}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------- Settings -------------------------------- */

export function OwnerSettings() {
  const { data, isLoading, error, refetch } = useApiQuery<{
    plans?: Record<string, { price: number; limits: Record<string, number> }>;
    trialDays?: number;
    storageDriver?: string;
    paymentProvider?: string;
    messagingProvider?: string;
    version?: string;
  }>(['owner', 'settings'], '/owner/settings');

  const [copied, setCopied] = useState(false);

  if (error) return <ErrorState title="Could not load settings" description={error.message} onRetry={() => refetch()} />;

  return (
    <div className="space-y-5">
      <PageHeader title="Platform settings" description="How this AcademyOS deployment is configured." />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader title="Environment" subtitle="Read-only — set through server environment variables" />
            <dl className="grid grid-cols-1 gap-px bg-ink-100 sm:grid-cols-2">
              <Row label="Storage driver" value={data?.storageDriver ?? 'local'} />
              <Row label="Payment provider" value={data?.paymentProvider ?? 'manual'} />
              <Row label="Messaging provider" value={data?.messagingProvider ?? 'not configured'} />
              <Row label="Default trial length" value={`${data?.trialDays ?? 14} days`} />
            </dl>
          </Card>

          {data?.plans && (
            <Card>
              <CardHeader title="Plan catalogue" subtitle="Limits enforced server-side for every academy" />
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
                {Object.entries(data.plans).map(([name, p]) => (
                  <div key={name} className="rounded-xl border border-ink-200 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-display text-base font-bold text-ink-900">{titleCase(name)}</p>
                      <Badge tone="brand">{formatCurrency(p.price)}</Badge>
                    </div>
                    <dl className="mt-3 space-y-1">
                      {Object.entries(p.limits ?? {}).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between text-[13px]">
                          <dt className="text-ink-500">{titleCase(k.replace(/Bytes$/, ' storage'))}</dt>
                          <dd className="font-medium text-ink-900">{/bytes|storage/i.test(k) ? formatBytes(v) : v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Portal links" subtitle="Share these with your academies" />
            <div className="space-y-2 p-5">
              {['owner', 'admin', 'teacher', 'student', 'parent'].map((p) => {
                const url = `${window.location.origin}/${p}/login`;
                return (
                  <div key={p} className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2">
                    <Badge>{titleCase(p)}</Badge>
                    <code className="min-w-0 flex-1 truncate text-xs text-ink-600">{url}</code>
                    <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                      Copy
                    </Button>
                  </div>
                );
              })}
              {copied && <p className="text-xs text-emerald-600">Copied to clipboard.</p>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-5 py-3">
      <dt className="text-xs font-medium text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium text-ink-900">{titleCase(value)}</dd>
    </div>
  );
}
