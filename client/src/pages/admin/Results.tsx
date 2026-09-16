import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Save, Award, Trash2 } from 'lucide-react';
import { useApiQuery, useApiMutation, useListQuery } from '@/hooks/useApi';
import { DataTable, Column } from '@/components/DataTable';
import {
  PageHeader, Card, CardHeader, Button, Select, Input, Badge, Avatar, Skeleton, EmptyState,
  Tabs, useToast, useConfirm,
} from '@/components/ui';
import { StatCard } from '@/components/StatCard';
import { cn, gradeStyle, labelOf, formatDate } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import type { Exam, Result } from '@/types';

export function ResultsPage() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('examId') ? 'enter' : 'list');
  return (
    <div className="space-y-5">
      <PageHeader title="Results" description="Enter exam marks and review student performance." />
      <Tabs
        tabs={[{ id: 'list', label: 'All results' }, { id: 'enter', label: 'Enter marks' }]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'list' ? <ResultsList /> : <EnterMarks initialExamId={params.get('examId') ?? ''} />}
    </div>
  );
}

/* --------------------------------- Listing -------------------------------- */

function ResultsList() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const { data: exams } = useApiQuery<{ items: Exam[] }>(['exams', 'options'], '/academics/exams', { limit: 100 });
  const list = useListQuery<Result>('results', '/academics/results');

  const remove = useApiMutation<{ id: string }>((b) => `/academics/results/${b.id}`, {
    method: 'delete',
    invalidate: ['results', 'dashboard'],
    successMessage: 'Result deleted',
  });

  const handleDelete = async (r: Result) => {
    const ok = await confirm({
      title: 'Delete this result?',
      description: 'The student’s mark for this exam will be removed.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) remove.mutate({ id: r._id });
  };

  const columns: Column<Result>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (r) => {
        const s = typeof r.studentId === 'object' ? r.studentId : null;
        return (
          <div className="flex items-center gap-2.5">
            <Avatar name={s?.name} size="xs" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink-900">{s?.name ?? '—'}</p>
              <p className="truncate text-xs text-ink-500">{s?.studentCode ?? ''}</p>
            </div>
          </div>
        );
      },
    },
    { key: 'exam', header: 'Exam', render: (r) => <span className="text-[13px]">{labelOf(r.examId, 'title', '—')}</span> },
    {
      key: 'marks',
      header: 'Marks',
      className: 'text-right',
      render: (r) => <span className="text-[13px] font-medium">{r.marksObtained} / {r.totalMarks}</span>,
    },
    {
      key: 'pct',
      header: 'Percentage',
      className: 'text-right',
      render: (r) => <span className="text-[13px] font-semibold">{r.percentage}%</span>,
    },
    {
      key: 'grade',
      header: 'Grade',
      render: (r) => (
        <span className={cn('inline-flex h-7 min-w-[34px] items-center justify-center rounded-lg px-2 text-xs font-bold', gradeStyle(r.grade))}>
          {r.grade}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Result',
      render: (r) => <Badge tone={r.passed ? 'ACTIVE' : 'CANCELLED'}>{r.passed ? 'Pass' : 'Fail'}</Badge>,
    },
    {
      key: 'del',
      header: '',
      className: 'w-px',
      render: (r) =>
        can('result:delete') ? (
          <div onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" title="Delete result" onClick={() => handleDelete(r)}>
              <Trash2 className="h-4 w-4 text-rose-500" />
            </Button>
          </div>
        ) : null,
    },
  ];

  const avg = list.items.length ? Math.round(list.items.reduce((s, r) => s + r.percentage, 0) / list.items.length) : 0;
  const passed = list.items.filter((r) => r.passed).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Results on this page" value={list.items.length} loading={list.isLoading} />
        <StatCard label="Average score" value={`${avg}%`} tone="violet" loading={list.isLoading} />
        <StatCard label="Pass rate" value={list.items.length ? `${Math.round((passed / list.items.length) * 100)}%` : '—'} tone="emerald" loading={list.isLoading} />
      </div>

      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(r) => r._id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search by student…"
        filters={[
          { key: 'examId', label: 'All exams', options: (exams?.items ?? []).map((e) => ({ value: e._id, label: e.title })) },
          { key: 'passed', label: 'Pass or fail', options: [{ value: 'true', label: 'Passed' }, { value: 'false', label: 'Failed' }] },
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
        emptyTitle="No results yet"
        emptyDescription="Enter marks for an exam and they will appear here."
      />
    </div>
  );
}

/* ------------------------------- Enter marks ------------------------------- */

interface SheetStudent {
  studentId: string;
  student: { _id: string; name: string; studentCode: string };
  marksObtained?: number;
  remarks?: string;
}

function EnterMarks({ initialExamId }: { initialExamId: string }) {
  const toast = useToast();
  const { can } = useAuth();
  const [examId, setExamId] = useState(initialExamId);
  const [marks, setMarks] = useState<Record<string, string>>({});

  const { data: exams } = useApiQuery<{ items: Exam[] }>(['exams', 'options'], '/academics/exams', { limit: 100 });
  const exam = exams?.items.find((e) => e._id === examId);

  const { data: existing, isLoading } = useApiQuery<{ items: Result[] }>(
    ['results', 'byExam', examId],
    '/academics/results',
    { examId, limit: 100 },
    { enabled: !!examId },
  );

  const { data: enrolled } = useApiQuery<{ items: { _id: string; name: string; studentCode: string }[] }>(
    ['students', 'forExam', examId],
    '/people/students',
    { limit: 100, batchId: exam && typeof exam.batchId === 'object' ? exam.batchId._id : undefined },
    { enabled: !!examId },
  );

  const rows: SheetStudent[] = (enrolled?.items ?? []).map((s) => {
    const prior = existing?.items.find((r) => (typeof r.studentId === 'object' ? r.studentId._id : r.studentId) === s._id);
    return { studentId: s._id, student: s, marksObtained: prior?.marksObtained };
  });

  const save = useApiMutation<Record<string, unknown>>(`/academics/exams/${examId}/results`, {
    invalidate: ['results', 'dashboard', 'exams'],
    onSuccess: () => toast.success('Results saved', 'Percentages and grades were calculated automatically.'),
  });

  const submit = () => {
    const entries = rows
      .map((r) => ({ studentId: r.studentId, marksObtained: Number(marks[r.studentId] ?? r.marksObtained ?? NaN) }))
      .filter((r) => Number.isFinite(r.marksObtained));
    if (!entries.length) {
      toast.error('Nothing to save', 'Enter at least one mark.');
      return;
    }
    save.mutate({ results: entries });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Choose an exam" subtitle="Grades and pass/fail are computed on the server" />
        <div className="p-4">
          <label className="label-base">Exam</label>
          <Select value={examId} onChange={(e) => { setExamId(e.target.value); setMarks({}); }}>
            <option value="">Select an exam…</option>
            {(exams?.items ?? []).map((e) => (
              <option key={e._id} value={e._id}>
                {e.title} · {formatDate(e.date, 'DD MMM')} · {e.totalMarks} marks
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {!examId ? (
        <Card>
          <EmptyState icon={<Award className="h-6 w-6" />} title="Select an exam" description="Pick an exam above to enter marks for its students." />
        </Card>
      ) : isLoading ? (
        <Card><div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div></Card>
      ) : rows.length === 0 ? (
        <Card><EmptyState title="No students found" description="This exam's batch has no enrolled students." /></Card>
      ) : (
        <Card>
          <CardHeader
            title={`${exam?.title} · out of ${exam?.totalMarks}`}
            subtitle={`${rows.length} students · pass mark ${exam?.passingMarks ?? 0}`}
          />
          <div className="divide-y divide-ink-100">
            {rows.map((r) => {
              const value = marks[r.studentId] ?? (r.marksObtained !== undefined ? String(r.marksObtained) : '');
              const num = Number(value);
              const pct = exam?.totalMarks && Number.isFinite(num) && value !== '' ? Math.round((num / exam.totalMarks) * 100) : null;
              return (
                <div key={r.studentId} className="flex items-center gap-3 px-5 py-2.5">
                  <Avatar name={r.student.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-900">{r.student.name}</p>
                    <p className="truncate text-xs text-ink-500">{r.student.studentCode}</p>
                  </div>
                  {pct !== null && (
                    <span className={cn('hidden shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold sm:inline', pct >= 40 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
                      {pct}%
                    </span>
                  )}
                  <Input
                    type="number"
                    min={0}
                    max={exam?.totalMarks}
                    className="w-24 shrink-0"
                    placeholder="—"
                    value={value}
                    onChange={(e) => setMarks((s) => ({ ...s, [r.studentId]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>
          {can('result:create') && (
            <div className="flex justify-end border-t border-ink-200/70 px-5 py-3">
              <Button loading={save.isPending} onClick={submit} icon={<Save className="h-4 w-4" />}>Save results</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
