import { Pin, Megaphone } from 'lucide-react';
import { ResourcePage, clean } from '@/components/ResourcePage';
import { Field, Input, Select, Textarea, Badge, StatusBadge } from '@/components/ui';
import { Column } from '@/components/DataTable';
import { formatDate, titleCase } from '@/lib/utils';
import type { Announcement } from '@/types';

const AUDIENCES = ['ALL', 'STUDENTS', 'PARENTS', 'TEACHERS', 'STAFF'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

interface AnnouncementForm {
  title: string; body: string; audience: string; priority: string; status: string; isPinned: boolean;
}

export function AnnouncementsPage() {
  const columns: Column<Announcement>[] = [
    {
      key: 'title',
      header: 'Announcement',
      render: (a) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-medium text-ink-900">
            {a.isPinned && <Pin className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
            {a.title}
          </p>
          <p className="truncate text-xs text-ink-500">{a.body}</p>
        </div>
      ),
    },
    { key: 'audience', header: 'Audience', render: (a) => <Badge tone="brand">{titleCase(a.audience)}</Badge> },
    { key: 'priority', header: 'Priority', hideBelow: 'md', render: (a) => <Badge tone={a.priority}>{titleCase(a.priority)}</Badge> },
    {
      key: 'reads',
      header: 'Read by',
      hideBelow: 'xl',
      render: (a) => <span className="text-[13px] text-ink-600">{a.readCount ?? 0}</span>,
    },
    {
      key: 'published',
      header: 'Published',
      hideBelow: 'lg',
      render: (a) => <span className="text-[13px] text-ink-500">{a.publishedAt ? formatDate(a.publishedAt, 'DD MMM YYYY') : '—'}</span>,
    },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
  ];

  return (
    <ResourcePage<Announcement, AnnouncementForm>
      resource="announcements"
      endpoint="/comm/announcements"
      title="Announcements"
      describe={(n) => `${n} announcement${n === 1 ? '' : 's'} posted`}
      permission="announcement"
      columns={columns}
      searchPlaceholder="Search announcements…"
      emptyDescription="Publish notices to students, parents, teachers or everyone at once."
      invalidate={['notifications', 'dashboard']}
      filters={[
        { key: 'audience', label: 'All audiences', options: AUDIENCES.map((a) => ({ value: a, label: titleCase(a) })) },
        { key: 'status', label: 'All statuses', options: STATUSES.map((s) => ({ value: s, label: titleCase(s) })) },
        { key: 'priority', label: 'All priorities', options: PRIORITIES.map((p) => ({ value: p, label: titleCase(p) })) },
      ]}
      formSize="lg"
      formDescription="Published announcements appear immediately in the recipients' portals and notification bell."
      defaultValues={(row) => ({
        title: row?.title ?? '', body: row?.body ?? '',
        audience: row?.audience ?? 'ALL', priority: row?.priority ?? 'MEDIUM',
        status: row?.status ?? 'PUBLISHED', isPinned: row?.isPinned ?? false,
      })}
      toPayload={(v) => ({ ...clean(v), isPinned: !!v.isPinned })}
      deleteConfirm={(a) => ({ title: `Delete "${a.title}"?`, description: 'It will be removed from every portal.' })}
      renderForm={({ register, formState: { errors } }) => (
        <>
          <Field label="Title" error={errors.title?.message} required className="sm:col-span-2">
            <Input placeholder="e.g. Diwali holiday schedule" invalid={!!errors.title} {...register('title', { required: 'Enter a title' })} />
          </Field>
          <Field label="Message" error={errors.body?.message} required className="sm:col-span-2">
            <Textarea rows={6} placeholder="Write the announcement…" invalid={!!errors.body} {...register('body', { required: 'Write a message' })} />
          </Field>
          <Field label="Audience" required>
            <Select {...register('audience')}>
              {AUDIENCES.map((a) => <option key={a} value={a}>{titleCase(a)}</option>)}
            </Select>
          </Field>
          <Field label="Priority">
            <Select {...register('priority')}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select {...register('status')}>
              {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </Select>
          </Field>
          <label className="flex items-center gap-2.5 self-end pb-2">
            <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-[var(--brand-primary)]" {...register('isPinned')} />
            <span className="text-sm text-ink-700">Pin to the top</span>
          </label>
        </>
      )}
    />
  );
}

export const AnnouncementIcon = Megaphone;
