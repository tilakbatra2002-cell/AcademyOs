import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Download, Upload, GraduationCap, Trash2, Pencil, KeyRound } from 'lucide-react';
import { useListQuery, useApiMutation, useApiQuery, applyFieldErrors } from '@/hooks/useApi';
import { DataTable, Column } from '@/components/DataTable';
import {
  PageHeader, Button, Modal, Field, Input, Select, Avatar, StatusBadge, useToast, useConfirm, Badge,
} from '@/components/ui';
import { downloadFile, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, labelOf, toInputDate } from '@/lib/utils';
import type { Student, Course, Batch } from '@/types';
import { ImportDialog } from '@/components/ImportDialog';

const studentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().regex(/^[0-9+\-\s]{7,15}$/, 'Enter a valid phone number'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional().or(z.literal('')),
  dateOfBirth: z.string().optional().or(z.literal('')),
  schoolName: z.string().optional().or(z.literal('')),
  primaryCourseId: z.string().optional().or(z.literal('')),
  primaryBatchId: z.string().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DROPPED', 'COMPLETED', 'SUSPENDED']).optional(),
  admissionDate: z.string().optional().or(z.literal('')),
  address: z
    .object({
      line1: z.string().optional().or(z.literal('')),
      city: z.string().optional().or(z.literal('')),
      state: z.string().optional().or(z.literal('')),
    })
    .optional(),
});
type StudentForm = z.infer<typeof studentSchema>;

export function StudentsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Student | null>(null);
  const [showForm, setShowForm] = useState(params.get('new') === '1');
  const [showImport, setShowImport] = useState(false);

  const list = useListQuery<Student>('students', '/people/students');
  const { data: courses } = useApiQuery<{ items: Course[] }>(['courses', 'options'], '/academics/courses', { limit: 100 });
  const { data: batches } = useApiQuery<{ items: Batch[] }>(['batches', 'options'], '/academics/batches', { limit: 100 });

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    if (params.get('new')) {
      params.delete('new');
      setParams(params, { replace: true });
    }
  };

  const remove = useApiMutation<{ id: string }>((b) => `/people/students/${b.id}`, {
    method: 'delete',
    invalidate: ['students', 'dashboard'],
    successMessage: 'Student removed',
  });

  const resetLogin = useApiMutation<{ id: string }, { password?: string; email?: string }>(
    (b) => `/people/students/${b.id}/reset-login`,
    {
      invalidate: ['students'],
      onSuccess: (res) =>
        toast.success(
          'Login reset',
          res.password ? `Temporary password: ${res.password}` : 'A new password has been generated.',
        ),
    },
  );

  const handleDelete = async (s: Student) => {
    const ok = await confirm({
      title: `Remove ${s.name}?`,
      description: 'The student record will be removed from active lists. Historical finance and attendance records are preserved.',
      confirmLabel: 'Remove student',
      danger: true,
    });
    if (ok) remove.mutate({ id: s._id });
  };

  const handleExport = async () => {
    try {
      await downloadFile('/reports/export/students', `students-${Date.now()}.csv`, list.params);
      toast.success('Export ready', 'Your CSV download has started.');
    } catch (e) {
      toast.error('Export failed', (e as ApiError).message);
    }
  };

  const columns: Column<Student>[] = [
    {
      key: 'name',
      header: 'Student',
      render: (s) => (
        <div className="flex items-center gap-3">
          <Avatar name={s.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{s.name}</p>
            <p className="truncate text-xs text-ink-500">{s.studentCode}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      hideBelow: 'md',
      render: (s) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] text-ink-700">{s.phone ?? '—'}</p>
          <p className="truncate text-xs text-ink-400">{s.email ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'course',
      header: 'Course',
      hideBelow: 'lg',
      render: (s) => <span className="text-[13px]">{labelOf(s.primaryCourseId, 'title', '—')}</span>,
    },
    {
      key: 'batch',
      header: 'Batch',
      hideBelow: 'xl',
      render: (s) => <span className="text-[13px]">{labelOf(s.primaryBatchId, 'name', '—')}</span>,
    },
    {
      key: 'admitted',
      header: 'Admitted',
      hideBelow: 'xl',
      render: (s) => <span className="text-[13px] text-ink-500">{formatDate(s.admissionDate)}</span>,
    },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
    {
      key: 'actions',
      header: '',
      className: 'w-px',
      render: (s) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {can('student:update') && (
            <Button
              variant="ghost"
              size="icon"
              title="Edit student"
              onClick={() => {
                setEditing(s);
                setShowForm(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {can('student:update') && (
            <Button
              variant="ghost"
              size="icon"
              title="Reset portal login"
              loading={resetLogin.isPending && resetLogin.variables?.id === s._id}
              onClick={() => resetLogin.mutate({ id: s._id })}
            >
              <KeyRound className="h-4 w-4" />
            </Button>
          )}
          {can('student:delete') && (
            <Button variant="ghost" size="icon" title="Remove student" onClick={() => handleDelete(s)}>
              <Trash2 className="h-4 w-4 text-rose-500" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Students"
        description={`${list.total} student${list.total === 1 ? '' : 's'} on the roll`}
        actions={
          <>
            {can('export:run') && (
              <Button variant="outline" size="sm" onClick={handleExport} icon={<Download className="h-4 w-4" />}>
                Export
              </Button>
            )}
            {can('import:run') && (
              <Button variant="outline" size="sm" onClick={() => setShowImport(true)} icon={<Upload className="h-4 w-4" />}>
                Import
              </Button>
            )}
            {can('student:create') && (
              <Button size="sm" onClick={() => setShowForm(true)} icon={<Plus className="h-4 w-4" />}>
                Add student
              </Button>
            )}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(s) => s._id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search by name, code, phone or email…"
        filters={[
          {
            key: 'status',
            label: 'All statuses',
            options: ['ACTIVE', 'INACTIVE', 'DROPPED', 'COMPLETED', 'SUSPENDED'].map((v) => ({ value: v, label: v })),
          },
          {
            key: 'courseId',
            label: 'All courses',
            options: (courses?.items ?? []).map((c) => ({ value: c._id, label: c.title })),
          },
          {
            key: 'batchId',
            label: 'All batches',
            options: (batches?.items ?? []).map((b) => ({ value: b._id, label: b.name })),
          },
        ]}
        filterValues={list.filters}
        onFilter={list.setFilter}
        onClearFilters={list.clearFilters}
        activeFilterCount={list.activeFilterCount}
        page={list.page}
        pages={list.pages}
        total={list.total}
        limit={list.limit}
        onPage={list.setPage}
        onRowClick={(s) => navigate(`/admin/students/${s._id}`)}
        emptyTitle="No students yet"
        emptyDescription="Add your first student or convert a lead from the admissions pipeline."
        emptyAction={
          can('student:create') ? (
            <Button size="sm" onClick={() => setShowForm(true)} icon={<Plus className="h-4 w-4" />}>
              Add student
            </Button>
          ) : undefined
        }
      />

      {showForm && (
        <StudentFormModal
          student={editing}
          courses={courses?.items ?? []}
          batches={batches?.items ?? []}
          onClose={closeForm}
        />
      )}

      {showImport && (
        <ImportDialog
          entity="students"
          title="Import students"
          onClose={() => setShowImport(false)}
          onDone={() => list.refetch()}
        />
      )}
    </div>
  );
}

/* ------------------------------- Form modal -------------------------------- */

function StudentFormModal({
  student,
  courses,
  batches,
  onClose,
}: {
  student: Student | null;
  courses: Course[];
  batches: Batch[];
  onClose: () => void;
}) {
  const isEdit = !!student;
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<StudentForm>({
    resolver: zodResolver(studentSchema),
    defaultValues: student
      ? {
          name: student.name,
          email: student.email ?? '',
          phone: student.phone ?? '',
          gender: (student.gender as 'MALE') ?? '',
          dateOfBirth: toInputDate(student.dateOfBirth),
          schoolName: student.schoolName ?? '',
          primaryCourseId: typeof student.primaryCourseId === 'object' ? student.primaryCourseId._id : student.primaryCourseId ?? '',
          primaryBatchId: typeof student.primaryBatchId === 'object' ? student.primaryBatchId._id : student.primaryBatchId ?? '',
          status: student.status,
          admissionDate: toInputDate(student.admissionDate),
          address: { line1: student.address?.line1 ?? '', city: student.address?.city ?? '', state: student.address?.state ?? '' },
        }
      : { status: 'ACTIVE', admissionDate: toInputDate(new Date()) },
  });

  const selectedCourse = watch('primaryCourseId');
  const courseBatches = batches.filter(
    (b) => !selectedCourse || (typeof b.courseId === 'object' ? b.courseId._id : b.courseId) === selectedCourse,
  );

  const mutation = useApiMutation<StudentForm>(
    isEdit ? `/people/students/${student!._id}` : '/people/students',
    {
      method: isEdit ? 'patch' : 'post',
      invalidate: ['students', 'dashboard'],
      successMessage: isEdit ? 'Student updated' : 'Student added',
      silentError: true,
      onSuccess: onClose,
    },
  );

  const onSubmit = (values: StudentForm) => {
    // Strip empty strings so the backend treats them as "not provided".
    const payload = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== '' && v !== undefined),
    ) as StudentForm;
    mutation.mutate(payload, {
      onError: (e) => applyFieldErrors(e, setError as never),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Edit ${student!.name}` : 'Add student'}
      description={isEdit ? 'Update this student record.' : 'Create a student record directly, without the admission wizard.'}
      size="lg"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={mutation.isPending} onClick={handleSubmit(onSubmit)}>
            {isEdit ? 'Save changes' : 'Add student'}
          </Button>
        </>
      }
    >
      {mutation.error && !Object.keys(mutation.error.fields ?? {}).length && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {mutation.error.message}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.name?.message} required className="sm:col-span-2">
          <Input placeholder="e.g. Aarav Sharma" invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="Phone" error={errors.phone?.message} required>
          <Input placeholder="9876543210" invalid={!!errors.phone} {...register('phone')} />
        </Field>
        <Field label="Email" error={errors.email?.message} hint="Used for the student portal login">
          <Input type="email" placeholder="student@example.com" invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Gender" error={errors.gender?.message}>
          <Select {...register('gender')}>
            <option value="">Select…</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field label="Date of birth" error={errors.dateOfBirth?.message}>
          <Input type="date" {...register('dateOfBirth')} />
        </Field>
        <Field label="Course" error={errors.primaryCourseId?.message}>
          <Select {...register('primaryCourseId')}>
            <option value="">No course</option>
            {courses.map((c) => (
              <option key={c._id} value={c._id}>
                {c.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Batch" error={errors.primaryBatchId?.message} hint={selectedCourse ? undefined : 'Pick a course to narrow batches'}>
          <Select {...register('primaryBatchId')}>
            <option value="">No batch</option>
            {courseBatches.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name} ({b.enrolledCount}/{b.capacity})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="School / college" error={errors.schoolName?.message}>
          <Input placeholder="e.g. DAV Public School" {...register('schoolName')} />
        </Field>
        <Field label="Admission date" error={errors.admissionDate?.message}>
          <Input type="date" {...register('admissionDate')} />
        </Field>
        {isEdit && (
          <Field label="Status">
            <Select {...register('status')}>
              {['ACTIVE', 'INACTIVE', 'DROPPED', 'COMPLETED', 'SUSPENDED'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Address" className="sm:col-span-2">
          <Input placeholder="Street address" {...register('address.line1')} />
        </Field>
        <Field label="City">
          <Input placeholder="e.g. Shimla" {...register('address.city')} />
        </Field>
        <Field label="State">
          <Input placeholder="e.g. Himachal Pradesh" {...register('address.state')} />
        </Field>
      </form>

      {!isEdit && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-sky-50 px-3.5 py-3">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <p className="text-[13px] text-sky-800">
            Adding a student here does not create a fee plan. Use{' '}
            <Badge className="mx-0.5 align-middle">Admissions</Badge> to run the full 7-step wizard with fees,
            batch allocation and the first payment.
          </p>
        </div>
      )}
    </Modal>
  );
}
