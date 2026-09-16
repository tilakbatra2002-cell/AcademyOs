import { ResourcePage, clean } from '@/components/ResourcePage';
import { Field, Input, Textarea, Badge } from '@/components/ui';
import { Column } from '@/components/DataTable';
import type { Subject } from '@/types';

interface SubjectForm {
  name: string;
  code: string;
  description: string;
}

export function SubjectsPage() {
  const columns: Column<Subject>[] = [
    {
      key: 'name',
      header: 'Subject',
      render: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{s.name}</p>
          {s.description && <p className="truncate text-xs text-ink-500">{s.description}</p>}
        </div>
      ),
    },
    { key: 'code', header: 'Code', render: (s) => <Badge>{s.code}</Badge> },
    {
      key: 'courses',
      header: 'Used in',
      hideBelow: 'md',
      render: (s) => <span className="text-[13px] text-ink-600">{s.courseCount ?? 0} course{s.courseCount === 1 ? '' : 's'}</span>,
    },
  ];

  return (
    <ResourcePage<Subject, SubjectForm>
      resource="subjects"
      endpoint="/academics/subjects"
      title="Subjects"
      describe={(n) => `${n} subject${n === 1 ? '' : 's'} taught across your courses`}
      permission="subject"
      columns={columns}
      searchPlaceholder="Search subjects…"
      emptyDescription="Subjects group your lessons, exams and results. Add Physics, Chemistry, Maths and so on."
      invalidate={['courses']}
      formSize="md"
      defaultValues={(row) => ({
        name: row?.name ?? '',
        code: row?.code ?? '',
        description: row?.description ?? '',
      })}
      toPayload={(v) => clean(v)}
      deleteConfirm={(s) => ({
        title: `Delete ${s.name}?`,
        description: 'Courses and exams referencing this subject will keep their records, but the subject will no longer be selectable.',
      })}
      renderForm={({ register, formState: { errors } }) => (
        <>
          <Field label="Subject name" error={errors.name?.message} required>
            <Input placeholder="e.g. Physics" invalid={!!errors.name} {...register('name', { required: 'Enter a subject name' })} />
          </Field>
          <Field label="Code" error={errors.code?.message} required hint="Short identifier, e.g. PHY">
            <Input placeholder="PHY" invalid={!!errors.code} {...register('code', { required: 'Enter a code' })} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea placeholder="What does this subject cover?" {...register('description')} />
          </Field>
        </>
      )}
    />
  );
}
