import { useState } from 'react';
import { ClipboardList, GraduationCap } from 'lucide-react';
import { ResourcePage, clean } from '@/components/ResourcePage';
import {
  Field, Input, Select, Textarea, Badge, StatusBadge, Modal, Button, Avatar, Skeleton,
  EmptyState, useToast,
} from '@/components/ui';
import { Column } from '@/components/DataTable';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { formatDate, titleCase, labelOf, toInputDate } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import type { Assignment, Course, Batch, Submission } from '@/types';

const STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED'];

interface AssignmentForm {
  title: string; description: string; courseId: string; batchId: string;
  dueDate: string; maxMarks: number | ''; status: string;
}

export function AssignmentsPage() {
  const { can } = useAuth();
  const [grading, setGrading] = useState<Assignment | null>(null);
  const { data: courses } = useApiQuery<{ items: Course[] }>(['courses', 'options'], '/academics/courses', { limit: 100 });
  const { data: batches } = useApiQuery<{ items: Batch[] }>(['batches', 'options'], '/academics/batches', { limit: 100 });

  const columns: Column<Assignment>[] = [
    {
      key: 'title',
      header: 'Assignment',
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-900">{a.title}</p>
          <p className="truncate text-xs text-ink-500">{labelOf(a.courseId, 'title', '—')}</p>
        </div>
      ),
    },
    { key: 'batch', header: 'Batch', hideBelow: 'lg', render: (a) => <span className="text-[13px]">{labelOf(a.batchId, 'name', 'All batches')}</span> },
    {
      key: 'due',
      header: 'Due',
      render: (a) => {
        const overdue = new Date(a.dueDate) < new Date() && a.status === 'PUBLISHED';
        return <span className={`text-[13px] ${overdue ? 'font-semibold text-rose-600' : 'text-ink-800'}`}>{formatDate(a.dueDate, 'DD MMM YYYY')}</span>;
      },
    },
    { key: 'marks', header: 'Max marks', hideBelow: 'xl', className: 'text-right', render: (a) => <span className="text-[13px]">{a.maxMarks}</span> },
    {
      key: 'subs',
      header: 'Submissions',
      hideBelow: 'md',
      render: (a) => (
        <div className="flex items-center gap-1.5">
          <Badge>{a.submissionCount ?? 0} received</Badge>
          {(a.pendingGradingCount ?? 0) > 0 && <Badge tone="PENDING">{a.pendingGradingCount} to grade</Badge>}
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
    {
      key: 'grade',
      header: '',
      className: 'w-px',
      render: (a) =>
        can('assignment:grade') || can('assignment:update') ? (
          <div onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" title="Grade submissions" onClick={() => setGrading(a)}>
              <GraduationCap className="h-4 w-4" />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <ResourcePage<Assignment, AssignmentForm>
        resource="assignments"
        endpoint="/academics/assignments"
        title="Assignments"
        describe={(n) => `${n} assignment${n === 1 ? '' : 's'} set`}
        permission="assignment"
        columns={columns}
        searchPlaceholder="Search assignments…"
        emptyDescription="Set homework and projects, then grade what students submit."
        filters={[
          { key: 'status', label: 'All statuses', options: STATUSES.map((s) => ({ value: s, label: titleCase(s) })) },
          { key: 'courseId', label: 'All courses', options: (courses?.items ?? []).map((c) => ({ value: c._id, label: c.title })) },
        ]}
        defaultValues={(row) => ({
          title: row?.title ?? '', description: row?.description ?? '',
          courseId: typeof row?.courseId === 'object' ? row.courseId._id : (row?.courseId as string) ?? '',
          batchId: typeof row?.batchId === 'object' ? row.batchId._id : (row?.batchId as string) ?? '',
          dueDate: toInputDate(row?.dueDate) || toInputDate(new Date(Date.now() + 7 * 86400000)),
          maxMarks: row?.maxMarks ?? 100, status: row?.status ?? 'PUBLISHED',
        })}
        toPayload={(v) => {
          const p = clean(v);
          if (p.maxMarks !== undefined) p.maxMarks = Number(p.maxMarks);
          return p;
        }}
        deleteConfirm={(a) => ({ title: `Delete "${a.title}"?`, description: 'Submissions and grades for this assignment will be removed.' })}
        renderForm={({ register, formState: { errors } }) => (
          <>
            <Field label="Title" error={errors.title?.message} required className="sm:col-span-2">
              <Input placeholder="e.g. Rotational motion problem set" invalid={!!errors.title} {...register('title', { required: 'Enter a title' })} />
            </Field>
            <Field label="Course" error={errors.courseId?.message} required>
              <Select invalid={!!errors.courseId} {...register('courseId', { required: 'Select a course' })}>
                <option value="">Select a course…</option>
                {(courses?.items ?? []).map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
              </Select>
            </Field>
            <Field label="Batch" hint="Leave blank for all batches">
              <Select {...register('batchId')}>
                <option value="">All batches</option>
                {(batches?.items ?? []).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="Due date" error={errors.dueDate?.message} required>
              <Input type="date" invalid={!!errors.dueDate} {...register('dueDate', { required: 'Pick a due date' })} />
            </Field>
            <Field label="Max marks">
              <Input type="number" min={1} {...register('maxMarks')} />
            </Field>
            <Field label="Status" className="sm:col-span-2">
              <Select {...register('status')}>
                {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </Select>
            </Field>
            <Field label="Instructions" className="sm:col-span-2">
              <Textarea rows={4} placeholder="What should students do?" {...register('description')} />
            </Field>
          </>
        )}
      />
      {grading && <GradingModal assignment={grading} onClose={() => setGrading(null)} />}
    </>
  );
}

/* ------------------------------ Grading modal ------------------------------ */

function GradingModal({ assignment, onClose }: { assignment: Assignment; onClose: () => void }) {
  const toast = useToast();
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const { data, isLoading } = useApiQuery<{ assignment: Assignment; submissions: Submission[] }>(
    ['assignments', assignment._id, 'submissions'],
    `/academics/assignments/${assignment._id}`,
  );

  const grade = useApiMutation<{ id: string; marksObtained: number; feedback?: string }>(
    (b) => `/academics/submissions/${b.id}/grade`,
    {
      invalidate: ['assignments'],
      onSuccess: () => toast.success('Graded'),
    },
  );

  const submissions = data?.submissions ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      title={`Grade: ${assignment.title}`}
      description={`Out of ${assignment.maxMarks} marks · ${submissions.length} submission${submissions.length === 1 ? '' : 's'}`}
      size="xl"
      footer={<Button variant="outline" size="sm" onClick={onClose}>Close</Button>}
    >
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : submissions.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No submissions yet" description="Students have not submitted this assignment." />
      ) : (
        <div className="divide-y divide-ink-100">
          {submissions.map((s) => {
            const student = typeof s.studentId === 'object' ? s.studentId : null;
            const value = marks[s._id] ?? (s.marksObtained !== undefined && s.marksObtained !== null ? String(s.marksObtained) : '');
            return (
              <div key={s._id} className="py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={student?.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{student?.name ?? 'Student'}</p>
                    <p className="truncate text-xs text-ink-500">
                      Submitted {formatDate(s.submittedAt, 'DD MMM YYYY')} · <StatusBadge status={s.status} />
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={assignment.maxMarks}
                    className="w-24 shrink-0"
                    placeholder="Marks"
                    value={value}
                    onChange={(e) => setMarks((m) => ({ ...m, [s._id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    loading={grade.isPending && grade.variables?.id === s._id}
                    disabled={value === ''}
                    onClick={() =>
                      grade.mutate({ id: s._id, marksObtained: Number(value), feedback: feedback[s._id] || undefined })
                    }
                  >
                    Save
                  </Button>
                </div>
                {s.content && <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-[13px] text-ink-700">{s.content}</p>}
                <Textarea
                  className="mt-2"
                  rows={2}
                  placeholder="Feedback for the student (optional)"
                  value={feedback[s._id] ?? s.feedback ?? ''}
                  onChange={(e) => setFeedback((f) => ({ ...f, [s._id]: e.target.value }))}
                />
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
