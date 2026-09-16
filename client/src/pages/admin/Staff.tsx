import { useState } from 'react';
import { KeyRound, Power, ShieldCheck } from 'lucide-react';
import { ResourcePage, clean } from '@/components/ResourcePage';
import { Field, Input, Select, Badge, Avatar, Button, useToast, useConfirm } from '@/components/ui';
import { Column } from '@/components/DataTable';
import { useApiMutation } from '@/hooks/useApi';
import { titleCase, formatDate } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import type { User } from '@/types';

interface StaffForm {
  name: string; email: string; phone: string; role: string; password: string;
}

/** Roles an organization admin may create. Owner/teacher/student/parent are managed elsewhere. */
const STAFF_ROLES = ['ORGANIZATION_ADMIN', 'COUNSELOR', 'ACCOUNTANT', 'STAFF'];

export function StaffPage() {
  const { can, user: me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleActive = useApiMutation<{ id: string }>((b) => `/people/users/${b.id}/toggle-active`, {
    invalidate: ['staff'],
    onSuccess: () => toast.success('Access updated'),
  });

  const resetPassword = useApiMutation<{ id: string }, { password?: string }>(
    (b) => `/people/users/${b.id}/reset-password`,
    {
      invalidate: ['staff'],
      onSuccess: (res) =>
        toast.success('Password reset', res.password ? `Temporary password: ${res.password}` : 'A new password has been issued.'),
    },
  );

  const handleToggle = async (u: User) => {
    const ok = await confirm({
      title: u.isActive ? `Suspend ${u.name}?` : `Reactivate ${u.name}?`,
      description: u.isActive
        ? 'They will be signed out immediately and blocked from logging in.'
        : 'They will be able to sign in again with their existing password.',
      confirmLabel: u.isActive ? 'Suspend access' : 'Reactivate',
      danger: u.isActive,
    });
    if (!ok) return;
    setBusyId(u._id);
    toggleActive.mutate({ id: u._id }, { onSettled: () => setBusyId(null) });
  };

  const handleReset = async (u: User) => {
    const ok = await confirm({
      title: `Reset the password for ${u.name}?`,
      description: 'A new temporary password will be generated and shown to you once.',
      confirmLabel: 'Reset password',
    });
    if (!ok) return;
    setBusyId(u._id);
    resetPassword.mutate({ id: u._id }, { onSettled: () => setBusyId(null) });
  };

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Team member',
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">
              {u.name}
              {u._id === me?._id && <span className="ml-1.5 text-xs font-normal text-ink-400">(you)</span>}
            </p>
            <p className="truncate text-xs text-ink-500">{u.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (u) => <Badge tone="brand">{titleCase(u.role)}</Badge> },
    { key: 'phone', header: 'Phone', hideBelow: 'lg', render: (u) => <span className="text-[13px]">{u.phone ?? '—'}</span> },
    {
      key: 'lastLogin',
      header: 'Last login',
      hideBelow: 'xl',
      render: (u) => <span className="text-[13px] text-ink-500">{u.lastLoginAt ? formatDate(u.lastLoginAt, 'DD MMM YYYY') : 'Never'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => <Badge tone={u.isActive ? 'ACTIVE' : 'SUSPENDED'}>{u.isActive ? 'Active' : 'Suspended'}</Badge>,
    },
    {
      key: 'manage',
      header: '',
      className: 'w-px',
      render: (u) =>
        can('user:update') && u._id !== me?._id ? (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              title="Reset password"
              loading={busyId === u._id && resetPassword.isPending}
              onClick={() => handleReset(u)}
            >
              <KeyRound className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={u.isActive ? 'Suspend access' : 'Reactivate'}
              loading={busyId === u._id && toggleActive.isPending}
              onClick={() => handleToggle(u)}
            >
              <Power className={`h-4 w-4 ${u.isActive ? 'text-rose-500' : 'text-emerald-600'}`} />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <ResourcePage<User, StaffForm>
      resource="staff"
      endpoint="/people/users"
      title="Staff"
      describe={(n) => `${n} team member${n === 1 ? '' : 's'} with back-office access`}
      permission="user"
      columns={columns}
      hideRowActions
      searchPlaceholder="Search by name or email…"
      emptyDescription="Invite counselors, accountants and front-desk staff. Each role gets its own permissions."
      filters={[
        { key: 'role', label: 'All roles', options: STAFF_ROLES.map((r) => ({ value: r, label: titleCase(r) })) },
        { key: 'isActive', label: 'All statuses', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Suspended' }] },
      ]}
      formDescription="Their role decides what they can see and do. Permissions are enforced on the server."
      formSize="md"
      defaultValues={(row) => ({
        name: row?.name ?? '', email: row?.email ?? '', phone: row?.phone ?? '',
        role: row?.role ?? 'COUNSELOR', password: '',
      })}
      toPayload={(v, row) => {
        const p = clean(v);
        if (row) {
          delete p.password;
          delete p.email;
        }
        return p;
      }}
      renderForm={({ register, formState: { errors } }, row) => (
        <>
          <Field label="Full name" error={errors.name?.message} required className="sm:col-span-2">
            <Input placeholder="e.g. Priya Menon" invalid={!!errors.name} {...register('name', { required: 'Enter their name' })} />
          </Field>
          <Field label="Email" error={errors.email?.message} required={!row} hint={row ? 'Email cannot be changed after creation' : 'This is their login'}>
            <Input
              type="email"
              disabled={!!row}
              placeholder="person@academy.com"
              invalid={!!errors.email}
              {...register('email', { required: row ? false : 'Enter an email' })}
            />
          </Field>
          <Field label="Phone">
            <Input placeholder="9876543210" {...register('phone')} />
          </Field>
          <Field label="Role" required className="sm:col-span-2">
            <Select {...register('role')}>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>{titleCase(r)}</option>
              ))}
            </Select>
          </Field>
          {!row && (
            <Field
              label="Temporary password"
              error={errors.password?.message}
              className="sm:col-span-2"
              hint="Leave blank to auto-generate one"
            >
              <Input
                type="text"
                placeholder="Auto-generate"
                {...register('password', {
                  minLength: { value: 8, message: 'Use at least 8 characters' },
                })}
              />
            </Field>
          )}
          <div className="flex items-start gap-2 rounded-xl bg-sky-50 px-3.5 py-3 sm:col-span-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <p className="text-[13px] text-sky-800">
              Counselors see admissions and leads. Accountants see finance. Staff get read-only front-desk access.
              Only organization admins can manage the team.
            </p>
          </div>
        </>
      )}
    />
  );
}
