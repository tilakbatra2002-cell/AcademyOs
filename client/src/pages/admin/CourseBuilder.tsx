import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Pencil, Trash2, GripVertical, ChevronDown, ChevronRight, Video, FileText,
  BookOpen, Clock, Layers,
} from 'lucide-react';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import {
  PageHeader, Card, Button, Modal, Field, Input, Select, Textarea, Badge,
  Skeleton, ErrorState, EmptyState, useConfirm, useToast,
} from '@/components/ui';
import { cn, formatDuration, titleCase } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import type { Course, CourseModule, Lesson } from '@/types';

interface BuilderData {
  course: Course;
  modules: (CourseModule & { lessons?: Lesson[] })[];
  lessons?: Lesson[];
}

export function CourseBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [moduleForm, setModuleForm] = useState<{ open: boolean; row: CourseModule | null }>({ open: false, row: null });
  const [lessonForm, setLessonForm] = useState<{ open: boolean; moduleId: string; row: Lesson | null }>({ open: false, moduleId: '', row: null });
  const [dragging, setDragging] = useState<{ type: 'module' | 'lesson'; id: string; moduleId?: string } | null>(null);

  const { data, isLoading, error, refetch } = useApiQuery<BuilderData>(['courses', id, 'builder'], `/academics/courses/${id}`);

  const reorderModules = useApiMutation<{ order: string[] }>('/academics/modules/reorder', {
    invalidate: ['courses'],
    silentError: true,
  });
  const reorderLessons = useApiMutation<{ moduleId: string; order: string[] }>('/academics/lessons/reorder', {
    invalidate: ['courses'],
    silentError: true,
  });

  const deleteModule = useApiMutation<{ id: string }>((b) => `/academics/modules/${b.id}`, {
    method: 'delete', invalidate: ['courses'], successMessage: 'Module deleted',
  });
  const deleteLesson = useApiMutation<{ id: string }>((b) => `/academics/lessons/${b.id}`, {
    method: 'delete', invalidate: ['courses'], successMessage: 'Lesson deleted',
  });

  if (isLoading) return <div className="space-y-5"><Skeleton className="h-9 w-64" /><Skeleton className="h-96" /></div>;
  if (error || !data) {
    return (
      <ErrorState
        title={error?.isNotFound ? 'Course not found' : 'Could not load the course'}
        description={error?.isNotFound ? 'It may have been deleted, or belongs to another academy.' : error?.message}
        onRetry={error?.isNotFound ? undefined : () => refetch()}
      />
    );
  }

  const course = data.course;
  const modules = [...(data.modules ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const lessonsFor = (m: CourseModule & { lessons?: Lesson[] }) =>
    [...(m.lessons ?? (data.lessons ?? []).filter((l) => String(typeof l.moduleId === 'object' ? l.moduleId?._id : l.moduleId) === m._id))]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const totalLessons = modules.reduce((s, m) => s + lessonsFor(m).length, 0);
  const totalDuration = modules.reduce((s, m) => s + lessonsFor(m).reduce((x, l) => x + (l.durationMinutes ?? 0), 0), 0);

  const onDropModule = (targetId: string) => {
    if (!dragging || dragging.type !== 'module' || dragging.id === targetId) return;
    const ids = modules.map((m) => m._id);
    const from = ids.indexOf(dragging.id);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorderModules.mutate({ order: ids }, {
      onSuccess: () => toast.success('Modules reordered'),
      onError: (e) => toast.error('Could not reorder', e.message),
    });
    setDragging(null);
  };

  const onDropLesson = (moduleId: string, targetId: string) => {
    if (!dragging || dragging.type !== 'lesson' || dragging.id === targetId) return;
    const mod = modules.find((m) => m._id === moduleId);
    if (!mod) return;
    const ids = lessonsFor(mod).map((l) => l._id);
    const from = ids.indexOf(dragging.id);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorderLessons.mutate({ moduleId, order: ids }, {
      onSuccess: () => toast.success('Lessons reordered'),
      onError: (e) => toast.error('Could not reorder', e.message),
    });
    setDragging(null);
  };

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/admin/courses')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 transition hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back to courses
      </button>

      <PageHeader
        title={course.title}
        description={`${course.code} · curriculum builder`}
        actions={
          can('course:update') ? (
            <Button size="sm" onClick={() => setModuleForm({ open: true, row: null })} icon={<Plus className="h-4 w-4" />}>
              Add module
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat icon={<Layers className="h-4 w-4" />} label="Modules" value={modules.length} />
        <Stat icon={<BookOpen className="h-4 w-4" />} label="Lessons" value={totalLessons} />
        <Stat icon={<Clock className="h-4 w-4" />} label="Duration" value={formatDuration(totalDuration * 60)} />
        <Stat icon={<Badge tone={course.status}>{titleCase(course.status)}</Badge>} label="Status" value="" />
      </div>

      {modules.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Layers className="h-6 w-6" />}
            title="No modules yet"
            description="Break your course into modules, then add lessons and videos inside each one."
            action={can('course:update') ? <Button size="sm" onClick={() => setModuleForm({ open: true, row: null })} icon={<Plus className="h-4 w-4" />}>Add the first module</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {modules.map((m, mi) => {
            const lessons = lessonsFor(m);
            const isOpen = expanded[m._id] ?? true;
            return (
              <Card
                key={m._id}
                draggable={can('course:update')}
                onDragStart={() => setDragging({ type: 'module', id: m._id })}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDropModule(m._id)}
                className={cn(dragging?.id === m._id && 'opacity-50')}
              >
                <div className="flex items-center gap-2 border-b border-ink-200/70 px-4 py-3">
                  {can('course:update') && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-ink-300" />}
                  <button onClick={() => setExpanded((s) => ({ ...s, [m._id]: !isOpen }))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />}
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink-100 text-xs font-bold text-ink-600">{mi + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-ink-900">{m.title}</p>
                      <p className="truncate text-xs text-ink-500">{lessons.length} lesson{lessons.length === 1 ? '' : 's'}</p>
                    </div>
                  </button>
                  {can('course:update') && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon" title="Add lesson" onClick={() => setLessonForm({ open: true, moduleId: m._id, row: null })}>
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Edit module" onClick={() => setModuleForm({ open: true, row: m })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" title="Delete module"
                        onClick={async () => {
                          const ok = await confirm({ title: `Delete "${m.title}"?`, description: `Its ${lessons.length} lesson(s) will also be removed.`, confirmLabel: 'Delete', danger: true });
                          if (ok) deleteModule.mutate({ id: m._id });
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </div>
                  )}
                </div>

                {isOpen && (
                  lessons.length === 0 ? (
                    <p className="px-5 py-4 text-[13px] text-ink-400">No lessons in this module yet.</p>
                  ) : (
                    <div className="divide-y divide-ink-100">
                      {lessons.map((l, li) => (
                        <div
                          key={l._id}
                          draggable={can('course:update')}
                          onDragStart={(e) => { e.stopPropagation(); setDragging({ type: 'lesson', id: l._id, moduleId: m._id }); }}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={(e) => { e.stopPropagation(); onDropLesson(m._id, l._id); }}
                          className={cn('flex items-center gap-2.5 px-5 py-2.5', dragging?.id === l._id && 'opacity-50')}
                        >
                          {can('course:update') && <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-ink-300" />}
                          <span className="text-xs font-medium text-ink-400">{mi + 1}.{li + 1}</span>
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                            {l.type === 'VIDEO' ? <Video className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-ink-900">{l.title}</p>
                            <p className="truncate text-xs text-ink-500">
                              {titleCase(l.type ?? 'LESSON')}{l.durationMinutes ? ` · ${l.durationMinutes} min` : ''}
                              {l.isFreePreview ? ' · free preview' : ''}
                            </p>
                          </div>
                          {can('course:update') && (
                            <div className="flex shrink-0 items-center gap-1">
                              <Button variant="ghost" size="icon" title="Edit lesson" onClick={() => setLessonForm({ open: true, moduleId: m._id, row: l })}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" title="Delete lesson"
                                onClick={async () => {
                                  const ok = await confirm({ title: `Delete "${l.title}"?`, description: 'Student progress for this lesson will be removed.', confirmLabel: 'Delete', danger: true });
                                  if (ok) deleteLesson.mutate({ id: l._id });
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-rose-500" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}
              </Card>
            );
          })}
        </div>
      )}

      {moduleForm.open && (
        <ModuleModal courseId={id!} module={moduleForm.row} onClose={() => setModuleForm({ open: false, row: null })} />
      )}
      {lessonForm.open && (
        <LessonModal courseId={id!} moduleId={lessonForm.moduleId} lesson={lessonForm.row} onClose={() => setLessonForm({ open: false, moduleId: '', row: null })} />
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 text-ink-400">{icon}<span className="text-xs font-medium text-ink-500">{label}</span></div>
      {value !== '' && <p className="mt-1 font-display text-lg font-bold text-ink-900">{value}</p>}
    </div>
  );
}

function ModuleModal({ courseId, module, onClose }: { courseId: string; module: CourseModule | null; onClose: () => void }) {
  const isEdit = !!module;
  const [title, setTitle] = useState(module?.title ?? '');
  const [description, setDescription] = useState(module?.description ?? '');

  const save = useApiMutation<Record<string, unknown>>(
    isEdit ? `/academics/modules/${module!._id}` : `/academics/courses/${courseId}/modules`,
    { method: isEdit ? 'patch' : 'post', invalidate: ['courses'], successMessage: isEdit ? 'Module updated' : 'Module added', silentError: true, onSuccess: onClose },
  );

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit module' : 'Add module'} size="md"
      footer={<>
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={save.isPending} onClick={() => save.mutate({ title, description: description || undefined })}>
          {isEdit ? 'Save changes' : 'Add module'}
        </Button>
      </>}>
      {save.error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{save.error.message}</div>}
      <div className="space-y-4">
        <Field label="Module title" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mechanics" />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this module cover?" />
        </Field>
      </div>
    </Modal>
  );
}

function LessonModal({ courseId, moduleId, lesson, onClose }: { courseId: string; moduleId: string; lesson: Lesson | null; onClose: () => void }) {
  const isEdit = !!lesson;
  const [form, setForm] = useState<{
    title: string; type: string; durationMinutes: number; content: string;
    videoUrl: string; isFreePreview: boolean; moduleId: string;
  }>({
    title: lesson?.title ?? '',
    type: lesson?.type ?? 'VIDEO',
    durationMinutes: lesson?.durationMinutes ?? 30,
    content: lesson?.content ?? '',
    videoUrl: lesson?.videoUrl ?? '',
    isFreePreview: lesson?.isFreePreview ?? false,
    moduleId,
  });

  const save = useApiMutation<Record<string, unknown>>(
    isEdit ? `/academics/lessons/${lesson!._id}` : `/academics/courses/${courseId}/lessons`,
    { method: isEdit ? 'patch' : 'post', invalidate: ['courses'], successMessage: isEdit ? 'Lesson updated' : 'Lesson added', silentError: true, onSuccess: onClose },
  );

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit lesson' : 'Add lesson'} size="lg"
      footer={<>
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={save.isPending} onClick={() => save.mutate({
          ...form,
          durationMinutes: Number(form.durationMinutes),
          content: form.content || undefined,
          videoUrl: form.videoUrl || undefined,
        })}>
          {isEdit ? 'Save changes' : 'Add lesson'}
        </Button>
      </>}>
      {save.error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{save.error.message}</div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Lesson title" required className="sm:col-span-2">
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Newton's second law" />
        </Field>
        <Field label="Type">
          <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            {['VIDEO', 'TEXT', 'QUIZ', 'ASSIGNMENT', 'LIVE'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </Select>
        </Field>
        <Field label="Duration (minutes)">
          <Input type="number" min={0} value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))} />
        </Field>
        {form.type === 'VIDEO' && (
          <Field label="Video URL" className="sm:col-span-2" hint="YouTube, Vimeo or a direct file URL">
            <Input value={form.videoUrl} onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))} placeholder="https://…" />
          </Field>
        )}
        <Field label="Content / notes" className="sm:col-span-2">
          <Textarea rows={4} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="Lesson notes shown to students" />
        </Field>
        <label className="flex items-center gap-2.5 sm:col-span-2">
          <input type="checkbox" checked={form.isFreePreview} onChange={(e) => setForm((f) => ({ ...f, isFreePreview: e.target.checked }))} className="h-4 w-4 rounded border-ink-300 text-[var(--brand-primary)]" />
          <span className="text-sm text-ink-700">Free preview — visible without enrolment</span>
        </label>
      </div>
    </Modal>
  );
}
