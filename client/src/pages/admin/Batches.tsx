import { ResourcePage, clean } from '@/components/ResourcePage';
import { Field, Input, Select, Badge, StatusBadge, ProgressBar } from '@/components/ui';
import { Column } from '@/components/DataTable';
import { useApiQuery } from '@/hooks/useApi';
import { formatDate, titleCase, labelOf, toInputDate } from '@/lib/utils';
import type { Batch, Course, Teacher } from '@/types';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const STATUSES = ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'];

interface BatchForm {
  name: string; code: string; courseId: string; teacherId: string;
  capacity: number | ''; room: string; startDate: string; endDate: string;
  status: string; days: string[]; startTime: string; endTime: string;
}

export function BatchesPage() {
  const { data: courses } = useApiQuery<{ items: Course[] }>(['courses', 'options'], '/academics/courses', { limit: 100 });
  const { data: teachers } = useApiQuery<{ items: Teacher[] }>(['teachers', 'options'], '/people/teachers', { limit: 100 });

  const columns: Column<Batch>[] = [
    {
      key: 'name',
      header: 'Batch',
      render: (b) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{b.name}</p>
          <p className="truncate text-xs text-ink-500">{b.code} · {labelOf(b.courseId, 'title', 'No course')}</p>
        </div>
      ),
    },
    { key: 'teacher', header: 'Teacher', hideBelow: 'lg', render: (b) => <span className="text-[13px]">{labelOf(b.teacherId, 'name', 'Unassigned')}</span> },
    {
      key: 'schedule',
      header: 'Schedule',
      hideBelow: 'xl',
      render: (b) => (
        <span className="text-[13px] text-ink-600">
          {b.schedule?.length ? `${b.schedule.map((s) => s.day.slice(0, 3)).join(', ')} · ${b.schedule[0].startTime}` : '—'}
        </span>
      ),
    },
    {
      key: 'capacity',
      header: 'Enrolment',
      render: (b) => {
        const pct = b.capacity ? Math.round((b.enrolledCount / b.capacity) * 100) : 0;
        return (
          <div className="w-28">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-ink-700">{b.enrolledCount}/{b.capacity}</span>
              {pct >= 100 && <Badge tone="CANCELLED">Full</Badge>}
            </div>
            <ProgressBar value={pct} tone={pct >= 100 ? 'rose' : pct >= 80 ? 'amber' : 'brand'} />
          </div>
        );
      },
    },
    { key: 'room', header: 'Room', hideBelow: 'xl', render: (b) => <span className="text-[13px]">{b.room ?? '—'}</span> },
    { key: 'starts', header: 'Starts', hideBelow: 'lg', render: (b) => <span className="text-[13px] text-ink-500">{formatDate(b.startDate)}</span> },
    { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
  ];

  return (
    <ResourcePage<Batch, BatchForm>
      resource="batches"
      endpoint="/academics/batches"
      title="Batches"
      describe={(n) => `${n} batch${n === 1 ? '' : 'es'} running`}
      permission="batch"
      columns={columns}
      searchPlaceholder="Search batches…"
      exportPath="/reports/export/batches"
      emptyDescription="Batches group students into a timetable slot with a teacher and a room."
      invalidate={['classes', 'students', 'dashboard']}
      filters={[
        { key: 'status', label: 'All statuses', options: STATUSES.map((s) => ({ value: s, label: titleCase(s) })) },
        { key: 'courseId', label: 'All courses', options: (courses?.items ?? []).map((c) => ({ value: c._id, label: c.title })) },
        { key: 'teacherId', label: 'All teachers', options: (teachers?.items ?? []).map((t) => ({ value: t._id, label: t.name })) },
      ]}
      formSize="lg"
      formDescription="Capacity is enforced on the server — enrolment is blocked once a batch is full."
      defaultValues={(row) => ({
        name: row?.name ?? '', code: row?.code ?? '',
        courseId: typeof row?.courseId === 'object' ? row.courseId._id : (row?.courseId as string) ?? '',
        teacherId: typeof row?.teacherId === 'object' ? row.teacherId._id : (row?.teacherId as string) ?? '',
        capacity: row?.capacity ?? 30,
        room: row?.room ?? '',
        startDate: toInputDate(row?.startDate), endDate: toInputDate(row?.endDate),
        status: row?.status ?? 'UPCOMING',
        days: row?.schedule?.map((s) => s.day) ?? ['MON', 'WED', 'FRI'],
        startTime: row?.schedule?.[0]?.startTime ?? '16:00',
        endTime: row?.schedule?.[0]?.endTime ?? '18:00',
      })}
      toPayload={(v) => {
        const { days, startTime, endTime, ...rest } = v;
        const p = clean(rest);
        if (p.capacity !== undefined) p.capacity = Number(p.capacity);
        const selected = Array.isArray(days) ? days : [days].filter(Boolean);
        p.schedule = selected.map((d) => ({ day: d, startTime, endTime }));
        return p;
      }}
      deleteConfirm={(b) => ({
        title: `Delete ${b.name}?`,
        description: b.enrolledCount > 0
          ? `This batch has ${b.enrolledCount} enrolled student(s), so it will be cancelled rather than deleted.`
          : 'This batch will be permanently removed.',
      })}
      renderForm={({ register, formState: { errors } }) => (
        <>
          <Field label="Batch name" error={errors.name?.message} required>
            <Input placeholder="e.g. JEE Morning A" invalid={!!errors.name} {...register('name', { required: 'Enter a batch name' })} />
          </Field>
          <Field label="Code" hint="Auto-generated if blank">
            <Input placeholder="B001" {...register('code')} />
          </Field>
          <Field label="Course" error={errors.courseId?.message} required>
            <Select invalid={!!errors.courseId} {...register('courseId', { required: 'Select a course' })}>
              <option value="">Select a course…</option>
              {(courses?.items ?? []).map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
            </Select>
          </Field>
          <Field label="Teacher">
            <Select {...register('teacherId')}>
              <option value="">Unassigned</option>
              {(teachers?.items ?? []).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Capacity" error={errors.capacity?.message} required>
            <Input type="number" min={1} invalid={!!errors.capacity} {...register('capacity', { required: 'Enter a capacity' })} />
          </Field>
          <Field label="Room">
            <Input placeholder="e.g. Room 204" {...register('room')} />
          </Field>
          <Field label="Start date" required>
            <Input type="date" {...register('startDate', { required: true })} />
          </Field>
          <Field label="End date">
            <Input type="date" {...register('endDate')} />
          </Field>
          <Field label="Class days" className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <label key={d} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] transition hover:bg-ink-50">
                  <input type="checkbox" value={d} className="h-3.5 w-3.5 rounded border-ink-300 text-[var(--brand-primary)]" {...register('days')} />
                  {d}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Start time" required>
            <Input type="time" {...register('startTime', { required: true })} />
          </Field>
          <Field label="End time" required>
            <Input type="time" {...register('endTime', { required: true })} />
          </Field>
          <Field label="Status" className="sm:col-span-2">
            <Select {...register('status')}>
              {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </Select>
          </Field>
        </>
      )}
    />
  );
}
