import { useState } from 'react';
import { CalendarDays, Plus, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import {
  PageHeader, Card, CardHeader, Button, Modal, Field, Input, Select, Badge, StatusBadge,
  Skeleton, EmptyState, ErrorState, useToast, useConfirm,
} from '@/components/ui';
import { cn, formatDate, labelOf, titleCase } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import type { ClassSession, Batch, Course, Teacher } from '@/types';

const DAY_MS = 86400000;

function startOfWeek(d: Date) {
  const copy = new Date(d);
  const day = (copy.getDay() + 6) % 7; // Monday = 0
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function TimetablePage() {
  const { can } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [editing, setEditing] = useState<ClassSession | null>(null);

  const from = weekStart.toISOString().slice(0, 10);
  const to = new Date(weekStart.getTime() + 6 * DAY_MS).toISOString().slice(0, 10);

  const { data, isLoading, error, refetch } = useApiQuery<{ items: ClassSession[] }>(
    ['classes', from, to],
    '/academics/classes',
    { from, to, limit: 100 },
  );

  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS));
  const sessions = data?.items ?? [];
  const byDay = (d: Date) => {
    const key = d.toISOString().slice(0, 10);
    return sessions
      .filter((s) => String(s.date).slice(0, 10) === key)
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Timetable"
        description="Weekly class schedule. Teacher and room clashes are rejected by the server."
        actions={
          <>
            {can('class:create') && (
              <Button variant="outline" size="sm" onClick={() => setShowGenerate(true)} icon={<Zap className="h-4 w-4" />}>
                Generate from batch
              </Button>
            )}
            {can('class:create') && (
              <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} icon={<Plus className="h-4 w-4" />}>
                New class
              </Button>
            )}
          </>
        }
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY_MS))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY_MS))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[13px] font-medium text-ink-600">
          {formatDate(weekStart, 'DD MMM')} – {formatDate(new Date(weekStart.getTime() + 6 * DAY_MS), 'DD MMM YYYY')}
        </p>
      </div>

      {error ? (
        <ErrorState title="Could not load the timetable" description={error.message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
          {days.map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
          {days.map((d) => {
            const list = byDay(d);
            const isToday = d.toDateString() === new Date().toDateString();
            return (
              <div key={d.toISOString()} className={cn('rounded-xl border bg-white', isToday ? 'border-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]/20' : 'border-ink-200')}>
                <div className={cn('border-b px-3 py-2', isToday ? 'border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/5' : 'border-ink-200 bg-ink-50')}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{formatDate(d, 'ddd')}</p>
                  <p className={cn('text-sm font-bold', isToday ? 'text-[var(--brand-primary)]' : 'text-ink-900')}>{formatDate(d, 'DD MMM')}</p>
                </div>
                <div className="space-y-2 p-2" style={{ minHeight: 120 }}>
                  {list.length === 0 ? (
                    <p className="px-1 py-4 text-center text-xs text-ink-300">No classes</p>
                  ) : (
                    list.map((s) => (
                      <button
                        key={s._id}
                        onClick={() => { setEditing(s); setShowForm(true); }}
                        className="w-full rounded-lg border border-ink-200 bg-white p-2 text-left transition hover:border-[var(--brand-primary)] hover:shadow-card"
                      >
                        <p className="text-[11px] font-semibold text-[var(--brand-primary)]">{s.startTime}–{s.endTime}</p>
                        <p className="mt-0.5 truncate text-[12px] font-medium text-ink-900">{labelOf(s.batchId, 'name', s.title)}</p>
                        <p className="truncate text-[11px] text-ink-500">{labelOf(s.teacherId, 'name', 'Unassigned')}</p>
                        {s.room && <p className="truncate text-[11px] text-ink-400">{s.room}</p>}
                        {s.status !== 'SCHEDULED' && <div className="mt-1"><StatusBadge status={s.status} /></div>}
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && <ClassFormModal session={editing} onClose={() => { setShowForm(false); setEditing(null); }} />}
      {showGenerate && <GenerateModal onClose={() => setShowGenerate(false)} />}
    </div>
  );
}

/* ------------------------------ Class editor ------------------------------- */

interface ClassForm {
  title: string; courseId: string; batchId: string; teacherId: string;
  date: string; startTime: string; endTime: string; room: string; mode: string; topic: string; status: string;
}

function ClassFormModal({ session, onClose }: { session: ClassSession | null; onClose: () => void }) {
  const isEdit = !!session;
  const confirm = useConfirm();
  const { can } = useAuth();
  const [form, setForm] = useState<ClassForm>({
    title: session?.title ?? '',
    courseId: typeof session?.courseId === 'object' ? session.courseId._id : (session?.courseId as string) ?? '',
    batchId: typeof session?.batchId === 'object' ? session.batchId._id : (session?.batchId as string) ?? '',
    teacherId: typeof session?.teacherId === 'object' ? session.teacherId._id : (session?.teacherId as string) ?? '',
    date: session?.date ? String(session.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    startTime: session?.startTime ?? '16:00',
    endTime: session?.endTime ?? '18:00',
    room: session?.room ?? '',
    mode: session?.mode ?? 'OFFLINE',
    topic: session?.topic ?? '',
    status: session?.status ?? 'SCHEDULED',
  });

  const { data: courses } = useApiQuery<{ items: Course[] }>(['courses', 'options'], '/academics/courses', { limit: 100 });
  const { data: batches } = useApiQuery<{ items: Batch[] }>(['batches', 'options'], '/academics/batches', { limit: 100 });
  const { data: teachers } = useApiQuery<{ items: Teacher[] }>(['teachers', 'options'], '/people/teachers', { limit: 100 });

  const save = useApiMutation<Record<string, unknown>>(isEdit ? `/academics/classes/${session!._id}` : '/academics/classes', {
    method: isEdit ? 'patch' : 'post',
    invalidate: ['classes', 'dashboard', 'calendar'],
    successMessage: isEdit ? 'Class updated' : 'Class scheduled',
    silentError: true,
    onSuccess: onClose,
  });

  const remove = useApiMutation<void>(`/academics/classes/${session?._id}`, {
    method: 'delete',
    invalidate: ['classes', 'dashboard'],
    successMessage: 'Class removed',
    onSuccess: onClose,
  });

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete this class?',
      description: 'Classes that already have attendance are cancelled rather than deleted.',
      confirmLabel: 'Delete class',
      danger: true,
    });
    if (ok) remove.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit class' : 'Schedule a class'}
      description="The server rejects overlapping bookings for the same teacher or room."
      size="lg"
      footer={
        <>
          {isEdit && can('class:delete') && (
            <Button variant="outline" size="sm" className="mr-auto text-rose-600" loading={remove.isPending} onClick={handleDelete}>
              Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate({ ...form, room: form.room || undefined, topic: form.topic || undefined, title: form.title || undefined })}>
            {isEdit ? 'Save changes' : 'Schedule'}
          </Button>
        </>
      }
    >
      {save.error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {save.error.isConflict ? `Scheduling clash: ${save.error.message}` : save.error.message}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Batch" required className="sm:col-span-2">
          <Select
            value={form.batchId}
            onChange={(e) => {
              const b = batches?.items.find((x) => x._id === e.target.value);
              setForm((f) => ({
                ...f,
                batchId: e.target.value,
                courseId: b ? (typeof b.courseId === 'object' ? b.courseId._id : (b.courseId as string)) : f.courseId,
                teacherId: b && b.teacherId ? (typeof b.teacherId === 'object' ? b.teacherId._id : (b.teacherId as string)) : f.teacherId,
                room: b?.room ?? f.room,
              }));
            }}
          >
            <option value="">Select a batch…</option>
            {(batches?.items ?? []).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Course" required>
          <Select value={form.courseId} onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}>
            <option value="">Select…</option>
            {(courses?.items ?? []).map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
          </Select>
        </Field>
        <Field label="Teacher" required>
          <Select value={form.teacherId} onChange={(e) => setForm((f) => ({ ...f, teacherId: e.target.value }))}>
            <option value="">Select…</option>
            {(teachers?.items ?? []).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Date" required>
          <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </Field>
        <Field label="Room">
          <Input value={form.room} placeholder="e.g. Room 204" onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))} />
        </Field>
        <Field label="Start time" required>
          <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
        </Field>
        <Field label="End time" required>
          <Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
        </Field>
        <Field label="Mode">
          <Select value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}>
            {['OFFLINE', 'ONLINE', 'HYBRID'].map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
          </Select>
        </Field>
        {isEdit && (
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {['SCHEDULED', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Topic" className="sm:col-span-2">
          <Input value={form.topic} placeholder="What will be covered?" onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} />
        </Field>
      </div>
    </Modal>
  );
}

/* --------------------------- Bulk generate modal --------------------------- */

function GenerateModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [batchId, setBatchId] = useState('');
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date(Date.now() + 30 * DAY_MS).toISOString().slice(0, 10));

  const { data: batches } = useApiQuery<{ items: Batch[] }>(['batches', 'options'], '/academics/batches', { limit: 100 });

  const generate = useApiMutation<Record<string, unknown>, { created?: number; skipped?: number }>(
    '/academics/classes/generate',
    {
      invalidate: ['classes', 'dashboard'],
      silentError: true,
      onSuccess: (res) => {
        toast.success('Classes generated', `${res.created ?? 0} created, ${res.skipped ?? 0} skipped as clashes.`);
        onClose();
      },
    },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Generate classes from a batch"
      description="Creates recurring sessions from the batch's weekly schedule. Clashes are skipped automatically."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={generate.isPending} disabled={!batchId} onClick={() => generate.mutate({ batchId, from, to })}>
            Generate
          </Button>
        </>
      }
    >
      {generate.error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {generate.error.message}
        </div>
      )}
      <div className="space-y-4">
        <Field label="Batch" required>
          <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">Select a batch…</option>
            {(batches?.items ?? []).map((b) => (
              <option key={b._id} value={b._id}>
                {b.name} — {b.schedule?.map((s) => s.day.slice(0, 3)).join(', ') || 'no schedule'}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" hint="Max 120 days">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-start gap-2 rounded-xl bg-sky-50 px-3.5 py-3">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <p className="text-[13px] text-sky-800">
            Sessions are created on the batch's scheduled weekdays only. Any slot that clashes with an existing
            booking for the same teacher or room is skipped.
          </p>
        </div>
      </div>
    </Modal>
  );
}

export const TimetableBadge = Badge;
export const TimetableEmpty = EmptyState;
export const TimetableCard = Card;
export const TimetableCardHeader = CardHeader;
