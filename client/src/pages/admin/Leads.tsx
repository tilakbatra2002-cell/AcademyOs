import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Download, Upload, Trash2, Pencil, Phone } from 'lucide-react';
import { useListQuery, useApiMutation, useApiQuery, applyFieldErrors } from '@/hooks/useApi';
import { DataTable, Column } from '@/components/DataTable';
import {
  PageHeader, Button, Modal, Field, Input, Select, Textarea, Avatar, StatusBadge, Badge,
  useToast, useConfirm,
} from '@/components/ui';
import { downloadFile, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCurrency, fromNow, labelOf, titleCase } from '@/lib/utils';
import type { Lead, Course } from '@/types';
import { ImportDialog } from '@/components/ImportDialog';

export const LEAD_SOURCES = [
  'WALK_IN', 'REFERRAL', 'WEBSITE', 'GOOGLE_ADS', 'FACEBOOK', 'INSTAGRAM',
  'PHONE_ENQUIRY', 'SEMINAR', 'NEWSPAPER', 'JUSTDIAL', 'OTHER',
];
export const LEAD_STATUSES = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'DEMO_SCHEDULED', 'NEGOTIATION', 'FOLLOW_UP', 'ADMITTED', 'LOST',
];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const leadSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().regex(/^[0-9+\-\s]{7,15}$/, 'Enter a valid phone number'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  parentName: z.string().optional().or(z.literal('')),
  parentPhone: z.string().optional().or(z.literal('')),
  courseId: z.string().optional().or(z.literal('')),
  courseInterest: z.string().optional().or(z.literal('')),
  source: z.string().min(1, 'Select a source'),
  priority: z.string().optional(),
  status: z.string().optional(),
  city: z.string().optional().or(z.literal('')),
  expectedValue: z.coerce.number().min(0).optional(),
  notes: z.string().optional().or(z.literal('')),
});
type LeadForm = z.infer<typeof leadSchema>;

export function LeadsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Lead | null>(null);
  const [showForm, setShowForm] = useState(params.get('new') === '1');
  const [showImport, setShowImport] = useState(false);

  const list = useListQuery<Lead>('leads', '/crm/leads');
  const { data: courses } = useApiQuery<{ items: Course[] }>(['courses', 'options'], '/academics/courses', { limit: 100 });

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    if (params.get('new')) {
      params.delete('new');
      setParams(params, { replace: true });
    }
  };

  const remove = useApiMutation<{ id: string }>((b) => `/crm/leads/${b.id}`, {
    method: 'delete',
    invalidate: ['leads', 'dashboard'],
    successMessage: 'Lead deleted',
  });

  const handleDelete = async (l: Lead) => {
    const ok = await confirm({
      title: `Delete ${l.name}?`,
      description: 'This enquiry and its follow-ups will be removed.',
      confirmLabel: 'Delete lead',
      danger: true,
    });
    if (ok) remove.mutate({ id: l._id });
  };

  const handleExport = async () => {
    try {
      await downloadFile('/reports/export/leads', `leads-${Date.now()}.csv`, list.params);
      toast.success('Export ready', 'Your CSV download has started.');
    } catch (e) {
      toast.error('Export failed', (e as ApiError).message);
    }
  };

  const columns: Column<Lead>[] = [
    {
      key: 'name',
      header: 'Lead',
      render: (l) => (
        <div className="flex items-center gap-3">
          <Avatar name={l.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{l.name}</p>
            <p className="flex items-center gap-1 truncate text-xs text-ink-500">
              <Phone className="h-3 w-3" /> {l.phone}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'course',
      header: 'Interested in',
      hideBelow: 'md',
      render: (l) => <span className="text-[13px]">{l.courseInterest ?? labelOf(l.courseId, 'title', '—')}</span>,
    },
    { key: 'source', header: 'Source', hideBelow: 'lg', render: (l) => <Badge>{titleCase(l.source)}</Badge> },
    {
      key: 'counselor',
      header: 'Counselor',
      hideBelow: 'xl',
      render: (l) => <span className="text-[13px]">{labelOf(l.assignedCounselorId, 'name', 'Unassigned')}</span>,
    },
    {
      key: 'value',
      header: 'Value',
      hideBelow: 'lg',
      render: (l) => <span className="text-[13px] font-medium">{l.expectedValue ? formatCurrency(l.expectedValue) : '—'}</span>,
    },
    { key: 'priority', header: 'Priority', hideBelow: 'md', render: (l) => <Badge tone={l.priority}>{titleCase(l.priority)}</Badge> },
    { key: 'status', header: 'Stage', render: (l) => <StatusBadge status={l.status} /> },
    { key: 'created', header: 'Added', hideBelow: 'xl', render: (l) => <span className="text-xs text-ink-500">{fromNow(l.createdAt)}</span> },
    {
      key: 'actions',
      header: '',
      className: 'w-px',
      render: (l) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {can('lead:update') && (
            <Button variant="ghost" size="icon" title="Edit lead" onClick={() => { setEditing(l); setShowForm(true); }}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {can('lead:delete') && (
            <Button variant="ghost" size="icon" title="Delete lead" onClick={() => handleDelete(l)}>
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
        title="Leads"
        description={`${list.total} enquir${list.total === 1 ? 'y' : 'ies'} captured`}
        actions={
          <>
            {can('export:run') && (
              <Button variant="outline" size="sm" onClick={handleExport} icon={<Download className="h-4 w-4" />}>Export</Button>
            )}
            {can('import:run') && (
              <Button variant="outline" size="sm" onClick={() => setShowImport(true)} icon={<Upload className="h-4 w-4" />}>Import</Button>
            )}
            {can('lead:create') && (
              <Button size="sm" onClick={() => setShowForm(true)} icon={<Plus className="h-4 w-4" />}>New lead</Button>
            )}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(l) => l._id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search by name, phone or email…"
        filters={[
          { key: 'status', label: 'All stages', options: LEAD_STATUSES.map((v) => ({ value: v, label: titleCase(v) })) },
          { key: 'source', label: 'All sources', options: LEAD_SOURCES.map((v) => ({ value: v, label: titleCase(v) })) },
          { key: 'priority', label: 'All priorities', options: PRIORITIES.map((v) => ({ value: v, label: titleCase(v) })) },
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
        onRowClick={(l) => navigate(`/admin/leads/${l._id}`)}
        emptyTitle="No leads yet"
        emptyDescription="Capture your first enquiry to start building the admission pipeline."
        emptyAction={can('lead:create') ? <Button size="sm" onClick={() => setShowForm(true)} icon={<Plus className="h-4 w-4" />}>New lead</Button> : undefined}
      />

      {showForm && <LeadFormModal lead={editing} courses={courses?.items} onClose={closeForm} />}
      {showImport && <ImportDialog entity="leads" title="Import leads" onClose={() => setShowImport(false)} onDone={() => list.refetch()} />}
    </div>
  );
}

/* ------------------------------- Form modal -------------------------------- */

export function LeadFormModal({
  lead,
  courses: coursesProp,
  onClose,
}: {
  lead: Lead | null;
  courses?: Course[];
  onClose: () => void;
}) {
  const isEdit = !!lead;
  const { data } = useApiQuery<{ items: Course[] }>(['courses', 'options'], '/academics/courses', { limit: 100 }, {
    enabled: !coursesProp,
  });
  const courses = coursesProp ?? data?.items ?? [];

  const {
    register, handleSubmit, setError, watch, setValue,
    formState: { errors },
  } = useForm<LeadForm>({
    resolver: zodResolver(leadSchema),
    defaultValues: lead
      ? {
          name: lead.name, phone: lead.phone, email: lead.email ?? '',
          parentName: lead.parentName ?? '', parentPhone: lead.parentPhone ?? '',
          courseId: typeof lead.courseId === 'object' ? lead.courseId._id : lead.courseId ?? '',
          courseInterest: lead.courseInterest ?? '',
          source: lead.source, priority: lead.priority, status: lead.status,
          city: lead.city ?? '', expectedValue: lead.expectedValue ?? undefined,
          notes: lead.notes ?? '',
        }
      : { source: 'WALK_IN', priority: 'MEDIUM', status: 'NEW' },
  });

  const courseId = watch('courseId');

  const mutation = useApiMutation<LeadForm>(isEdit ? `/crm/leads/${lead!._id}` : '/crm/leads', {
    method: isEdit ? 'patch' : 'post',
    invalidate: ['leads', 'dashboard'],
    successMessage: isEdit ? 'Lead updated' : 'Lead created',
    silentError: true,
    onSuccess: onClose,
  });

  const onSubmit = (values: LeadForm) => {
    const payload = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v !== undefined)) as LeadForm;
    mutation.mutate(payload, { onError: (e) => applyFieldErrors(e, setError as never) });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Edit ${lead!.name}` : 'New lead'}
      description={isEdit ? 'Update this enquiry.' : 'Capture a new enquiry into the admission pipeline.'}
      size="lg"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={mutation.isPending} onClick={handleSubmit(onSubmit)}>
            {isEdit ? 'Save changes' : 'Create lead'}
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
        <Field label="Student name" error={errors.name?.message} required>
          <Input placeholder="e.g. Aarav Sharma" invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="Phone" error={errors.phone?.message} required>
          <Input placeholder="9876543210" invalid={!!errors.phone} {...register('phone')} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" placeholder="lead@example.com" {...register('email')} />
        </Field>
        <Field label="City" error={errors.city?.message}>
          <Input placeholder="e.g. Shimla" {...register('city')} />
        </Field>
        <Field label="Parent name" error={errors.parentName?.message}>
          <Input placeholder="Parent / guardian" {...register('parentName')} />
        </Field>
        <Field label="Parent phone" error={errors.parentPhone?.message}>
          <Input placeholder="9876543210" {...register('parentPhone')} />
        </Field>
        <Field label="Course of interest" error={errors.courseId?.message}>
          <Select
            {...register('courseId')}
            onChange={(e) => {
              setValue('courseId', e.target.value);
              const c = courses.find((x) => x._id === e.target.value);
              if (c) {
                setValue('courseInterest', c.title);
                setValue('expectedValue', c.price);
              }
            }}
          >
            <option value="">Not decided</option>
            {courses.map((c) => (
              <option key={c._id} value={c._id}>{c.title}</option>
            ))}
          </Select>
        </Field>
        <Field label="Expected value" error={errors.expectedValue?.message} hint={courseId ? 'Pre-filled from course price' : undefined}>
          <Input type="number" min={0} placeholder="0" {...register('expectedValue')} />
        </Field>
        <Field label="Source" error={errors.source?.message} required>
          <Select invalid={!!errors.source} {...register('source')}>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" error={errors.priority?.message}>
          <Select {...register('priority')}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{titleCase(p)}</option>
            ))}
          </Select>
        </Field>
        {isEdit && (
          <Field label="Stage" error={errors.status?.message} className="sm:col-span-2">
            <Select {...register('status')}>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Notes" className="sm:col-span-2">
          <Textarea placeholder="What did the parent ask about? Any commitments made?" {...register('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
