import { useNavigate } from 'react-router-dom';
import { Layers3, Users, Clock, IndianRupee } from 'lucide-react';
import { ResourcePage, clean } from '@/components/ResourcePage';
import { Field, Input, Select, Textarea, Badge, StatusBadge } from '@/components/ui';
import { Column } from '@/components/DataTable';
import { useApiQuery } from '@/hooks/useApi';
import { formatCurrency, titleCase, labelOf } from '@/lib/utils';
import type { Course, Teacher } from '@/types';

interface CourseForm {
  title: string; code: string; category: string; level: string; type: string;
  description: string; shortDescription: string;
  durationWeeks: number | ''; durationHours: number | '';
  price: number | ''; discount: number | '';
  instructorId: string; status: string;
}

const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS'];
const TYPES = ['ONLINE', 'OFFLINE', 'HYBRID'];
const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

export function CoursesPage() {
  const navigate = useNavigate();
  const { data: teachers } = useApiQuery<{ items: Teacher[] }>(['teachers', 'options'], '/people/teachers', { limit: 100 });

  const columns: Column<Course>[] = [
    {
      key: 'title',
      header: 'Course',
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{c.title}</p>
          <p className="truncate text-xs text-ink-500">{c.code} · {c.category}</p>
        </div>
      ),
    },
    { key: 'level', header: 'Level', hideBelow: 'lg', render: (c) => <Badge>{titleCase(c.level)}</Badge> },
    { key: 'type', header: 'Mode', hideBelow: 'xl', render: (c) => <Badge>{titleCase(c.type)}</Badge> },
    {
      key: 'instructor',
      header: 'Instructor',
      hideBelow: 'lg',
      render: (c) => <span className="text-[13px]">{labelOf(c.instructorId, 'name', 'Unassigned')}</span>,
    },
    {
      key: 'duration',
      header: 'Duration',
      hideBelow: 'xl',
      render: (c) => <span className="text-[13px] text-ink-600">{c.durationWeeks ? `${c.durationWeeks} weeks` : '—'}</span>,
    },
    {
      key: 'price',
      header: 'Price',
      className: 'text-right',
      render: (c) => (
        <div className="text-right">
          <p className="font-semibold text-ink-900">{formatCurrency(c.price - (c.discount ?? 0))}</p>
          {c.discount ? <p className="text-xs text-ink-400 line-through">{formatCurrency(c.price)}</p> : null}
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
  ];

  return (
    <ResourcePage<Course, CourseForm>
      resource="courses"
      endpoint="/academics/courses"
      title="Courses"
      describe={(n) => `${n} course${n === 1 ? '' : 's'} in your catalogue`}
      permission="course"
      columns={columns}
      searchPlaceholder="Search courses…"
      exportPath="/reports/export/courses"
      emptyDescription="Create your first course, then use the course builder to add modules, lessons and videos."
      invalidate={['batches', 'dashboard']}
      onRowClick={(c) => navigate(`/admin/courses/${c._id}/builder`)}
      filters={[
        { key: 'status', label: 'All statuses', options: STATUSES.map((s) => ({ value: s, label: titleCase(s) })) },
        { key: 'level', label: 'All levels', options: LEVELS.map((s) => ({ value: s, label: titleCase(s) })) },
        { key: 'type', label: 'All modes', options: TYPES.map((s) => ({ value: s, label: titleCase(s) })) },
      ]}
      formSize="xl"
      formDescription="Set up the basics here — curriculum content is added in the course builder."
      defaultValues={(row) => ({
        title: row?.title ?? '', code: row?.code ?? '', category: row?.category ?? '',
        level: row?.level ?? 'ALL_LEVELS', type: row?.type ?? 'OFFLINE',
        description: row?.description ?? '', shortDescription: row?.shortDescription ?? '',
        durationWeeks: row?.durationWeeks ?? '', durationHours: row?.durationHours ?? '',
        price: row?.price ?? '', discount: row?.discount ?? '',
        instructorId: typeof row?.instructorId === 'object' ? row.instructorId._id : (row?.instructorId as string) ?? '',
        status: row?.status ?? 'DRAFT',
      })}
      toPayload={(v) => {
        const p = clean(v);
        for (const k of ['durationWeeks', 'durationHours', 'price', 'discount']) {
          if (p[k] !== undefined) p[k] = Number(p[k]);
        }
        return p;
      }}
      deleteConfirm={(c) => ({
        title: `Delete ${c.title}?`,
        description: 'Courses with enrolled students are archived instead of deleted, so their records stay intact.',
      })}
      renderForm={({ register, formState: { errors } }) => (
        <>
          <Field label="Course title" error={errors.title?.message} required className="sm:col-span-2">
            <Input placeholder="e.g. JEE Advanced 2027 Crash Course" invalid={!!errors.title} {...register('title', { required: 'Enter a course title' })} />
          </Field>
          <Field label="Course code" error={errors.code?.message} hint="Auto-generated if left blank">
            <Input placeholder="CRS001" {...register('code')} />
          </Field>
          <Field label="Category" error={errors.category?.message} required>
            <Input placeholder="e.g. Engineering Entrance" invalid={!!errors.category} {...register('category', { required: 'Enter a category' })} />
          </Field>
          <Field label="Level">
            <Select {...register('level')}>
              {LEVELS.map((l) => <option key={l} value={l}>{titleCase(l)}</option>)}
            </Select>
          </Field>
          <Field label="Delivery mode">
            <Select {...register('type')}>
              {TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
            </Select>
          </Field>
          <Field label="Duration (weeks)">
            <Input type="number" min={0} placeholder="12" {...register('durationWeeks')} />
          </Field>
          <Field label="Total hours">
            <Input type="number" min={0} placeholder="120" {...register('durationHours')} />
          </Field>
          <Field label="Price" error={errors.price?.message} required>
            <Input type="number" min={0} placeholder="45000" invalid={!!errors.price} {...register('price', { required: 'Enter a price' })} />
          </Field>
          <Field label="Discount" hint="Flat amount off the price">
            <Input type="number" min={0} placeholder="0" {...register('discount')} />
          </Field>
          <Field label="Instructor" className="sm:col-span-2">
            <Select {...register('instructorId')}>
              <option value="">Unassigned</option>
              {(teachers?.items ?? []).map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Short description" className="sm:col-span-2" hint="One line shown on cards and listings">
            <Input placeholder="Intensive revision with weekly mock tests" {...register('shortDescription')} />
          </Field>
          <Field label="Full description" className="sm:col-span-2">
            <Textarea rows={4} placeholder="What will students learn? Who is this for?" {...register('description')} />
          </Field>
          <Field label="Status" className="sm:col-span-2" hint="Only published courses appear in the admission wizard">
            <Select {...register('status')}>
              {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </Select>
          </Field>
        </>
      )}
    />
  );
}

export const COURSE_ICONS = { Layers3, Users, Clock, IndianRupee };
