import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Plus, Building2, Ban, PlayCircle, UserPlus } from 'lucide-react';
import { useListQuery, useApiMutation, applyFieldErrors } from '@/hooks/useApi';
import { DataTable, Column } from '@/components/DataTable';
import {
  PageHeader, Button, Modal, Field, Input, Select, Avatar, StatusBadge, Badge, useToast, useConfirm,
} from '@/components/ui';
import { formatDate, titleCase } from '@/lib/utils';
import type { Organization } from '@/types';

const PLANS = ['STARTER', 'GROWTH', 'PRO'];

interface OrgForm {
  name: string; code: string; email: string; phone: string; website: string;
  plan: string; trialDays: number | string;
  address: { line1: string; city: string; state: string };
  adminName: string; adminEmail: string; adminPassword: string;
}

export function OwnerOrganizations() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);

  const list = useListQuery<Organization>('owner-orgs', '/owner/organizations');

  const suspend = useApiMutation<{ id: string }>((b) => `/owner/organizations/${b.id}/suspend`, {
    invalidate: ['owner-orgs', 'owner'],
    onSuccess: () => toast.success('Academy suspended', 'Their users can no longer sign in.'),
  });
  const activate = useApiMutation<{ id: string }>((b) => `/owner/organizations/${b.id}/activate`, {
    invalidate: ['owner-orgs', 'owner'],
    onSuccess: () => toast.success('Academy activated'),
  });

  const toggle = async (o: Organization) => {
    const isSuspended = o.status === 'SUSPENDED';
    const ok = await confirm({
      title: isSuspended ? `Activate ${o.name}?` : `Suspend ${o.name}?`,
      description: isSuspended
        ? 'Their staff and students will be able to sign in again.'
        : 'Everyone at this academy will be signed out and blocked from logging in. Their data is preserved.',
      confirmLabel: isSuspended ? 'Activate' : 'Suspend academy',
      danger: !isSuspended,
    });
    if (!ok) return;
    (isSuspended ? activate : suspend).mutate({ id: o._id });
  };

  const columns: Column<Organization>[] = [
    {
      key: 'name',
      header: 'Academy',
      render: (o) => (
        <div className="flex items-center gap-3">
          <Avatar name={o.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{o.name}</p>
            <p className="truncate text-xs text-ink-500">{o.code} · {o.slug}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      hideBelow: 'md',
      render: (o) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] text-ink-700">{o.email ?? '—'}</p>
          <p className="truncate text-xs text-ink-400">{o.phone ?? '—'}</p>
        </div>
      ),
    },
    { key: 'city', header: 'City', hideBelow: 'xl', render: (o) => <span className="text-[13px]">{o.address?.city ?? '—'}</span> },
    { key: 'created', header: 'Joined', hideBelow: 'lg', render: (o) => <span className="text-[13px] text-ink-500">{o.createdAt ? formatDate(o.createdAt, 'DD MMM YYYY') : '—'}</span> },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
    {
      key: 'actions',
      header: '',
      className: 'w-px',
      render: (o) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost" size="icon"
            title={o.status === 'SUSPENDED' ? 'Activate' : 'Suspend'}
            loading={(suspend.isPending || activate.isPending) && (suspend.variables?.id === o._id || activate.variables?.id === o._id)}
            onClick={() => toggle(o)}
          >
            {o.status === 'SUSPENDED'
              ? <PlayCircle className="h-4 w-4 text-emerald-600" />
              : <Ban className="h-4 w-4 text-rose-500" />}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Academies"
        description={`${list.total} academy(ies) on the platform`}
        actions={<Button size="sm" onClick={() => setShowForm(true)} icon={<Plus className="h-4 w-4" />}>New academy</Button>}
      />

      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(o) => o._id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search academies…"
        filters={[
          { key: 'status', label: 'All statuses', options: ['ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED'].map((s) => ({ value: s, label: titleCase(s) })) },
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
        onRowClick={(o) => navigate(`/owner/organizations/${o._id}`)}
        emptyTitle="No academies yet"
        emptyDescription="Onboard your first coaching institute onto the platform."
        emptyAction={<Button size="sm" onClick={() => setShowForm(true)} icon={<Building2 className="h-4 w-4" />}>Create an academy</Button>}
      />

      {showForm && <CreateOrgModal onClose={() => setShowForm(false)} onCreated={(id) => navigate(`/owner/organizations/${id}`)} />}
    </div>
  );
}

/**
 * Creates the academy and its first administrator in one flow — the owner never
 * has to type an organizationId, it is derived from the created document.
 */
function CreateOrgModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<OrgForm>({
    defaultValues: { plan: 'STARTER', trialDays: 14 },
  });

  const createAdmin = useApiMutation<{ orgId: string; name: string; email: string; password?: string }, { password?: string }>(
    (b) => `/owner/organizations/${b.orgId}/admins`,
    { silentError: true },
  );

  const createOrg = useApiMutation<Record<string, unknown>, { organization: Organization }>('/owner/organizations', {
    invalidate: ['owner-orgs', 'owner'],
    silentError: true,
  });

  const onSubmit = handleSubmit((v) => {
    createOrg.mutate(
      {
        name: v.name,
        code: v.code || undefined,
        email: v.email,
        phone: v.phone || undefined,
        website: v.website || undefined,
        plan: v.plan,
        trialDays: Number(v.trialDays),
        address: v.address?.city || v.address?.line1 ? v.address : undefined,
      },
      {
        onError: (e) => applyFieldErrors(e, setError as never),
        onSuccess: (res) => {
          const orgId = res.organization?._id;
          if (!orgId) {
            toast.error('Unexpected response', 'The academy was created but no id was returned.');
            return;
          }
          if (!v.adminName || !v.adminEmail) {
            toast.success('Academy created', 'Add an administrator from the academy page.');
            onCreated(orgId);
            onClose();
            return;
          }
          createAdmin.mutate(
            { orgId, name: v.adminName, email: v.adminEmail, password: v.adminPassword || undefined },
            {
              onSuccess: (adminRes) => {
                toast.success(
                  'Academy and admin created',
                  adminRes.password ? `Admin password: ${adminRes.password}` : 'The administrator can now sign in.',
                );
                onCreated(orgId);
                onClose();
              },
              onError: (e) => {
                toast.error('Academy created, but the admin failed', e.message);
                onCreated(orgId);
                onClose();
              },
            },
          );
        },
      },
    );
  });

  const pending = createOrg.isPending || createAdmin.isPending;

  return (
    <Modal
      open onClose={onClose}
      title="Create an academy"
      description="Sets up the tenant, its subscription and its first administrator."
      size="lg"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={pending} onClick={onSubmit}>Create academy</Button>
        </>
      }
    >
      {createOrg.error && !Object.keys(createOrg.error.fields ?? {}).length && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{createOrg.error.message}</div>
      )}
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Academy name" error={errors.name?.message} required className="sm:col-span-2">
          <Input placeholder="e.g. Brilliant Academy" invalid={!!errors.name} {...register('name', { required: 'Enter the academy name' })} />
        </Field>
        <Field label="Code" error={errors.code?.message} hint="Letters and numbers, auto-generated if blank">
          <Input placeholder="BRIL" {...register('code')} />
        </Field>
        <Field label="Contact email" error={errors.email?.message} required>
          <Input type="email" placeholder="info@academy.com" invalid={!!errors.email} {...register('email', { required: 'Enter a contact email' })} />
        </Field>
        <Field label="Phone"><Input placeholder="9876543210" {...register('phone')} /></Field>
        <Field label="Website"><Input placeholder="https://…" {...register('website')} /></Field>
        <Field label="Plan">
          <Select {...register('plan')}>
            {PLANS.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
          </Select>
        </Field>
        <Field label="Trial days" hint="0 for no trial">
          <Input type="number" min={0} max={120} {...register('trialDays')} />
        </Field>
        <Field label="City"><Input placeholder="e.g. Shimla" {...register('address.city')} /></Field>
        <Field label="State"><Input placeholder="e.g. Himachal Pradesh" {...register('address.state')} /></Field>

        <div className="sm:col-span-2">
          <div className="mb-3 mt-1 flex items-center gap-2 border-t border-ink-200 pt-4">
            <UserPlus className="h-4 w-4 text-ink-400" />
            <p className="text-[13px] font-semibold text-ink-700">First administrator (optional)</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Admin name"><Input placeholder="e.g. Aditya Joshi" {...register('adminName')} /></Field>
            <Field label="Admin email"><Input type="email" placeholder="admin@academy.com" {...register('adminEmail')} /></Field>
            <Field label="Temporary password" className="sm:col-span-2" hint="Leave blank to auto-generate one">
              <Input placeholder="Auto-generate" {...register('adminPassword')} />
            </Field>
          </div>
        </div>

        <div className="rounded-xl bg-sky-50 px-3.5 py-3 sm:col-span-2">
          <p className="text-[13px] text-sky-800">
            The academy is fully isolated: its data is scoped to a new tenant id that is derived on the server,
            never sent by the browser. <Badge className="ml-1 align-middle">Multi-tenant safe</Badge>
          </p>
        </div>
      </form>
    </Modal>
  );
}
