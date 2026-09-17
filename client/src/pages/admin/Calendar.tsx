import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import {
  PageHeader, Card, Button, Modal, Field, Input, Select, Textarea, Badge, Skeleton,
  ErrorState, EmptyState, useConfirm,
} from '@/components/ui';
import { cn, formatDate, titleCase } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import type { CalendarFeedItem } from '@/types';

const EVENT_TYPES = ['CLASS', 'EXAM', 'ASSIGNMENT', 'FOLLOW_UP', 'FEE_DUE', 'HOLIDAY', 'EVENT', 'MEETING'];

/** The subset a user may create by hand; the rest are generated from other records. */
const ALLOWED_TYPES = ['EVENT', 'HOLIDAY', 'MEETING'];

/** `YYYY-MM-DD` for a Date in the *local* timezone (not the UTC slice). */
function localDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Converts a `YYYY-MM-DD` value from `<input type="date">` into the ISO-8601
 * timestamp the API expects. Anchored to UTC so the calendar grid — which
 * buckets by the UTC date portion — shows the day the user actually picked.
 */
function toIso(dateOnly: string, endOfDay: boolean): string {
  return `${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
}

/**
 * Backend field paths may be nested (e.g. `body.title`); the form keys are flat.
 * Anything that does not match a known input is surfaced under `_` so it is
 * still shown rather than silently swallowed.
 */
function mapServerFields(fields: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, message] of Object.entries(fields ?? {})) {
    const key = path.split('.').pop() || '_';
    out[['title', 'type', 'startAt', 'endAt', 'description'].includes(key) ? key : '_'] = message;
  }
  return out;
}

const TYPE_STYLE: Record<string, string> = {
  CLASS: 'bg-sky-100 text-sky-800',
  EXAM: 'bg-rose-100 text-rose-800',
  ASSIGNMENT: 'bg-violet-100 text-violet-800',
  FOLLOW_UP: 'bg-amber-100 text-amber-800',
  FEE_DUE: 'bg-orange-100 text-orange-800',
  HOLIDAY: 'bg-emerald-100 text-emerald-800',
  EVENT: 'bg-indigo-100 text-indigo-800',
  MEETING: 'bg-teal-100 text-teal-800',
};

export function CalendarPage() {
  const { can } = useAuth();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CalendarFeedItem | null>(null);

  const monthStart = new Date(cursor);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const from = monthStart.toISOString().slice(0, 10);
  const to = monthEnd.toISOString().slice(0, 10);

  const { data, isLoading, error, refetch } = useApiQuery<{ items: CalendarFeedItem[] }>(
    ['calendar', from],
    '/comm/calendar',
    { from, to },
  );

  // The aggregated feed returns { items: [{ id, type, title, start, end, ... }] }.
  const events: CalendarFeedItem[] = data?.items ?? [];

  // Build a Monday-first grid covering the whole month.
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const daysInMonth = monthEnd.getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsOn = (d: Date) => {
    // Compare on the local calendar date rather than the UTC slice of the
    // timestamp, so an evening class does not jump to the next/previous cell
    // for users in a non-UTC timezone.
    const key = localDateKey(d);
    return events.filter((e) => (e.start ? localDateKey(new Date(e.start)) : '') === key);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        description="Classes, exams, fee dues and holidays in one view."
        actions={
          can('calendar:create') ? (
            <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} icon={<Plus className="h-4 w-4" />}>
              New event
            </Button>
          ) : undefined
        }
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="font-display text-base font-bold text-ink-900">{formatDate(cursor, 'MMMM YYYY')}</p>
      </div>

      {error ? (
        <ErrorState title="Could not load the calendar" description={error.message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-[520px] w-full" />
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-ink-200 bg-ink-50">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-ink-500">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const dayEvents = d ? eventsOn(d) : [];
              const isToday = d && d.toDateString() === new Date().toDateString();
              return (
                <div
                  key={i}
                  className={cn(
                    'min-h-[96px] border-b border-r border-ink-100 p-1.5',
                    !d && 'bg-ink-50/50',
                    isToday && 'bg-[var(--brand-primary)]/5',
                  )}
                >
                  {d && (
                    <>
                      <p className={cn('mb-1 text-xs font-semibold', isToday ? 'text-[var(--brand-primary)]' : 'text-ink-500')}>
                        {d.getDate()}
                      </p>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map((e) => (
                          <button
                            key={e.id}
                            onClick={() => { setEditing(e); setShowForm(true); }}
                            className={cn('block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium', TYPE_STYLE[e.type] ?? 'bg-ink-100 text-ink-700')}
                            title={e.title}
                          >
                            {e.title}
                          </button>
                        ))}
                        {dayEvents.length > 3 && (
                          <p className="px-1.5 text-[10px] text-ink-400">+{dayEvents.length - 3} more</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!isLoading && events.length === 0 && (
        <Card>
          <EmptyState
            icon={<CalendarDays className="h-6 w-6" />}
            title="Nothing scheduled this month"
            description="Classes, exams and fee dues appear here automatically. You can also add your own events."
          />
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {EVENT_TYPES.map((t) => (
          <span key={t} className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TYPE_STYLE[t])}>{titleCase(t)}</span>
        ))}
      </div>

      {showForm && <EventModal event={editing} onClose={() => { setShowForm(false); setEditing(null); }} />}
    </div>
  );
}

function EventModal({ event, onClose }: { event: CalendarFeedItem | null; onClose: () => void }) {
  const isEdit = !!event;
  const { can } = useAuth();
  const confirm = useConfirm();
  const isSystem = !!event && ['CLASS', 'EXAM', 'ASSIGNMENT', 'FEE_DUE', 'FOLLOW_UP'].includes(event.type);

  const [form, setForm] = useState({
    title: event?.title ?? '',
    type: event?.type ?? 'EVENT',
    startAt: String(event?.start ?? new Date().toISOString()).slice(0, 10),
    endAt: event?.end ? String(event.end).slice(0, 10) : '',
    description: event?.meta?.description ?? '',
    allDay: true,
  });

  /** Field-level messages, keyed by form field name. */
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setField = (name: keyof typeof form, value: string | boolean) => {
    setForm((f) => ({ ...f, [name]: value }));
    // Clear the message as soon as the user edits the offending field.
    setErrors((e) => {
      if (!e[name]) return e;
      const next = { ...e };
      delete next[name];
      return next;
    });
  };

  /**
   * Client-side validation mirroring server/src/validators/communication.validators.ts
   * exactly, so the user gets an instant, specific reason instead of a round-trip
   * and a generic banner.
   */
  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    const title = form.title.trim();

    if (!title) next.title = 'Title is required';
    else if (title.length < 2) next.title = 'Title must be at least 2 characters';
    else if (title.length > 160) next.title = 'Title must be 160 characters or fewer';

    if (!ALLOWED_TYPES.includes(form.type)) next.type = 'Choose a valid event type';

    if (!form.startAt) next.startAt = 'Start date is required';
    else if (Number.isNaN(Date.parse(form.startAt))) next.startAt = 'Enter a valid start date';

    if (form.endAt) {
      if (Number.isNaN(Date.parse(form.endAt))) next.endAt = 'Enter a valid end date';
      else if (!next.startAt && new Date(form.endAt) < new Date(form.startAt)) {
        next.endAt = 'End date must be on or after the start date';
      }
    }

    if (form.description.trim().length > 2000) {
      next.description = 'Description must be 2000 characters or fewer';
    }
    return next;
  };

  const save = useApiMutation<Record<string, unknown>>(
    isEdit ? `/comm/calendar/events/${event!.id}` : '/comm/calendar/events',
    {
      method: isEdit ? 'patch' : 'post',
      invalidate: ['calendar'],
      successMessage: isEdit ? 'Event updated' : 'Event created',
      silentError: true,
      onSuccess: onClose,
    },
  );

  const submit = () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    // Send dates as full ISO timestamps and omit empty optional fields entirely,
    // rather than sending '' which the backend would reject.
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      type: form.type,
      startAt: toIso(form.startAt, false),
      allDay: form.allDay,
    };
    if (form.endAt) payload.endAt = toIso(form.endAt, form.allDay);
    if (form.description.trim()) payload.description = form.description.trim();

    save.mutate(payload, {
      // Surface whatever the backend flagged next to the right input.
      onError: (err) => setErrors(mapServerFields(err.fields)),
    });
  };

  const remove = useApiMutation<void>(`/comm/calendar/events/${event?.id}`, {
    method: 'delete',
    invalidate: ['calendar'],
    successMessage: 'Event deleted',
    onSuccess: onClose,
  });

  const handleDelete = async () => {
    const ok = await confirm({ title: `Delete "${event!.title}"?`, description: 'It will be removed from the calendar.', confirmLabel: 'Delete', danger: true });
    if (ok) remove.mutate();
  };

  if (isSystem) {
    return (
      <Modal open onClose={onClose} title={event!.title} description={titleCase(event!.type)} size="sm"
        footer={<Button variant="outline" size="sm" onClick={onClose}>Close</Button>}>
        <div className="space-y-2">
          <Badge>{titleCase(event!.type)}</Badge>
          <p className="text-[13px] text-ink-600">{formatDate(event!.start, 'DD MMM YYYY')}</p>
          {event!.meta?.description && <p className="text-[13px] text-ink-700">{event!.meta.description}</p>}
          <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
            This entry is generated from your {titleCase(event!.type).toLowerCase()} records and is managed on that page.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit event' : 'New event'}
      size="md"
      footer={
        <>
          {isEdit && can('calendar:delete') && (
            <Button variant="outline" size="sm" className="mr-auto text-rose-600" loading={remove.isPending} onClick={handleDelete}>Delete</Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={save.isPending} onClick={submit}>
            {isEdit ? 'Save changes' : 'Create event'}
          </Button>
        </>
      }
    >
      {/*
        Only show a banner for errors that are NOT tied to a field (auth, plan
        limits, server faults). Field-level problems are shown beside the input
        they belong to, so the user is never left hunting for the cause.
      */}
      {save.error && !Object.keys(errors).length && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{save.error.message}</div>
      )}
      {errors._ && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{errors._}</div>
      )}
      <div className="space-y-4">
        <Field label="Title" required error={errors.title}>
          <Input
            value={form.title}
            invalid={!!errors.title}
            onChange={(e) => setField('title', e.target.value)}
            placeholder="e.g. Parent-teacher meeting"
          />
        </Field>
        <Field label="Type" error={errors.type}>
          <Select value={form.type} invalid={!!errors.type} onChange={(e) => setField('type', e.target.value)}>
            {ALLOWED_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date" required error={errors.startAt}>
            <Input
              type="date"
              value={form.startAt}
              invalid={!!errors.startAt}
              onChange={(e) => setField('startAt', e.target.value)}
            />
          </Field>
          <Field label="End date" error={errors.endAt} hint="Optional — leave blank for a single-day event">
            <Input
              type="date"
              value={form.endAt}
              min={form.startAt || undefined}
              invalid={!!errors.endAt}
              onChange={(e) => setField('endAt', e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Description"
          error={errors.description}
          hint={`Optional — ${form.description.trim().length}/2000 characters`}
        >
          <Textarea
            value={form.description}
            invalid={!!errors.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="Optional details"
          />
        </Field>
      </div>
    </Modal>
  );
}
