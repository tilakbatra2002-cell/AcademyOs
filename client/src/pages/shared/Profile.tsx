import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { User, Lock, Save, ShieldCheck } from 'lucide-react';
import { useApiMutation, applyFieldErrors } from '@/hooks/useApi';
import {
  PageHeader, Card, CardHeader, Button, Field, Input, Avatar, Badge, useToast,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { titleCase, formatDate } from '@/lib/utils';

interface ProfileForm { name: string; phone: string }
interface PasswordForm { currentPassword: string; newPassword: string; confirmPassword: string }

export function ProfilePage() {
  const { user, organization, refresh } = useAuth();
  const toast = useToast();

  const profile = useForm<ProfileForm>({ defaultValues: { name: user?.name ?? '', phone: user?.phone ?? '' } });
  const password = useForm<PasswordForm>();

  useEffect(() => {
    profile.reset({ name: user?.name ?? '', phone: user?.phone ?? '' });
  }, [user, profile]);

  const saveProfile = useApiMutation<ProfileForm>('/auth/profile', {
    method: 'patch',
    silentError: true,
    onSuccess: async () => {
      toast.success('Profile updated');
      await refresh();
    },
  });

  const changePassword = useApiMutation<{ currentPassword: string; newPassword: string }>('/auth/change-password', {
    silentError: true,
    onSuccess: () => {
      toast.success('Password changed', 'Use your new password the next time you sign in.');
      password.reset();
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader title="My profile" description="Your account details and password." />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="flex flex-col items-center px-5 py-6 text-center">
            <Avatar name={user?.name} size="xl" />
            <h3 className="mt-3 font-display text-lg font-bold text-ink-900">{user?.name}</h3>
            <p className="break-all text-[13px] text-ink-500">{user?.email}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              <Badge tone="brand">{titleCase(user?.role ?? '')}</Badge>
              {user?.isActive && <Badge tone="ACTIVE">Active</Badge>}
            </div>
          </div>
          <dl className="divide-y divide-ink-100 border-t border-ink-200/70">
            {organization && (
              <div className="flex items-center justify-between px-5 py-2.5">
                <dt className="text-[13px] text-ink-500">Academy</dt>
                <dd className="text-[13px] font-medium text-ink-900">{organization.name}</dd>
              </div>
            )}
            {user?.lastLoginAt && (
              <div className="flex items-center justify-between px-5 py-2.5">
                <dt className="text-[13px] text-ink-500">Last login</dt>
                <dd className="text-[13px] font-medium text-ink-900">{formatDate(user.lastLoginAt, 'DD MMM YYYY')}</dd>
              </div>
            )}
          </dl>
        </Card>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Personal details" subtitle="Your name as it appears across the app" />
            <form
              onSubmit={profile.handleSubmit((v) =>
                saveProfile.mutate(v, { onError: (e) => applyFieldErrors(e, profile.setError as never) }),
              )}
            >
              {saveProfile.error && (
                <div className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                  {saveProfile.error.message}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                <Field label="Full name" error={profile.formState.errors.name?.message} required>
                  <Input icon={<User className="h-4 w-4" />} {...profile.register('name', { required: 'Enter your name' })} />
                </Field>
                <Field label="Phone">
                  <Input {...profile.register('phone')} />
                </Field>
                <Field label="Email" className="sm:col-span-2" hint="Contact an administrator to change your email">
                  <Input value={user?.email ?? ''} disabled />
                </Field>
              </div>
              <div className="flex justify-end border-t border-ink-200/70 px-5 py-3">
                <Button type="submit" size="sm" loading={saveProfile.isPending} icon={<Save className="h-4 w-4" />}>
                  Save changes
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader title="Change password" subtitle="Use at least 8 characters" />
            <form
              onSubmit={password.handleSubmit((v) => {
                if (v.newPassword !== v.confirmPassword) {
                  password.setError('confirmPassword', { type: 'manual', message: 'Passwords do not match' });
                  return;
                }
                changePassword.mutate(
                  { currentPassword: v.currentPassword, newPassword: v.newPassword },
                  { onError: (e) => applyFieldErrors(e, password.setError as never) },
                );
              })}
            >
              {changePassword.error && (
                <div className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                  {changePassword.error.message}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                <Field label="Current password" error={password.formState.errors.currentPassword?.message} required className="sm:col-span-2">
                  <Input type="password" icon={<Lock className="h-4 w-4" />} autoComplete="current-password" {...password.register('currentPassword', { required: 'Enter your current password' })} />
                </Field>
                <Field label="New password" error={password.formState.errors.newPassword?.message} required>
                  <Input type="password" autoComplete="new-password" {...password.register('newPassword', { required: 'Enter a new password', minLength: { value: 8, message: 'Use at least 8 characters' } })} />
                </Field>
                <Field label="Confirm new password" error={password.formState.errors.confirmPassword?.message} required>
                  <Input type="password" autoComplete="new-password" {...password.register('confirmPassword', { required: 'Confirm your new password' })} />
                </Field>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-ink-200/70 px-5 py-3">
                <p className="flex items-center gap-1.5 text-xs text-ink-500">
                  <ShieldCheck className="h-3.5 w-3.5" /> You stay signed in on this device.
                </p>
                <Button type="submit" size="sm" loading={changePassword.isPending} icon={<Lock className="h-4 w-4" />}>
                  Change password
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
