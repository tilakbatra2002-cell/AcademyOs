import { useNavigate } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { ResourcePage, clean } from '@/components/ResourcePage';
import { Field, Input, Select, Textarea, Badge, StatusBadge } from '@/components/ui';
import { Column } from '@/components/DataTable';
import { useApiQuery } from '@/hooks/useApi';
import { formatDate, titleCase, labelOf, toInputDate } from '@/lib/utils';
import type { Exam, Course, Subject, Batch } from '@/types';

const TYPES = ['EXAM', 'TEST', 'QUIZ', 'ASSESSMENT'];
const STATUSES = ['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'];

interface ExamForm {
  title: string; type: string; courseId: string; subjectId: string; batchId: string;
  date: string; startTime: string; durationMinutes: number | '';
  totalMarks: number | ''; passingMarks: number | ''; status: string; instructions: string;
}

export function ExamsPage() {
  const navigate = useNavigate();
  const { data: courses } = useApiQuery<{ items: Course[] }>(['courses', 'options'], '/academics/courses', { limit: 100 });
  const { data: subjects } = useApiQuery<{ items: Subject[] }>(['subjects', 'options'], '/academics/subjects', { limit: 100 });
  const { data: batches } = useApiQuery<{ items: Batch[] }>(['batches', 'options'], '/academics/batches', { limit: 100 });

  const columns: Column<Exam>[] = [
    {
      key: 'title',
      header: 'Exam',
      render: (e) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{e.title}</p>
          <p className="truncate text-xs text-ink-500">{labelOf(e.subjectId, 'name', 'No subject')}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Type', hideBelow: 'md', render: (e) => <Badge>{titleCase(e.type)}</Badge> },
    { key: 'course', header: 'Course', hideBelow: 'lg', render: (e) => <span className="text-[13px]">{labelOf(e.courseId, 'title', '—')}</span> },
    { key: 'batch', header: 'Batch', hideBelow: 'xl', render: (e) => <span className="text-[13px]">{labelOf(e.batchId, 'name', 'All batches')}</span> },
    {
      key: 'date',
      header: 'Date',
      render: (e) => (
        <div className="min-w-0">
          <p className="text-[13px] text-ink-800">{formatDate(e.date, 'DD MMM YYYY')}</p>
          <p className="text-xs text-ink-500">{e.startTime ?? ''}{e.durationMinutes ? ` · ${e.durationMinutes} min` : ''}</p>
        </div>
      ),
    },
    {
      key: 'marks',
      header: 'Marks',
      hideBelow: 'lg',
      className: 'text-right',
      render: (e) => <span className="text-[13px] font-medium">{e.totalMarks}{e.passingMarks ? ` / pass ${e.passingMarks}` : ''}</span>,
    },
    { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
  ];

  return (
    <ResourcePage<Exam, ExamForm>
      resource="exams"
      endpoint="/academics/exams"
      title="Exams"
      describe={(n) => `${n} exam${n === 1 ? '' : 's'} scheduled`}
      permission="exam"
      columns={columns}
      searchPlaceholder="Search exams…"
      emptyDescription="Schedule tests and exams, then enter results to track student performance."
      invalidate={['results', 'dashboard', 'calendar']}
      onRowClick={(e) => navigate(`/admin/results?examId=${e._id}`)}
      filters={[
        { key: 'status', label: 'All statuses', options: STATUSES.map((s) => ({ value: s, label: titleCase(s) })) },
        { key: 'type', label: 'All types', options: TYPES.map((s) => ({ value: s, label: titleCase(s) })) },
        { key: 'courseId', label: 'All courses', options: (courses?.items ?? []).map((c) => ({ value: c._id, label: c.title })) },
      ]}
      defaultValues={(row) => ({
        title: row?.title ?? '', type: row?.type ?? 'TEST',
        courseId: typeof row?.courseId === 'object' ? row.courseId._id : (row?.courseId as string) ?? '',
        subjectId: typeof row?.subjectId === 'object' ? row.subjectId._id : (row?.subjectId as string) ?? '',
        batchId: typeof row?.batchId === 'object' ? row.batchId._id : (row?.batchId as string) ?? '',
        date: toInputDate(row?.date), startTime: row?.startTime ?? '10:00',
        durationMinutes: row?.durationMinutes ?? 60,
        totalMarks: row?.totalMarks ?? 100, passingMarks: row?.passingMarks ?? 40,
        status: row?.status ?? 'DRAFT', instructions: row?.instructions ?? '',
      })}
      toPayload={(v) => {
        const p = clean(v);
        for (const k of ['durationMinutes', 'totalMarks', 'passingMarks']) if (p[k] !== undefined) p[k] = Number(p[k]);
        return p;
      }}
      deleteConfirm={(e) => ({
        title: `Delete ${e.title}?`,
        description: 'Exams that already have results cannot be deleted — publish or cancel them instead.',
      })}
      renderForm={({ register, formState: { errors } }) => (
        <>
          <Field label="Exam title" error={errors.title?.message} required className="sm:col-span-2">
            <Input placeholder="e.g. Physics Unit Test 3" invalid={!!errors.title} {...register('title', { required: 'Enter a title' })} />
          </Field>
          <Field label="Type">
            <Select {...register('type')}>
              {TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
            </Select>
          </Field>
          <Field label="Subject">
            <Select {...register('subjectId')}>
              <option value="">No subject</option>
              {(subjects?.items ?? []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Course" error={errors.courseId?.message} required>
            <Select invalid={!!errors.courseId} {...register('courseId', { required: 'Select a course' })}>
              <option value="">Select a course…</option>
              {(courses?.items ?? []).map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
            </Select>
          </Field>
          <Field label="Batch" hint="Leave blank to apply to every batch">
            <Select {...register('batchId')}>
              <option value="">All batches</option>
              {(batches?.items ?? []).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Date" error={errors.date?.message} required>
            <Input type="date" invalid={!!errors.date} {...register('date', { required: 'Pick a date' })} />
          </Field>
          <Field label="Start time">
            <Input type="time" {...register('startTime')} />
          </Field>
          <Field label="Duration (minutes)">
            <Input type="number" min={1} {...register('durationMinutes')} />
          </Field>
          <Field label="Status">
            <Select {...register('status')}>
              {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </Select>
          </Field>
          <Field label="Total marks" error={errors.totalMarks?.message} required>
            <Input type="number" min={1} invalid={!!errors.totalMarks} {...register('totalMarks', { required: 'Enter total marks' })} />
          </Field>
          <Field label="Passing marks">
            <Input type="number" min={0} {...register('passingMarks')} />
          </Field>
          <Field label="Instructions" className="sm:col-span-2">
            <Textarea placeholder="Instructions shown to students" {...register('instructions')} />
          </Field>
        </>
      )}
    />
  );
}

export const ExamIcon = ClipboardList;
