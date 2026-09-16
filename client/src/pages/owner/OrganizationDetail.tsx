import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft, Users, GraduationCap, BookOpen, Layers, Wallet, Ban, PlayCircle, UserPlus,
  CreditCard, KeyRound, Activity, Building2,
} from 'lucide-react';
import { useApiQuery, useApiMutation, applyFieldErrors } from '@/hooks/useApi';
import {
  PageHeader, Card, CardHeader, Button, Modal, Field, Input, Select, Badge, StatusBadge, Avatar,
  Skeleton, ErrorState, EmptyState, ProgressBar, Tabs, useToast, useConfirm,
} from '@/components/ui';
import { StatCard } from '@/components/StatCard';
import { formatBytes, formatCurrency, formatDate, fromNow, titleCase } from '@/lib/utils';
import type { Organization, AuditLogItem } from '@/types';

interface OrgDetail {
  organization: Organization;
  subscription: {
    _id: string; plan: string; status: string; billingCycle: string; amount: number;
    trialEndsAt?: string; currentPeriodStart?: string; currentPeriodEnd?: string;
    limits: Record<string, number>; usage: Record<string, number>;
  };
  admins: { _id: string; name: string; email: string; phone?: string; isActive: boolean; createdAt: string }[];
  stats: { students: number; activeStudents: number; staff: number; teachers: number; courses: number; batches: number; leads: number; revenue: number };
  recentActivity: AuditLogItem[];
  usage: Record<string, number>;
}

export function OwnerOrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('overview');
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPlan, setShowPlan] = useState(false);

  const { data, isLoading, error, refetch } = useApiQuery<OrgDetail>(['owner', 'org', id], `/owner/organizations/${id}`);

  const suspend = useApiMutation<void>(`/owner/organizations/${id}/suspend`, {
    invalidate: ['owner'], onSuccess: () => toast.success('Academy suspended'),
  });
  const activate = useApiMutation<void>(`/owner/organizations/${id}/activate`, {
    invalidate: ['owner'], onSuccess: () => toast.success('Academy activated'),
  });
  const resetPassword = useApiMutation<{ userId: string }, { password?: string }>(
    (b) => `/owner/users/${b.userId}/reset-password`,
    { onSuccess: (r) => toast.success('Password reset', r.password ? `New password: ${r.password}` : 'Done.') },
  );

  if (isLoading) return <div className="space-y-5"><Skeleton className="h-9 w-64" /><Skeleton className="h-64" /></div>;
  if (error || !data) {
    return <ErrorState title={error?.isNotFound ? 'Academy not found' : 'Could not load this academy'} description={error?.message} onRetry={error?.isNotFound ? undefined : () => refetch()} />;
  }

  const org = data.organization;
  const sub = data.subscription;
  const isSuspended = org.status === 'SUSPENDED';

  const toggle = async () => {
    const ok = await confirm({
      title: isSuspended ? `Activate ${org.name}?` : `Suspend ${org.name}?`,
      description: isSuspended ? 'Their users will be able to sign in again.' : 'Everyone at this academy will be blocked from signing in. Data is preserved.',
      confirmLabel: isSuspended ? 'Activate' : 'Suspend',
      danger: !isSuspended,
    });
    if (ok) (isSuspended ? activate : suspend).mutate();
  };

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/owner/organizations')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 transition hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back to academies
      </button>

      <PageHeader
        title={org.name}
        description={`${org.code} · ${org.email ?? 'no email'} · joined ${org.createdAt ? formatDate(org.createdAt, 'DD MMM YYYY') : '—'}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowPlan(true)} icon={<CreditCard className="h-4 w-4" />}>Change plan</Button>
            <Button variant="outline" size="sm" onClick={() => setShowAdmin(true)} icon={<UserPlus className="h-4 w-4" />}>Add admin</Button>
            <Button
              variant={isSuspended ? 'primary' : 'danger'} size="sm"
              loading={suspend.isPending || activate.isPending}
              onClick={toggle}
              icon={isSuspended ? <PlayCircle className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            >
              {isSuspended ? 'Activate' : 'Suspend'}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={org.status} />
        <Badge tone="brand">{titleCase(sub?.plan ?? 'STARTER')}</Badge>
        <Badge tone={sub?.status === 'ACTIVE' ? 'ACTIVE' : 'PENDING'}>{titleCase(sub?.status ?? '')}</Badge>
        {sub?.status === 'TRIALING' && sub.trialEndsAt && (
          <Badge tone="PENDING">Trial ends {formatDate(sub.trialEndsAt, 'DD MMM YYYY')}</Badge>
        )}
      </div>

      <Tabs
        tabs={[{ id: 'overview', label: 'Overview' }, { id: 'usage', label: 'Plan & usage' }, { id: 'admins', label: 'Administrators' }, { id: 'activity', label: 'Activity' }]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Students" value={data.stats.students} hint={`${data.stats.activeStudents} active`} icon={<GraduationCap className="h-[18px] w-[18px]" />} />
            <StatCard label="Staff" value={data.stats.staff} hint={`${data.stats.teachers} teachers`} icon={<Users className="h-[18px] w-[18px]" />} tone="sky" />
            <StatCard label="Courses" value={data.stats.courses} hint={`${data.stats.batches} batches`} icon={<BookOpen className="h-[18px] w-[18px]" />} tone="violet" />
            <StatCard label="Fees collected" value={formatCurrency(data.stats.revenue, { compact: true })} hint={`${data.stats.leads} leads`} icon={<Wallet className="h-[18px] w-[18px]" />} tone="emerald" />
          </div>

          <Card>
            <CardHeader title="Academy details" />
            <dl className="grid grid-cols-1 gap-px bg-ink-100 sm:grid-cols-2">
              <Info label="Slug" value={org.slug} />
              <Info label="Code" value={org.code} />
              <Info label="Email" value={org.email} />
              <Info label="Phone" value={org.phone} />
              <Info label="Website" value={org.website} />
              <Info label="City" value={org.address?.city} />
              <Info label="State" value={org.address?.state} />
              <Info label="Currency" value={`${org.settings?.currencySymbol ?? '₹'} ${org.settings?.currency ?? 'INR'}`} />
              <Info label="Attendance threshold" value={`${org.settings?.attendanceThreshold ?? 75}%`} />
              <Info label="Timezone" value={org.settings?.timezone} />
            </dl>
          </Card>
        </div>
      )}

      {tab === 'usage' && (
        <div className="space-y-5">
          <Card>
            <CardHeader title="Subscription" subtitle={`${formatCurrency(sub?.amount)} per ${(sub?.billingCycle ?? 'MONTHLY').toLowerCase()}`} />
            <dl className="grid grid-cols-1 gap-px bg-ink-100 sm:grid-cols-2">
              <Info label="Plan" value={titleCase(sub?.plan ?? '')} />
              <Info label="Status" value={<StatusBadge status={sub?.status ?? ''} />} />
              <Info label="Period start" value={sub?.currentPeriodStart ? formatDate(sub.currentPeriodStart, 'DD MMM YYYY') : '—'} />
              <Info label="Period end" value={sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd, 'DD MMM YYYY') : '—'} />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Usage against plan limits" subtitle="Enforced on the server for every create operation" />
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              {Object.keys(sub?.limits ?? {}).map((k) => {
                const used = data.usage?.[k] ?? sub.usage?.[k] ?? 0;
                const max = sub.limits[k] ?? 0;
                const isBytes = /bytes|storage/i.test(k);
                const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
                return (
                  <div key={k} className="rounded-xl border border-ink-200 p-3.5">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[13px] font-medium text-ink-800">{titleCase(k.replace(/Bytes$/, ' storage'))}</p>
                      <p className="text-[13px] font-semibold text-ink-900">
                        {isBytes ? formatBytes(used) : used}
                        <span className="font-normal text-ink-400"> / {isBytes ? formatBytes(max) : max}</span>
                      </p>
                    </div>
                    <ProgressBar value={pct} tone={pct >= 90 ? 'rose' : pct >= 70 ? 'amber' : 'brand'} />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {tab === 'admins' && (
        <Card>
          <CardHeader
            title="Administrators"
            subtitle={`${data.admins.length} admin account(s)`}
            action={<Button variant="outline" size="sm" onClick={() => setShowAdmin(true)} icon={<UserPlus className="h-4 w-4" />}>Add admin</Button>}
          />
          {data.admins.length === 0 ? (
            <EmptyState icon={<Users className="h-6 w-6" />} title="No administrators" description="This academy cannot be managed until an admin exists." />
          ) : (
            <div className="divide-y divide-ink-100">
              {data.admins.map((a) => (
                <div key={a._id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={a.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{a.name}</p>
                    <p className="truncate text-xs text-ink-500">{a.email}</p>
                  </div>
                  <Badge tone={a.isActive ? 'ACTIVE' : 'INACTIVE'}>{a.isActive ? 'Active' : 'Disabled'}</Badge>
                  <Button
                    variant="ghost" size="icon" title="Reset password"
                    loading={resetPassword.isPending && resetPassword.variables?.userId === a._id}
                    onClick={() => resetPassword.mutate({ userId: a._id })}
                  >
                    <KeyRound className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'activity' && (
        <Card>
          <CardHeader title="Recent activity" subtitle="Audit trail for this academy" />
          {data.recentActivity.length === 0 ? (
            <EmptyState icon={<Activity className="h-6 w-6" />} title="No activity recorded" />
          ) : (
            <div className="divide-y divide-ink-100">
              {data.recentActivity.map((a) => (
                <div key={a._id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{a.action}</p>
                    <p className="truncate text-xs text-ink-500">{a.userName ?? 'System'}{a.entity ? ` · ${a.entity}` : ''}</p>
                  </div>
                  <Badge tone={a.status === 'SUCCESS' ? 'ACTIVE' : 'CANCELLED'}>{a.status}</Badge>
                  <span className="shrink-0 text-[11px] text-ink-400">{fromNow(a.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {showAdmin && <AddAdminModal orgId={id!} onClose={() => setShowAdmin(false)} />}
      {showPlan && <ChangePlanModal orgId={id!} current={sub?.plan ?? 'STARTER'} onClose={() => setShowPlan(false)} />}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="bg-white px-5 py-3">
      <dt className="text-xs font-medium text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium text-ink-900">{value || <span className="text-ink-300">—</span>}</dd>
    </div>
  );
}

function AddAdminModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const toast = useToast();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<{ name: string; email: string; phone: string; password: string }>();

  const create = useApiMutation<Record<string, unknown>, { password?: string }>(`/owner/organizations/${orgId}/admins`, {
    invalidate: ['owner'],
    silentError: true,
    onSuccess: (res) => {
      toast.success('Administrator created', res.password ? `Temporary password: ${res.password}` : 'They can now sign in at /admin/login.');
      onClose();
    },
  });

  return (
    <Modal
      open onClose={onClose} title="Add an administrator"
      description="They will be able to sign in at /admin/login for this academy."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={create.isPending} onClick={handleSubmit((v) => create.mutate({ ...v, password: v.password || undefined, phone: v.phone || undefined }, { onError: (e) => applyFieldErrors(e, setError as never) }))}>
            Create admin
          </Button>
        </>
      }
    >
      {create.error && !Object.keys(create.error.fields ?? {}).length && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{create.error.message}</div>
      )}
      <div className="space-y-4">
        <Field label="Full name" error={errors.name?.message} required>
          <Input placeholder="e.g. Aditya Joshi" invalid={!!errors.name} {...register('name', { required: 'Enter their name' })} />
        </Field>
        <Field label="Email" error={errors.email?.message} required>
          <Input type="email" placeholder="admin@academy.com" invalid={!!errors.email} {...register('email', { required: 'Enter an email' })} />
        </Field>
        <Field label="Phone"><Input placeholder="9876543210" {...register('phone')} /></Field>
        <Field label="Temporary password" hint="Leave blank to auto-generate one">
          <Input placeholder="Auto-generate" {...register('password', { minLength: { value: 8, message: 'Use at least 8 characters' } })} />
        </Field>
      </div>
    </Modal>
  );
}

function ChangePlanModal({ orgId, current, onClose }: { orgId: string; current: string; onClose: () => void }) {
  const [plan, setPlan] = useState(current);
  const [status, setStatus] = useState('ACTIVE');

  const update = useApiMutation<Record<string, unknown>>(`/owner/organizations/${orgId}/subscription`, {
    method: 'patch',
    invalidate: ['owner'],
    successMessage: 'Subscription updated',
    silentError: true,
    onSuccess: onClose,
  });

  return (
    <Modal
      open onClose={onClose} title="Change subscription"
      description="Plan limits take effect immediately on the server."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={update.isPending} onClick={() => update.mutate({ plan, status })}>Update plan</Button>
        </>
      }
    >
      {update.error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{update.error.message}</div>
      )}
      <div className="space-y-4">
        <Field label="Plan">
          <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
            {['STARTER', 'GROWTH', 'PRO'].map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELLED'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </Select>
        </Field>
        <div className="rounded-xl bg-ink-50 px-3.5 py-3 text-[13px] text-ink-600">
          STARTER 100 students · GROWTH 500 · PRO 5000. Downgrading does not delete data, but blocks new records
          beyond the limit.
        </div>
      </div>
    </Modal>
  );
}

export const OrgIcons = { Building2, Layers };
