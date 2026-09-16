import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft, Phone, Mail, MapPin, Pencil, MessageSquarePlus, CalendarPlus, UserCheck, Trash2,
  Clock, CheckCircle2,
} from 'lucide-react';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import {
  PageHeader, Card, CardHeader, Button, Badge, StatusBadge, Avatar, Skeleton, ErrorState,
  EmptyState, Modal, Field, Input, Select, Textarea, useToast, useConfirm,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate, formatDateTime, fromNow, titleCase, labelOf } from '@/lib/utils';
import type { Lead, FollowUp } from '@/types';
import { LeadFormModal, LEAD_STATUSES } from './Leads';
import { AdmissionWizard } from './AdmissionWizard';

interface LeadDetailData {
  lead: Lead;
  followUps: FollowUp[];
}

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [showEdit, setShowEdit] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [showConvert, setShowConvert] = useState(false);

  const { data, isLoading, error, refetch } = useApiQuery<LeadDetailData>(['leads', id], `/crm/leads/${id}`);

  const changeStatus = useApiMutation<{ status: string }>(`/crm/leads/${id}/status`, {
    method: 'patch',
    invalidate: ['leads', 'dashboard'],
    successMessage: 'Stage updated',
  });

  const remove = useApiMutation<void>(`/crm/leads/${id}`, {
    method: 'delete',
    invalidate: ['leads'],
    successMessage: 'Lead deleted',
    onSuccess: () => navigate('/admin/leads'),
  });

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title={error?.isNotFound ? 'Lead not found' : 'Could not load this lead'}
        description={error?.isNotFound ? 'It may have been deleted or belongs to another academy.' : error?.message}
        onRetry={error?.isNotFound ? undefined : () => refetch()}
      />
    );
  }

  const lead = data.lead;
  const followUps = data.followUps ?? [];
  const isConverted = lead.status === 'ADMITTED';

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete ${lead.name}?`,
      description: 'This enquiry and its follow-ups will be permanently removed.',
      confirmLabel: 'Delete lead',
      danger: true,
    });
    if (ok) remove.mutate();
  };

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate('/admin/leads')}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 transition hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to leads
      </button>

      <PageHeader
        title={lead.name}
        description={`Added ${fromNow(lead.createdAt)} · ${titleCase(lead.source)}`}
        actions={
          <>
            {can('lead:update') && !isConverted && (
              <Button variant="outline" size="sm" onClick={() => setShowEdit(true)} icon={<Pencil className="h-4 w-4" />}>
                Edit
              </Button>
            )}
            {can('followup:create') && !isConverted && (
              <Button variant="outline" size="sm" onClick={() => setShowFollowUp(true)} icon={<CalendarPlus className="h-4 w-4" />}>
                Schedule follow-up
              </Button>
            )}
            {can('lead:convert') && !isConverted && (
              <Button size="sm" onClick={() => setShowConvert(true)} icon={<UserCheck className="h-4 w-4" />}>
                Convert to admission
              </Button>
            )}
            {can('lead:delete') && (
              <Button variant="ghost" size="icon" title="Delete lead" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 text-rose-500" />
              </Button>
            )}
          </>
        }
      />

      {isConverted && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-sm text-emerald-800">
            This lead has been admitted. Converted leads are locked to preserve the admission record.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* --------------------------- Pipeline stage --------------------------- */}
          <Card>
            <CardHeader title="Pipeline stage" subtitle="Move this enquiry through your funnel" />
            <div className="flex flex-wrap gap-2 p-4">
              {LEAD_STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={!can('lead:update') || isConverted || changeStatus.isPending}
                  onClick={() => changeStatus.mutate({ status: s })}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    lead.status === s
                      ? 'bg-[var(--brand-primary)] text-white ring-transparent'
                      : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50'
                  }`}
                >
                  {titleCase(s)}
                </button>
              ))}
            </div>
          </Card>

          {/* ----------------------------- Activities ----------------------------- */}
          <Card>
            <CardHeader
              title="Activity timeline"
              subtitle={`${lead.activities?.length ?? 0} logged`}
              action={
                can('lead:update') && !isConverted ? (
                  <Button variant="outline" size="sm" onClick={() => setShowActivity(true)} icon={<MessageSquarePlus className="h-4 w-4" />}>
                    Log activity
                  </Button>
                ) : undefined
              }
            />
            {(lead.activities?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<MessageSquarePlus className="h-6 w-6" />}
                title="No activity yet"
                description="Log calls, visits and messages so the whole team has context."
              />
            ) : (
              <div className="space-y-0 p-4">
                {[...(lead.activities ?? [])].reverse().map((a, i) => (
                  <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--brand-primary)]" />
                      {i < (lead.activities?.length ?? 0) - 1 && <span className="mt-1 w-px flex-1 bg-ink-200" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{titleCase(a.type)}</Badge>
                        <span className="text-xs text-ink-400">{formatDateTime(a.at)}</span>
                      </div>
                      <p className="mt-1 text-[13px] text-ink-700">{a.note}</p>
                      {a.byName && <p className="mt-0.5 text-xs text-ink-400">by {a.byName}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ------------------------------ Follow-ups ----------------------------- */}
          <Card>
            <CardHeader title="Follow-ups" subtitle={`${followUps.length} scheduled`} />
            {followUps.length === 0 ? (
              <EmptyState icon={<Clock className="h-6 w-6" />} title="No follow-ups" description="Schedule a call or visit to keep this lead warm." />
            ) : (
              <div className="divide-y divide-ink-100">
                {followUps.map((f) => (
                  <div key={f._id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink-900">
                        {titleCase(f.mode)} · {formatDate(f.scheduledAt, 'DD MMM YYYY')}
                        {f.scheduledTime ? ` at ${f.scheduledTime}` : ''}
                      </p>
                      {f.notes && <p className="mt-0.5 truncate text-xs text-ink-500">{f.notes}</p>}
                    </div>
                    <Badge tone={f.priority}>{titleCase(f.priority)}</Badge>
                    <StatusBadge status={f.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ------------------------------- Sidebar -------------------------------- */}
        <div className="space-y-5">
          <Card>
            <div className="flex flex-col items-center border-b border-ink-200/70 px-5 py-6 text-center">
              <Avatar name={lead.name} size="lg" />
              <h3 className="mt-3 font-display text-lg font-bold text-ink-900">{lead.name}</h3>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                <StatusBadge status={lead.status} />
                <Badge tone={lead.priority}>{titleCase(lead.priority)} priority</Badge>
              </div>
            </div>
            <dl className="divide-y divide-ink-100">
              <Row icon={<Phone className="h-4 w-4" />} label="Phone" value={<a href={`tel:${lead.phone}`} className="hover:underline">{lead.phone}</a>} />
              {lead.email && <Row icon={<Mail className="h-4 w-4" />} label="Email" value={<a href={`mailto:${lead.email}`} className="break-all hover:underline">{lead.email}</a>} />}
              {lead.city && <Row icon={<MapPin className="h-4 w-4" />} label="City" value={lead.city} />}
              <Row label="Course interest" value={lead.courseInterest ?? labelOf(lead.courseId, 'title', '—')} />
              <Row label="Expected value" value={lead.expectedValue ? formatCurrency(lead.expectedValue) : '—'} />
              <Row label="Source" value={titleCase(lead.source)} />
              <Row label="Counselor" value={labelOf(lead.assignedCounselorId, 'name', 'Unassigned')} />
              {lead.parentName && <Row label="Parent" value={`${lead.parentName}${lead.parentPhone ? ` · ${lead.parentPhone}` : ''}`} />}
              {lead.expectedJoiningDate && <Row label="Expected joining" value={formatDate(lead.expectedJoiningDate)} />}
              {lead.lastContactedAt && <Row label="Last contacted" value={fromNow(lead.lastContactedAt)} />}
              {lead.lostReason && <Row label="Lost reason" value={lead.lostReason} />}
            </dl>
          </Card>

          {lead.notes && (
            <Card>
              <CardHeader title="Notes" />
              <p className="whitespace-pre-wrap px-5 py-4 text-[13px] text-ink-700">{lead.notes}</p>
            </Card>
          )}
        </div>
      </div>

      {showEdit && <LeadFormModal lead={lead} onClose={() => setShowEdit(false)} />}
      {showActivity && <ActivityModal leadId={lead._id} onClose={() => setShowActivity(false)} />}
      {showFollowUp && <FollowUpModal leadId={lead._id} onClose={() => setShowFollowUp(false)} />}
      {showConvert && (
        <AdmissionWizard
          lead={lead}
          onClose={() => setShowConvert(false)}
          onDone={(studentId) => {
            toast.success('Admission confirmed', 'The student record has been created.');
            navigate(`/admin/students/${studentId}`);
          }}
        />
      )}
    </div>
  );
}

function Row({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-2.5">
      <dt className="flex shrink-0 items-center gap-1.5 text-[13px] text-ink-500">
        {icon}
        {label}
      </dt>
      <dd className="min-w-0 text-right text-[13px] font-medium text-ink-900">{value}</dd>
    </div>
  );
}

/* ----------------------------- Activity modal ------------------------------ */

function ActivityModal({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<{ type: string; note: string }>({
    defaultValues: { type: 'CALL' },
  });

  const mutation = useApiMutation<{ type: string; note: string }>(`/crm/leads/${leadId}/activities`, {
    invalidate: ['leads'],
    successMessage: 'Activity logged',
    onSuccess: onClose,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Log an activity"
      description="Record what happened so the next person has full context."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={mutation.isPending} onClick={handleSubmit((v) => mutation.mutate(v))}>Save activity</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <Field label="Type" required>
          <Select {...register('type', { required: true })}>
            {['CALL', 'VISIT', 'EMAIL', 'WHATSAPP', 'SMS', 'DEMO', 'NOTE', 'MEETING'].map((t) => (
              <option key={t} value={t}>{titleCase(t)}</option>
            ))}
          </Select>
        </Field>
        <Field label="What happened?" error={errors.note?.message} required>
          <Textarea
            placeholder="e.g. Spoke to the father; wants a demo class this Saturday."
            {...register('note', { required: 'Please describe the activity' })}
          />
        </Field>
      </form>
    </Modal>
  );
}

/* ---------------------------- Follow-up modal ------------------------------ */

export function FollowUpModal({ leadId, onClose }: { leadId?: string; onClose: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<{
    mode: string; scheduledAt: string; scheduledTime: string; priority: string; notes: string;
  }>({
    defaultValues: { mode: 'CALL', priority: 'MEDIUM', scheduledAt: new Date().toISOString().slice(0, 10) },
  });

  const mutation = useApiMutation<Record<string, unknown>>('/crm/follow-ups', {
    invalidate: ['follow-ups', 'leads', 'dashboard'],
    successMessage: 'Follow-up scheduled',
    onSuccess: onClose,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule a follow-up"
      description="Set a reminder so this enquiry does not go cold."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            loading={mutation.isPending}
            onClick={handleSubmit((v) => mutation.mutate({ ...v, leadId }))}
          >
            Schedule
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Mode" required>
          <Select {...register('mode')}>
            {['CALL', 'VISIT', 'EMAIL', 'WHATSAPP', 'SMS', 'DEMO'].map((m) => (
              <option key={m} value={m}>{titleCase(m)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select {...register('priority')}>
            {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
              <option key={p} value={p}>{titleCase(p)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date" error={errors.scheduledAt?.message} required>
          <Input type="date" {...register('scheduledAt', { required: 'Pick a date' })} />
        </Field>
        <Field label="Time">
          <Input type="time" {...register('scheduledTime')} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea placeholder="What should be discussed?" {...register('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
