import { useState, useEffect } from 'react';
import { CalendarCheck, Check, X, Clock, FileMinus, Save } from 'lucide-react';
import { useApiQuery, useApiMutation, useListQuery } from '@/hooks/useApi';
import { DataTable, Column } from '@/components/DataTable';
import {
  PageHeader, Card, CardHeader, Button, Select, Badge, Avatar, Skeleton, EmptyState, ErrorState,
  Tabs, useToast, ProgressBar,
} from '@/components/ui';
import { StatCard } from '@/components/StatCard';
import { cn, formatDate, labelOf } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import type { ClassSession, Batch } from '@/types';

type Mark = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';

interface SheetRow {
  studentId: string;
  student: { _id: string; name: string; studentCode: string };
  status?: Mark;
}
interface Sheet {
  classSession: ClassSession;
  rows: SheetRow[];
  marked: boolean;
}
interface ReportRow {
  studentId: string;
  student: { _id: string; name: string; studentCode: string };
  total: number; present: number; late: number; absent: number; leave: number; percentage: number;
}

export function AttendancePage() {
  const [tab, setTab] = useState('mark');
  return (
    <div className="space-y-5">
      <PageHeader title="Attendance" description="Mark today's registers and review attendance history." />
      <Tabs
        tabs={[
          { id: 'mark', label: 'Mark attendance' },
          { id: 'report', label: 'Attendance report' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'mark' ? <MarkAttendance /> : <AttendanceReport />}
    </div>
  );
}

/* ------------------------------ Mark register ------------------------------ */

function MarkAttendance() {
  const toast = useToast();
  const { can } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [classId, setClassId] = useState('');
  const [marks, setMarks] = useState<Record<string, Mark>>({});

  const { data: classes, isLoading: classesLoading } = useApiQuery<{ items: ClassSession[] }>(
    ['classes', date],
    '/academics/classes',
    { date, limit: 100 },
  );

  const { data: sheet, isLoading: sheetLoading, error } = useApiQuery<Sheet>(
    ['attendance', 'sheet', classId],
    `/academics/attendance/sheet/${classId}`,
    undefined,
    { enabled: !!classId },
  );

  // React Query v5 removed the onSuccess callback, so seed the editable marks
  // from the fetched sheet whenever a new sheet arrives.
  const sheetKey = sheet?.classSession?._id;
  useEffect(() => {
    if (!sheet) return;
    const initial: Record<string, Mark> = {};
    for (const r of sheet.rows ?? []) initial[r.studentId] = r.status ?? 'PRESENT';
    setMarks(initial);
  }, [sheetKey, sheet]);

  const save = useApiMutation<Record<string, unknown>>('/academics/attendance', {
    invalidate: ['attendance', 'classes', 'dashboard'],
    successMessage: 'Attendance saved',
    onSuccess: () => toast.success('Attendance saved', 'The register has been recorded.'),
  });

  const rows = sheet?.rows ?? [];
  const counts = rows.reduce(
    (acc, r) => {
      const m = marks[r.studentId] ?? 'PRESENT';
      acc[m] = (acc[m] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const setAll = (m: Mark) => {
    const next: Record<string, Mark> = {};
    for (const r of rows) next[r.studentId] = m;
    setMarks(next);
  };

  const submit = () =>
    save.mutate({
      classSessionId: classId,
      records: rows.map((r) => ({ studentId: r.studentId, status: marks[r.studentId] ?? 'PRESENT' })),
    });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Choose a class" subtitle="Pick a date, then the session you want to mark" />
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <div>
            <label className="label-base">Date</label>
            <input
              type="date"
              className="input-base"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setClassId('');
              }}
            />
          </div>
          <div>
            <label className="label-base">Class session</label>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={classesLoading}>
              <option value="">
                {classesLoading ? 'Loading…' : (classes?.items?.length ? 'Select a class…' : 'No classes on this date')}
              </option>
              {(classes?.items ?? []).map((c) => (
                <option key={c._id} value={c._id}>
                  {c.startTime} · {labelOf(c.batchId, 'name', c.title)}{c.attendanceMarked ? ' (marked)' : ''}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {!classId ? (
        <Card>
          <EmptyState
            icon={<CalendarCheck className="h-6 w-6" />}
            title="Select a class to begin"
            description="Choose a date and class session above to load its register."
          />
        </Card>
      ) : sheetLoading ? (
        <Card><div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div></Card>
      ) : error ? (
        <ErrorState title="Could not load the register" description={error.message} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState title="No students in this batch" description="Enrol students into the batch before marking attendance." />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={`Register · ${rows.length} students`}
            subtitle={sheet?.marked ? 'Already marked — saving will update the existing records' : 'Not marked yet'}
            action={
              <div className="flex flex-wrap gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setAll('PRESENT')}>All present</Button>
                <Button variant="outline" size="sm" onClick={() => setAll('ABSENT')}>All absent</Button>
              </div>
            }
          />

          <div className="flex flex-wrap gap-2 border-b border-ink-200/70 px-5 py-3">
            <Badge tone="ACTIVE">{counts.PRESENT ?? 0} present</Badge>
            <Badge tone="CANCELLED">{counts.ABSENT ?? 0} absent</Badge>
            <Badge tone="PENDING">{counts.LATE ?? 0} late</Badge>
            <Badge>{counts.LEAVE ?? 0} on leave</Badge>
          </div>

          <div className="divide-y divide-ink-100">
            {rows.map((r) => (
              <div key={r.studentId} className="flex items-center gap-3 px-5 py-2.5">
                <Avatar name={r.student?.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink-900">{r.student?.name}</p>
                  <p className="truncate text-xs text-ink-500">{r.student?.studentCode}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {(['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as Mark[]).map((m) => {
                    const active = (marks[r.studentId] ?? 'PRESENT') === m;
                    const Icon = m === 'PRESENT' ? Check : m === 'ABSENT' ? X : m === 'LATE' ? Clock : FileMinus;
                    return (
                      <button
                        key={m}
                        title={m}
                        onClick={() => setMarks((s) => ({ ...s, [r.studentId]: m }))}
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset transition',
                          active && m === 'PRESENT' && 'bg-emerald-500 text-white ring-transparent',
                          active && m === 'ABSENT' && 'bg-rose-500 text-white ring-transparent',
                          active && m === 'LATE' && 'bg-amber-500 text-white ring-transparent',
                          active && m === 'LEAVE' && 'bg-sky-500 text-white ring-transparent',
                          !active && 'bg-white text-ink-400 ring-ink-200 hover:bg-ink-50',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {can('attendance:create') && (
            <div className="flex justify-end border-t border-ink-200/70 px-5 py-3">
              <Button loading={save.isPending} onClick={submit} icon={<Save className="h-4 w-4" />}>
                Save attendance
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/* ---------------------------- Attendance report ---------------------------- */

function AttendanceReport() {
  const { data: batches } = useApiQuery<{ items: Batch[] }>(['batches', 'options'], '/academics/batches', { limit: 100 });
  const list = useListQuery<ReportRow>('attendance-report', '/academics/attendance/report');

  const columns: Column<ReportRow>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.student?.name} size="xs" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink-900">{r.student?.name}</p>
            <p className="truncate text-xs text-ink-500">{r.student?.studentCode}</p>
          </div>
        </div>
      ),
    },
    { key: 'total', header: 'Classes', className: 'text-right', render: (r) => <span className="text-[13px]">{r.total}</span> },
    { key: 'present', header: 'Present', className: 'text-right', hideBelow: 'md', render: (r) => <span className="text-[13px] text-emerald-700">{r.present}</span> },
    { key: 'absent', header: 'Absent', className: 'text-right', hideBelow: 'md', render: (r) => <span className="text-[13px] text-rose-700">{r.absent}</span> },
    { key: 'late', header: 'Late', className: 'text-right', hideBelow: 'xl', render: (r) => <span className="text-[13px] text-amber-700">{r.late}</span> },
    {
      key: 'pct',
      header: 'Attendance',
      render: (r) => (
        <div className="w-32">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className={cn('font-semibold', r.percentage >= 75 ? 'text-emerald-700' : r.percentage >= 60 ? 'text-amber-700' : 'text-rose-700')}>
              {r.percentage}%
            </span>
          </div>
          <ProgressBar value={r.percentage} tone={r.percentage >= 75 ? 'emerald' : r.percentage >= 60 ? 'amber' : 'rose'} />
        </div>
      ),
    },
  ];

  const avg = list.items.length
    ? Math.round(list.items.reduce((s, r) => s + r.percentage, 0) / list.items.length)
    : 0;
  const below = list.items.filter((r) => r.percentage < 75).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Students tracked" value={list.items.length} loading={list.isLoading} />
        <StatCard label="Average attendance" value={`${avg}%`} tone={avg >= 75 ? 'emerald' : 'amber'} loading={list.isLoading} />
        <StatCard label="Below 75%" value={below} tone={below ? 'rose' : 'emerald'} loading={list.isLoading} />
      </div>

      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(r) => r.studentId}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search students…"
        filters={[
          { key: 'batchId', label: 'All batches', options: (batches?.items ?? []).map((b) => ({ value: b._id, label: b.name })) },
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
        emptyTitle="No attendance recorded yet"
        emptyDescription="Mark a class register and the summary will appear here."
      />
    </div>
  );
}

export const attendanceDate = formatDate;
