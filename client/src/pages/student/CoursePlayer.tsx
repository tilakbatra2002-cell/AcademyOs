import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, PlayCircle, CheckCircle2, Circle, FileText, ChevronDown, ChevronRight, Download,
  Lock, ListChecks, Menu, X,
} from 'lucide-react';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import {
  Card, Button, Skeleton, EmptyState, ErrorState, ProgressBar, Badge, useToast,
} from '@/components/ui';
import { cn, formatDuration } from '@/lib/utils';
import { downloadFile, ApiError } from '@/lib/api';

interface PlaybackInfo { kind: string; url: string; provider: string }
interface LearnLesson {
  _id: string; title: string; description?: string; type: string; order: number;
  durationSeconds?: number; isPreview?: boolean; locked?: boolean;
  content?: string;
  video?: { _id: string; title: string; durationSeconds?: number; thumbnailUrl?: string; playback?: PlaybackInfo } | null;
  quiz?: { _id: string; title: string; questionCount?: number } | null;
  materials?: { _id: string; title: string; type: string }[];
  progress?: { completed?: boolean; percent?: number; lastPositionSeconds?: number };
}
interface LearnModule {
  _id: string; title: string; description?: string; order: number;
  lessons: LearnLesson[]; progressPercent?: number; completedLessons?: number;
}
interface LearnData {
  course: { _id: string; title: string; description?: string; code: string };
  enrollment: { progressPercent: number; completedLessons: number; totalLessons: number };
  modules: LearnModule[];
  continueFrom?: { lessonId?: string; positionSeconds?: number; percent?: number };
}

export function CoursePlayer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const savedInitialPosition = useRef(false);

  const { data, isLoading, error, refetch } = useApiQuery<LearnData>(
    ['me', 'learn', id],
    `/portal/me/courses/${id}/learn`,
  );

  const allLessons = useMemo(
    () => (data?.modules ?? []).flatMap((m) => m.lessons.map((l) => ({ ...l, moduleId: m._id }))),
    [data],
  );

  // Open on the lesson the student last watched.
  useEffect(() => {
    if (!data || activeId) return;
    const target = data.continueFrom?.lessonId ?? allLessons[0]?._id ?? null;
    setActiveId(target);
    const mod = data.modules.find((m) => m.lessons.some((l) => l._id === target));
    if (mod) setOpen((s) => ({ ...s, [mod._id]: true }));
  }, [data, activeId, allLessons]);

  const active = allLessons.find((l) => l._id === activeId) ?? null;
  const activeIndex = allLessons.findIndex((l) => l._id === activeId);

  const saveProgress = useApiMutation<
    { lessonId: string; positionSeconds: number; percent?: number; completed?: boolean }
  >((b) => `/portal/me/lessons/${b.lessonId}/progress`, {
    invalidate: ['me', 'dashboard'],
    silentError: true,
  });

  // Resume from the stored position once the element has metadata.
  useEffect(() => {
    savedInitialPosition.current = false;
  }, [activeId]);

  const handleLoadedMetadata = () => {
    const el = videoRef.current;
    if (!el || savedInitialPosition.current) return;
    const resumeAt =
      active?.progress?.lastPositionSeconds ??
      (active?._id === data?.continueFrom?.lessonId ? data?.continueFrom?.positionSeconds : 0) ??
      0;
    if (resumeAt > 0 && resumeAt < el.duration - 5) el.currentTime = resumeAt;
    savedInitialPosition.current = true;
  };

  // Persist position every 15s of playback, and on completion.
  const lastSent = useRef(0);
  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el || !active) return;
    const now = Date.now();
    if (now - lastSent.current < 15000) return;
    lastSent.current = now;
    const percent = el.duration ? Math.min(100, Math.round((el.currentTime / el.duration) * 100)) : 0;
    saveProgress.mutate({ lessonId: active._id, positionSeconds: Math.floor(el.currentTime), percent });
  };

  const markComplete = (lesson: LearnLesson) => {
    saveProgress.mutate(
      {
        lessonId: lesson._id,
        positionSeconds: Math.floor(videoRef.current?.currentTime ?? lesson.durationSeconds ?? 0),
        percent: 100,
        completed: true,
      },
      {
        onSuccess: () => {
          toast.success('Lesson complete', 'Your progress has been saved.');
          refetch();
        },
        onError: (e) => toast.error('Could not save progress', e.message),
      },
    );
  };

  const goTo = (delta: number) => {
    const next = allLessons[activeIndex + delta];
    if (next) {
      setActiveId(next._id);
      setSidebarOpen(false);
    }
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-[420px] w-full" /></div>;
  }
  if (error || !data) {
    return (
      <ErrorState
        title={error?.isForbidden ? 'You are not enrolled in this course' : 'Could not load this course'}
        description={error?.message}
        onRetry={error?.isForbidden ? undefined : () => refetch()}
      />
    );
  }

  const enr = data.enrollment;

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/student/courses')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 transition hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back to my courses
      </button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">{data.course.title}</h1>
          <p className="mt-0.5 text-[13px] text-ink-500">
            {enr.completedLessons} of {enr.totalLessons} lessons complete
          </p>
        </div>
        <div className="w-full max-w-[220px]">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-ink-500">Progress</span>
            <span className="font-semibold text-ink-900">{Math.round(enr.progressPercent)}%</span>
          </div>
          <ProgressBar value={Math.round(enr.progressPercent)} tone={enr.progressPercent >= 100 ? 'emerald' : 'brand'} />
        </div>
      </div>

      <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(true)} icon={<Menu className="h-4 w-4" />}>
        Course content
      </Button>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        {/* ------------------------------ Player pane ------------------------------ */}
        <div className="space-y-4">
          {!active ? (
            <Card><EmptyState icon={<PlayCircle className="h-6 w-6" />} title="No lessons yet" description="This course has no published lessons." /></Card>
          ) : (
            <>
              <Card className="overflow-hidden">
                {active.video?.playback ? (
                  <VideoStage playback={active.video.playback} videoRef={videoRef} onLoadedMetadata={handleLoadedMetadata} onTimeUpdate={handleTimeUpdate} onEnded={() => markComplete(active)} />
                ) : active.type === 'TEXT' || active.content ? (
                  <div className="prose prose-sm max-w-none p-6">
                    <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink-700">
                      {active.content || active.description || 'No content for this lesson.'}
                    </p>
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-ink-900/95">
                    <div className="text-center">
                      <Lock className="mx-auto h-8 w-8 text-white/40" />
                      <p className="mt-2 text-sm text-white/70">No media is attached to this lesson.</p>
                    </div>
                  </div>
                )}
              </Card>

              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{active.type}</Badge>
                      {active.durationSeconds ? <Badge>{formatDuration(active.durationSeconds)}</Badge> : null}
                      {active.progress?.completed && <Badge tone="ACTIVE">Completed</Badge>}
                    </div>
                    <h2 className="mt-2 font-display text-lg font-bold text-ink-900">{active.title}</h2>
                    {active.description && <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{active.description}</p>}
                  </div>
                  {!active.progress?.completed && (
                    <Button size="sm" loading={saveProgress.isPending} onClick={() => markComplete(active)} icon={<CheckCircle2 className="h-4 w-4" />}>
                      Mark complete
                    </Button>
                  )}
                </div>

                {!!active.materials?.length && (
                  <div className="mt-4 border-t border-ink-200/70 pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Lesson resources</p>
                    <div className="space-y-1.5">
                      {active.materials.map((m) => (
                        <button
                          key={m._id}
                          onClick={() =>
                            downloadFile(`/academics/materials/${m._id}/download`, m.title).catch((e) =>
                              toast.error('Download failed', (e as ApiError).message),
                            )
                          }
                          className="flex w-full items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-left transition hover:bg-ink-50"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-ink-400" />
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-700">{m.title}</span>
                          <Badge>{m.type}</Badge>
                          <Download className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {active.quiz && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-violet-50 px-3.5 py-3">
                    <ListChecks className="h-4 w-4 shrink-0 text-violet-600" />
                    <p className="text-[13px] text-violet-800">
                      This lesson has a quiz: <span className="font-medium">{active.quiz.title}</span>
                      {active.quiz.questionCount ? ` (${active.quiz.questionCount} questions)` : ''}.
                    </p>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-ink-200/70 pt-4">
                  <Button variant="outline" size="sm" disabled={activeIndex <= 0} onClick={() => goTo(-1)}>
                    Previous
                  </Button>
                  <span className="text-xs text-ink-400">Lesson {activeIndex + 1} of {allLessons.length}</span>
                  <Button variant="outline" size="sm" disabled={activeIndex >= allLessons.length - 1} onClick={() => goTo(1)}>
                    Next
                  </Button>
                </div>
              </Card>
            </>
          )}
        </div>

        {/* ------------------------------- Curriculum ------------------------------ */}
        <div className={cn('lg:block', sidebarOpen ? 'fixed inset-0 z-50 overflow-y-auto bg-white p-4 lg:static lg:p-0' : 'hidden')}>
          {sidebarOpen && (
            <div className="mb-3 flex items-center justify-between lg:hidden">
              <p className="font-display text-base font-bold">Course content</p>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
          )}
          <Card className="overflow-hidden">
            <div className="border-b border-ink-200/70 px-4 py-3">
              <p className="text-[13px] font-semibold text-ink-900">Course content</p>
              <p className="text-xs text-ink-500">{data.modules.length} modules · {allLessons.length} lessons</p>
            </div>
            <div className="max-h-[70vh] divide-y divide-ink-100 overflow-y-auto">
              {data.modules.map((m, mi) => {
                const isOpen = open[m._id] ?? false;
                return (
                  <div key={m._id}>
                    <button
                      onClick={() => setOpen((s) => ({ ...s, [m._id]: !isOpen }))}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-ink-50"
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-ink-900">{mi + 1}. {m.title}</p>
                        <p className="truncate text-xs text-ink-500">
                          {m.completedLessons ?? 0}/{m.lessons.length} done
                        </p>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="bg-ink-50/40">
                        {m.lessons.map((l) => {
                          const isActive = l._id === activeId;
                          const done = l.progress?.completed;
                          return (
                            <button
                              key={l._id}
                              onClick={() => { setActiveId(l._id); setSidebarOpen(false); }}
                              className={cn(
                                'flex w-full items-center gap-2.5 px-4 py-2.5 pl-10 text-left transition',
                                isActive ? 'bg-[var(--brand-primary)]/10' : 'hover:bg-ink-100/60',
                              )}
                            >
                              {done ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                              ) : (
                                <Circle className={cn('h-4 w-4 shrink-0', isActive ? 'text-[var(--brand-primary)]' : 'text-ink-300')} />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className={cn('truncate text-[13px]', isActive ? 'font-semibold text-[var(--brand-primary)]' : 'text-ink-700')}>
                                  {l.title}
                                </p>
                                <p className="truncate text-[11px] text-ink-400">
                                  {l.type}{l.durationSeconds ? ` · ${formatDuration(l.durationSeconds)}` : ''}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function VideoStage({
  playback, videoRef, onLoadedMetadata, onTimeUpdate, onEnded,
}: {
  playback: PlaybackInfo;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
  onEnded: () => void;
}) {
  if (playback.kind === 'youtube') {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${playback.url}`}
        title="Lesson video"
        className="aspect-video w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  if (playback.kind === 'vimeo') {
    return (
      <iframe
        src={`https://player.vimeo.com/video/${playback.url}`}
        title="Lesson video"
        className="aspect-video w-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return (
    <video
      ref={videoRef}
      src={playback.url}
      controls
      className="aspect-video w-full bg-black"
      onLoadedMetadata={onLoadedMetadata}
      onTimeUpdate={onTimeUpdate}
      onEnded={onEnded}
    />
  );
}
