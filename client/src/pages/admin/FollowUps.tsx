import { CheckCircle2, CalendarClock } from 'lucide-react';
import { ResourcePage, clean } from '@/components/ResourcePage';
import { Field, Input, Select, Textarea, Badge, StatusBadge, Avatar, Button, useToast } from '@/components/ui';
import { Column } from '@/components/DataTable';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { formatDate, titleCase, labelOf } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import type { FollowUp, Lead } from '@/types';

const MODES = ['CALL', 'VISIT', 'EMAIL', 'WHATSAPP', 'SMS', 'DEMO'];
const STATUSES = ['PENDING', 'COMPLETED', 'RESCHEDULED', 'CANCELLED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

interface FollowUpForm {
  leadId: string; mode: string; scheduledAt: string; scheduledTime: string;
  priority: string; status: string; notes: string; outcome: string;
}

export function FollowUpsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const { data: leads } = useApiQuery<{ items: Lead[] }>(['leads', 'options'], '/crm/leads', { limit: 100 });

  const complete = useApiMutation<{ id: string }>((b) => `/crm/follow-ups/${b.id}`, {
    method: 'patch',
    invalidate: ['follow-ups', 'dashboard', 'leads'],
    onSuccess: () => toast.success('Marked as completed'),
  });

  const columns: Column<FollowUp>[] = [
    {
      key: 'lead',
      header: 'Lead',
      render: (f) => {
        const l = typeof f.leadId === 'object' ? f.leadId : null;
        return (
          <div className="flex items-center gap-2.5">
            <Avatar name={l?.name} size="xs" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink-900">{l?.name ?? 'Lead'}</p>
              <p className="truncate text-xs text-ink-500">{l?.phone ?? ''}</p>
            </div>
          </div>
        );
      },
    },
    { key: 'mode', header: 'Mode', render: (f) => <Badge>{titleCase(f.mode)}</Badge> },
    {
      key: 'when',
      header: 'Scheduled',
      render: (f) => {
        const overdue = f.status === 'PENDING' && new Date(f.scheduledAt) < new Date(new Date().toDateString());
        return (
          <div className="min-w-0">
            <p className={`text-[13px] ${overdue ? 'font-semibold text-rose-600' : 'text-ink-800'}`}>
              {formatDate(f.scheduledAt, 'DD MMM YYYY')}
            </p>
            <p className="text-xs text-ink-500">{f.scheduledTime || 'Any time'}{overdue ? ' · overdue' : ''}</p>
          </div>
        );
      },
    },
    {
      key: 'assigned',
      header: 'Assigned to',
      hideBelow: 'lg',
      render: (f) => <span className="text-[13px]">{labelOf(f.assignedTo, 'name', 'Unassigned')}</span>,
    },
    { key: 'priority', header: 'Priority', hideBelow: 'md', render: (f) => <Badge tone={f.priority}>{titleCase(f.priority)}</Badge> },
    { key: 'status', header: 'Status', render: (f) => <StatusBadge status={f.status} /> },
    {
      key: 'done',
      header: '',
      className: 'w-px',
      render: (f) =>
        can('followup:update') && f.status === 'PENDING' ? (
          <div onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              title="Mark completed"
              loading={complete.isPending && complete.variables?.id === f._id}
              onClick={() => complete.mutate({ id: f._id, status: 'COMPLETED' } as never)}
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <ResourcePage<FollowUp, FollowUpForm>
      resource="follow-ups"
      endpoint="/crm/follow-ups"
      title="Follow-ups"
      describe={(n) => `${n} follow-up${n === 1 ? '' : 's'} scheduled`}
      permission="followup"
      columns={columns}
      searchPlaceholder="Search by lead name or phone…"
      emptyDescription="Schedule calls and visits so no enquiry goes cold."
      invalidate={['leads', 'dashboard']}
      filters={[
        { key: 'status', label: 'All statuses', options: STATUSES.map((s) => ({ value: s, label: titleCase(s) })) },
        { key: 'mode', label: 'All modes', options: MODES.map((s) => ({ value: s, label: titleCase(s) })) },
        { key: 'priority', label: 'All priorities', options: PRIORITIES.map((s) => ({ value: s, label: titleCase(s) })) },
        { key: 'due', label: 'Any date', options: [
          { value: 'today', label: 'Due today' },
          { value: 'overdue', label: 'Overdue' },
          { value: 'upcoming', label: 'Upcoming' },
        ] },
      ]}
      defaultValues={(row) => ({
        leadId: typeof row?.leadId === 'object' ? row.leadId._id : (row?.leadId as string) ?? '',
        mode: row?.mode ?? 'CALL',
        scheduledAt: row?.scheduledAt ? String(row.scheduledAt).slice(0, 10) : new Date().toISOString().slice(0, 10),
        scheduledTime: row?.scheduledTime ?? '',
        priority: row?.priority ?? 'MEDIUM',
        status: row?.status ?? 'PENDING',
        notes: row?.notes ?? '',
        outcome: row?.outcome ?? '',
      })}
      toPayload={(v) => clean(v)}
      deleteConfirm={() => ({ title: 'Delete this follow-up?', description: 'The reminder will be removed from the schedule.' })}
      renderForm={({ register, formState: { errors } }, row) => (
        <>
          <Field label="Lead" error={errors.leadId?.message} required className="sm:col-span-2">
            <Select invalid={!!errors.leadId} {...register('leadId', { required: 'Select a lead' })}>
              <option value="">Select a lead…</option>
              {(leads?.items ?? []).map((l) => (
                <option key={l._id} value={l._id}>{l.name} — {l.phone}</option>
              ))}
            </Select>
          </Field>
          <Field label="Mode" required>
            <Select {...register('mode')}>
              {MODES.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
            </Select>
          </Field>
          <Field label="Priority">
            <Select {...register('priority')}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
            </Select>
          </Field>
          <Field label="Date" error={errors.scheduledAt?.message} required>
            <Input type="date" invalid={!!errors.scheduledAt} {...register('scheduledAt', { required: 'Pick a date' })} />
          </Field>
          <Field label="Time">
            <Input type="time" {...register('scheduledTime')} />
          </Field>
          {row && (
            <>
              <Field label="Status" className="sm:col-span-2">
                <Select {...register('status')}>
                  {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </Select>
              </Field>
              <Field label="Outcome" className="sm:col-span-2" hint="What was the result of this follow-up?">
                <Textarea placeholder="e.g. Parent asked to call back next week" {...register('outcome')} />
              </Field>
            </>
          )}
          <Field label="Notes" className="sm:col-span-2">
            <Textarea placeholder="What should be discussed?" {...register('notes')} />
          </Field>
        </>
      )}
    />
  );
}

export const FollowUpIcon = CalendarClock;
