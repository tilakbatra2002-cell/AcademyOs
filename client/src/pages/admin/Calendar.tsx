import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import {
  PageHeader, Card, Button, Modal, Field, Input, Select, Textarea, Badge, Skeleton,
  ErrorState, EmptyState, useConfirm,
} from '@/components/ui';
import { cn, formatDate, titleCase } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import type { CalendarEvent } from '@/types';

const EVENT_TYPES = ['CLASS', 'EXAM', 'ASSIGNMENT', 'FOLLOW_UP', 'FEE_DUE', 'HOLIDAY', 'EVENT', 'MEETING'];

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
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  const monthStart = new Date(cursor);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const from = monthStart.toISOString().slice(0, 10);
  const to = monthEnd.toISOString().slice(0, 10);

  const { data, isLoading, error, refetch } = useApiQuery<{ events: CalendarEvent[] } | { items: CalendarEvent[] }>(
    ['calendar', from],
    '/comm/calendar',
    { from, to },
  );

  const events: CalendarEvent[] =
    (data as { events?: CalendarEvent[] })?.events ?? (data as { items?: CalendarEvent[] })?.items ?? [];

  // Build a Monday-first grid covering the whole month.
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const daysInMonth = monthEnd.getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsOn = (d: Date) => {
    const key = d.toISOString().slice(0, 10);
    return events.filter((e) => String(e.startAt ?? e.date ?? '').slice(0, 10) === key);
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
                            key={e._id}
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

function EventModal({ event, onClose }: { event: CalendarEvent | null; onClose: () => void }) {
  const isEdit = !!event;
  const { can } = useAuth();
  const confirm = useConfirm();
  const isSystem = !!event && ['CLASS', 'EXAM', 'ASSIGNMENT', 'FEE_DUE', 'FOLLOW_UP'].includes(event.type);

  const [form, setForm] = useState({
    title: event?.title ?? '',
    type: event?.type ?? 'EVENT',
    startAt: String(event?.startAt ?? event?.date ?? new Date().toISOString()).slice(0, 10),
    endAt: event?.endAt ? String(event.endAt).slice(0, 10) : '',
    description: event?.description ?? '',
    allDay: event?.allDay ?? true,
  });

  const save = useApiMutation<Record<string, unknown>>(
    isEdit ? `/comm/calendar/events/${event!._id}` : '/comm/calendar/events',
    {
      method: isEdit ? 'patch' : 'post',
      invalidate: ['calendar'],
      successMessage: isEdit ? 'Event updated' : 'Event created',
      silentError: true,
      onSuccess: onClose,
    },
  );

  const remove = useApiMutation<void>(`/comm/calendar/events/${event?._id}`, {
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
          <p className="text-[13px] text-ink-600">{formatDate(event!.startAt ?? event!.date, 'DD MMM YYYY')}</p>
          {event!.description && <p className="text-[13px] text-ink-700">{event!.description}</p>}
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
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate({ ...form, endAt: form.endAt || undefined, description: form.description || undefined })}>
            {isEdit ? 'Save changes' : 'Create event'}
          </Button>
        </>
      }
    >
      {save.error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{save.error.message}</div>
      )}
      <div className="space-y-4">
        <Field label="Title" required>
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Parent-teacher meeting" />
        </Field>
        <Field label="Type">
          <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            {['EVENT', 'HOLIDAY', 'MEETING'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date" required>
            <Input type="date" value={form.startAt} onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))} />
          </Field>
          <Field label="End date">
            <Input type="date" value={form.endAt} onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional details" />
        </Field>
      </div>
    </Modal>
  );
}
