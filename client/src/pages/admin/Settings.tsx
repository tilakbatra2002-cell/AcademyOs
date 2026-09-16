import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Palette, Building2, SlidersHorizontal, CreditCard, Save, Check } from 'lucide-react';
import { useApiQuery, useApiMutation, applyFieldErrors } from '@/hooks/useApi';
import {
  PageHeader, Card, CardHeader, Button, Field, Input, Textarea, Tabs, Badge,
  Skeleton, ErrorState, useToast, ProgressBar,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatBytes, formatDate, titleCase } from '@/lib/utils';
import type { Organization } from '@/types';

interface SettingsForm {
  name: string; email: string; phone: string; website: string;
  address: { line1: string; city: string; state: string; postalCode: string };
  branding: { primaryColor: string; accentColor: string; tagline: string };
  settings: {
    attendanceThreshold: number | string; currencySymbol: string; currency: string;
    studentIdPrefix: string; invoicePrefix: string; receiptPrefix: string;
    timezone: string; academicYearStartMonth: number | string;
  };
}

export function SettingsPage() {
  const [tab, setTab] = useState('profile');
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Your academy profile, branding and operational defaults." />
      <Tabs
        tabs={[
          { id: 'profile', label: 'Academy profile' },
          { id: 'branding', label: 'Branding' },
          { id: 'operations', label: 'Operations' },
          { id: 'subscription', label: 'Subscription' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'subscription' ? <SubscriptionPanel /> : <SettingsForm section={tab} />}
    </div>
  );
}

function SettingsForm({ section }: { section: string }) {
  const toast = useToast();
  const { can, refresh } = useAuth();
  const { data, isLoading, error, refetch } = useApiQuery<Organization>(['settings'], '/comm/settings');
  const readOnly = !can('org:settings:update');

  const { register, handleSubmit, reset, setError, watch, formState: { errors, isDirty } } = useForm<SettingsForm>();

  useEffect(() => {
    if (!data) return;
    reset({
      name: data.name ?? '', email: data.email ?? '', phone: data.phone ?? '', website: data.website ?? '',
      address: {
        line1: data.address?.line1 ?? '', city: data.address?.city ?? '',
        state: data.address?.state ?? '', postalCode: data.address?.postalCode ?? '',
      },
      branding: {
        primaryColor: data.branding?.primaryColor ?? '#4f46e5',
        accentColor: data.branding?.accentColor ?? '#0ea5e9',
        tagline: data.branding?.tagline ?? '',
      },
      settings: {
        attendanceThreshold: data.settings?.attendanceThreshold ?? 75,
        currencySymbol: data.settings?.currencySymbol ?? '₹',
        currency: data.settings?.currency ?? 'INR',
        studentIdPrefix: data.settings?.studentIdPrefix ?? 'STU',
        invoicePrefix: data.settings?.invoicePrefix ?? 'INV',
        receiptPrefix: data.settings?.receiptPrefix ?? 'RCP',
        timezone: data.settings?.timezone ?? 'Asia/Kolkata',
        academicYearStartMonth: data.settings?.academicYearStartMonth ?? 4,
      },
    });
  }, [data, reset]);

  const save = useApiMutation<Record<string, unknown>>('/comm/settings', {
    method: 'patch',
    invalidate: ['settings'],
    silentError: true,
    onSuccess: async () => {
      toast.success('Settings saved', 'Your changes are live.');
      await refresh();
    },
  });

  const onSubmit = handleSubmit((v) => {
    const payload: Record<string, unknown> =
      section === 'branding'
        ? { branding: v.branding }
        : section === 'operations'
          ? {
              settings: {
                ...v.settings,
                attendanceThreshold: Number(v.settings.attendanceThreshold),
                academicYearStartMonth: Number(v.settings.academicYearStartMonth),
              },
            }
          : { name: v.name, email: v.email, phone: v.phone, website: v.website, address: v.address };
    save.mutate(payload, { onError: (e) => applyFieldErrors(e, setError as never) });
  });

  const primary = watch('branding.primaryColor');
  const accent = watch('branding.accentColor');

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState title="Could not load settings" description={error.message} onRetry={() => refetch()} />;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {save.error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{save.error.message}</div>
      )}

      {section === 'profile' && (
        <Card>
          <CardHeader title="Academy profile" subtitle="Appears on invoices, receipts and the parent portal" />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Field label="Academy name" error={errors.name?.message} required className="sm:col-span-2">
              <Input disabled={readOnly} {...register('name', { required: 'Enter your academy name' })} />
            </Field>
            <Field label="Contact email">
              <Input type="email" disabled={readOnly} {...register('email')} />
            </Field>
            <Field label="Phone">
              <Input disabled={readOnly} {...register('phone')} />
            </Field>
            <Field label="Website" className="sm:col-span-2">
              <Input placeholder="https://…" disabled={readOnly} {...register('website')} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input disabled={readOnly} {...register('address.line1')} />
            </Field>
            <Field label="City"><Input disabled={readOnly} {...register('address.city')} /></Field>
            <Field label="State"><Input disabled={readOnly} {...register('address.state')} /></Field>
            <Field label="Postal code"><Input disabled={readOnly} {...register('address.postalCode')} /></Field>
            <div className="sm:col-span-2">
              <Field label="Organization code" hint="Used in admission numbers">
                <Input value={data?.code ?? ''} disabled />
              </Field>
            </div>
          </div>
        </Card>
      )}

      {section === 'branding' && (
        <Card>
          <CardHeader title="White-label branding" subtitle="Colours apply across every portal for your academy" />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Field label="Primary colour">
              <div className="flex gap-2">
                <input type="color" disabled={readOnly} className="h-10 w-14 cursor-pointer rounded-lg border border-ink-200" {...register('branding.primaryColor')} />
                <Input disabled={readOnly} {...register('branding.primaryColor')} />
              </div>
            </Field>
            <Field label="Accent colour">
              <div className="flex gap-2">
                <input type="color" disabled={readOnly} className="h-10 w-14 cursor-pointer rounded-lg border border-ink-200" {...register('branding.accentColor')} />
                <Input disabled={readOnly} {...register('branding.accentColor')} />
              </div>
            </Field>
            <Field label="Tagline" className="sm:col-span-2">
              <Textarea rows={2} placeholder="e.g. Shaping tomorrow's engineers" disabled={readOnly} {...register('branding.tagline')} />
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Preview</p>
              <div className="rounded-xl border border-ink-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: primary }}>Primary button</span>
                  <span className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: accent }}>Accent</span>
                  <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: `${primary}18`, color: primary }}>Badge</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {section === 'operations' && (
        <Card>
          <CardHeader title="Operational defaults" subtitle="Thresholds, currency and numbering" />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Field label="Attendance threshold (%)" hint="Students below this are flagged as low attendance">
              <Input type="number" min={0} max={100} disabled={readOnly} {...register('settings.attendanceThreshold')} />
            </Field>
            <Field label="Academic year starts" hint="Month number, e.g. 4 for April">
              <Input type="number" min={1} max={12} disabled={readOnly} {...register('settings.academicYearStartMonth')} />
            </Field>
            <Field label="Currency code">
              <Input disabled={readOnly} {...register('settings.currency')} />
            </Field>
            <Field label="Currency symbol">
              <Input disabled={readOnly} {...register('settings.currencySymbol')} />
            </Field>
            <Field label="Student ID prefix"><Input disabled={readOnly} {...register('settings.studentIdPrefix')} /></Field>
            <Field label="Timezone"><Input disabled={readOnly} {...register('settings.timezone')} /></Field>
            <Field label="Invoice prefix"><Input disabled={readOnly} {...register('settings.invoicePrefix')} /></Field>
            <Field label="Receipt prefix"><Input disabled={readOnly} {...register('settings.receiptPrefix')} /></Field>
          </div>
        </Card>
      )}

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending} disabled={!isDirty} icon={<Save className="h-4 w-4" />}>
            Save changes
          </Button>
        </div>
      )}
      {readOnly && (
        <p className="text-[13px] text-ink-500">You have read-only access to settings. Ask an organization admin to make changes.</p>
      )}
    </form>
  );
}

/* ------------------------------ Subscription ------------------------------- */

interface SubscriptionData {
  subscription?: {
    plan: string; status: string; trialEndsAt?: string; currentPeriodEnd?: string; startedAt?: string;
  };
  usage?: Record<string, number>;
  limits?: Record<string, number>;
}

function SubscriptionPanel() {
  const { data, isLoading, error, refetch } = useApiQuery<SubscriptionData>(['subscription'], '/comm/settings/subscription');
  const { organization, subscription: authSub } = useAuth();

  if (isLoading) return <Skeleton className="h-80 w-full" />;

  const sub = data?.subscription ?? authSub;
  const usage = data?.usage ?? {};
  const limits = data?.limits ?? {};
  const keys = Object.keys(limits).length ? Object.keys(limits) : Object.keys(usage);

  return (
    <div className="space-y-5">
      {error && <ErrorState title="Could not load usage" description={error.message} onRetry={() => refetch()} />}

      <Card>
        <CardHeader title="Your plan" subtitle={organization?.name} />
        <div className="flex flex-wrap items-center gap-4 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
            <CreditCard className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-xl font-bold text-ink-900">{titleCase(sub?.plan ?? 'STARTER')}</p>
              <Badge tone={sub?.status === 'ACTIVE' ? 'ACTIVE' : sub?.status === 'TRIALING' ? 'PENDING' : 'CANCELLED'}>
                {titleCase(sub?.status ?? 'ACTIVE')}
              </Badge>
            </div>
            <p className="mt-0.5 text-[13px] text-ink-500">
              {sub?.status === 'TRIALING' && sub?.trialEndsAt
                ? `Trial ends ${formatDate(sub.trialEndsAt, 'DD MMM YYYY')}`
                : sub?.currentPeriodEnd
                  ? `Renews ${formatDate(sub.currentPeriodEnd, 'DD MMM YYYY')}`
                  : 'Managed by the platform owner'}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Usage against your plan limits" subtitle="Limits are enforced by the server on every create" />
        {keys.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-ink-500">Usage data is not available.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            {keys.map((k) => {
              const used = usage[k] ?? 0;
              const max = limits[k] ?? 0;
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
        )}
      </Card>

      <Card>
        <CardHeader title="Need a bigger plan?" />
        <div className="flex items-start gap-2 p-5">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-[13px] text-ink-600">
            Plan changes are handled by the platform owner. Contact support and your limits will be raised
            immediately — no data migration is required.
          </p>
        </div>
      </Card>
    </div>
  );
}

export const SettingsIcons = { Palette, Building2, SlidersHorizontal };
