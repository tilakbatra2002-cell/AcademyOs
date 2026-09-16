import { ResourcePage, clean } from '@/components/ResourcePage';
import { Field, Input, Textarea, Badge, Avatar } from '@/components/ui';
import { Column } from '@/components/DataTable';
import { useApiQuery } from '@/hooks/useApi';
import { formatCurrency, formatDate, toInputDate } from '@/lib/utils';
import type { Teacher, Subject } from '@/types';

interface TeacherForm {
  name: string; email: string; phone: string; qualification: string; specialization: string;
  experienceYears: number | ''; joiningDate: string; salary: number | ''; bio: string; createLogin: boolean;
}

export function TeachersPage() {
  const { data: subjects } = useApiQuery<{ items: Subject[] }>(['subjects', 'options'], '/academics/subjects', { limit: 100 });

  const columns: Column<Teacher>[] = [
    {
      key: 'name',
      header: 'Teacher',
      render: (t) => (
        <div className="flex items-center gap-3">
          <Avatar name={t.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{t.name}</p>
            <p className="truncate text-xs text-ink-500">{t.employeeCode}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      hideBelow: 'md',
      render: (t) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] text-ink-700">{t.phone ?? '—'}</p>
          <p className="truncate text-xs text-ink-400">{t.email ?? '—'}</p>
        </div>
      ),
    },
    { key: 'spec', header: 'Specialization', hideBelow: 'lg', render: (t) => <span className="text-[13px]">{t.specialization ?? '—'}</span> },
    {
      key: 'exp',
      header: 'Experience',
      hideBelow: 'xl',
      render: (t) => <span className="text-[13px]">{t.experienceYears ? `${t.experienceYears} yr${t.experienceYears === 1 ? '' : 's'}` : '—'}</span>,
    },
    { key: 'joined', header: 'Joined', hideBelow: 'xl', render: (t) => <span className="text-[13px] text-ink-500">{formatDate(t.joiningDate)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (t) => <Badge tone={t.isActive ? 'ACTIVE' : 'INACTIVE'}>{t.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
  ];

  return (
    <ResourcePage<Teacher, TeacherForm>
      resource="teachers"
      endpoint="/people/teachers"
      title="Teachers"
      describe={(n) => `${n} teacher${n === 1 ? '' : 's'} on your faculty`}
      permission="teacher"
      columns={columns}
      searchPlaceholder="Search by name, code, phone or email…"
      exportPath="/reports/export/teachers"
      emptyDescription="Add your faculty so you can assign them to batches, classes and courses."
      invalidate={['batches', 'classes']}
      filters={[
        { key: 'isActive', label: 'All statuses', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
        { key: 'subjectId', label: 'All subjects', options: (subjects?.items ?? []).map((s) => ({ value: s._id, label: s.name })) },
      ]}
      defaultValues={(row) => ({
        name: row?.name ?? '', email: row?.email ?? '', phone: row?.phone ?? '',
        qualification: row?.qualification ?? '', specialization: row?.specialization ?? '',
        experienceYears: row?.experienceYears ?? '', joiningDate: toInputDate(row?.joiningDate) || toInputDate(new Date()),
        salary: row?.salary ?? '', bio: row?.bio ?? '', createLogin: !row,
      })}
      toPayload={(v, row) => {
        const p = clean(v);
        if (row) delete p.createLogin;
        if (p.experienceYears !== undefined) p.experienceYears = Number(p.experienceYears);
        if (p.salary !== undefined) p.salary = Number(p.salary);
        return p;
      }}
      deleteConfirm={(t) => ({
        title: `Remove ${t.name}?`,
        description: 'Their classes and batches will need a new teacher assigned. Past attendance and results are preserved.',
      })}
      renderForm={({ register, formState: { errors } }, row) => (
        <>
          <Field label="Full name" error={errors.name?.message} required>
            <Input placeholder="e.g. Dr. Meera Nair" invalid={!!errors.name} {...register('name', { required: 'Enter the teacher name' })} />
          </Field>
          <Field label="Phone" error={errors.phone?.message} required>
            <Input placeholder="9876543210" invalid={!!errors.phone} {...register('phone', { required: 'Enter a phone number' })} />
          </Field>
          <Field label="Email" error={errors.email?.message} required hint="Used for the teacher portal login">
            <Input type="email" placeholder="teacher@example.com" invalid={!!errors.email} {...register('email', { required: 'Enter an email' })} />
          </Field>
          <Field label="Qualification">
            <Input placeholder="e.g. M.Sc. Physics, B.Ed." {...register('qualification')} />
          </Field>
          <Field label="Specialization">
            <Input placeholder="e.g. JEE Physics" {...register('specialization')} />
          </Field>
          <Field label="Years of experience">
            <Input type="number" min={0} placeholder="0" {...register('experienceYears')} />
          </Field>
          <Field label="Joining date">
            <Input type="date" {...register('joiningDate')} />
          </Field>
          <Field label="Monthly salary" hint="Visible to admins only">
            <Input type="number" min={0} placeholder="0" {...register('salary')} />
          </Field>
          <Field label="Bio" className="sm:col-span-2">
            <Textarea placeholder="Short introduction shown to students" {...register('bio')} />
          </Field>
          {!row && (
            <label className="flex items-center gap-2.5 sm:col-span-2">
              <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-[var(--brand-primary)]" {...register('createLogin')} />
              <span className="text-sm text-ink-700">Create a teacher portal login for this person</span>
            </label>
          )}
        </>
      )}
    />
  );
}

export function formatSalary(n?: number) {
  return n ? formatCurrency(n) : '—';
}
