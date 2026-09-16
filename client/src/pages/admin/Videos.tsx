import { useState } from 'react';
import { Play, Video as VideoIcon, Lock, Globe } from 'lucide-react';
import { ResourcePage, clean } from '@/components/ResourcePage';
import { Field, Input, Select, Textarea, Badge, Button, Modal, useToast, Skeleton } from '@/components/ui';
import { Column } from '@/components/DataTable';
import { useApiQuery } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { formatBytes, formatDuration, titleCase, labelOf } from '@/lib/utils';
import type { VideoItem, Course } from '@/types';

const PROVIDERS = ['LOCAL', 'S3', 'CLOUDINARY', 'VIMEO', 'YOUTUBE'];
const VISIBILITY = ['ENROLLED', 'PUBLIC', 'PRIVATE'];

interface VideoForm {
  title: string; description: string; courseId: string; provider: string;
  publicUrl: string; visibility: string; durationSeconds: number | '';
}

export function VideosPage() {
  const [playing, setPlaying] = useState<VideoItem | null>(null);
  const { data: courses } = useApiQuery<{ items: Course[] }>(['courses', 'options'], '/academics/courses', { limit: 100 });

  const columns: Column<VideoItem>[] = [
    {
      key: 'title',
      header: 'Video',
      render: (v) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-14 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-white">
            <VideoIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{v.title}</p>
            <p className="truncate text-xs text-ink-500">{labelOf(v.lessonId, 'title', v.description || '—')}</p>
          </div>
        </div>
      ),
    },
    { key: 'course', header: 'Course', hideBelow: 'lg', render: (v) => <span className="text-[13px]">{labelOf(v.courseId, 'title', '—')}</span> },
    { key: 'provider', header: 'Source', hideBelow: 'md', render: (v) => <Badge>{titleCase(v.provider)}</Badge> },
    { key: 'duration', header: 'Length', hideBelow: 'xl', render: (v) => <span className="text-[13px]">{v.durationSeconds ? formatDuration(v.durationSeconds) : '—'}</span> },
    { key: 'size', header: 'Size', hideBelow: 'xl', render: (v) => <span className="text-[13px] text-ink-500">{v.sizeBytes ? formatBytes(v.sizeBytes) : '—'}</span> },
    {
      key: 'visibility',
      header: 'Access',
      hideBelow: 'md',
      render: (v) => (
        <span className="inline-flex items-center gap-1 text-[13px] text-ink-600">
          {v.visibility === 'PUBLIC' ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {titleCase(v.visibility)}
        </span>
      ),
    },
    {
      key: 'play',
      header: '',
      className: 'w-px',
      render: (v) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" title="Play" onClick={() => setPlaying(v)}>
            <Play className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <ResourcePage<VideoItem, VideoForm>
        resource="videos"
        endpoint="/academics/videos"
        title="Videos"
        describe={(n) => `${n} video${n === 1 ? '' : 's'} in your library`}
        permission="video"
        columns={columns}
        searchPlaceholder="Search videos…"
        emptyDescription="Add lecture recordings. Files are stored outside the database and served through signed, expiring URLs."
        filters={[
          { key: 'courseId', label: 'All courses', options: (courses?.items ?? []).map((c) => ({ value: c._id, label: c.title })) },
          { key: 'provider', label: 'All sources', options: PROVIDERS.map((p) => ({ value: p, label: titleCase(p) })) },
          { key: 'visibility', label: 'All access', options: VISIBILITY.map((v) => ({ value: v, label: titleCase(v) })) },
        ]}
        formSize="lg"
        formDescription="Point at a hosted video (YouTube, Vimeo, S3, Cloudinary) or upload through the course builder."
        defaultValues={(row) => ({
          title: row?.title ?? '', description: row?.description ?? '',
          courseId: typeof row?.courseId === 'object' ? row.courseId._id : (row?.courseId as string) ?? '',
          provider: row?.provider ?? 'YOUTUBE',
          publicUrl: row?.publicUrl ?? '',
          visibility: row?.visibility ?? 'ENROLLED',
          durationSeconds: row?.durationSeconds ?? '',
        })}
        toPayload={(v) => {
          const p = clean(v);
          if (p.durationSeconds !== undefined) p.durationSeconds = Number(p.durationSeconds);
          return p;
        }}
        deleteConfirm={(v) => ({ title: `Delete "${v.title}"?`, description: 'The video record and its stored file will be removed.' })}
        renderForm={({ register, formState: { errors } }) => (
          <>
            <Field label="Title" error={errors.title?.message} required className="sm:col-span-2">
              <Input placeholder="e.g. Newton's laws — part 1" invalid={!!errors.title} {...register('title', { required: 'Enter a title' })} />
            </Field>
            <Field label="Course" error={errors.courseId?.message} required>
              <Select invalid={!!errors.courseId} {...register('courseId', { required: 'Select a course' })}>
                <option value="">Select a course…</option>
                {(courses?.items ?? []).map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
              </Select>
            </Field>
            <Field label="Source">
              <Select {...register('provider')}>
                {PROVIDERS.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
              </Select>
            </Field>
            <Field label="Video URL" className="sm:col-span-2" hint="YouTube/Vimeo link, or a direct file URL">
              <Input placeholder="https://…" {...register('publicUrl')} />
            </Field>
            <Field label="Duration (seconds)">
              <Input type="number" min={0} placeholder="600" {...register('durationSeconds')} />
            </Field>
            <Field label="Access">
              <Select {...register('visibility')}>
                {VISIBILITY.map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}
              </Select>
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea placeholder="What does this video cover?" {...register('description')} />
            </Field>
          </>
        )}
      />
      {playing && <VideoPlayerModal video={playing} onClose={() => setPlaying(null)} />}
    </>
  );
}

/* ------------------------------ Player modal ------------------------------- */

export function VideoPlayerModal({ video, onClose }: { video: VideoItem; onClose: () => void }) {
  const toast = useToast();
  const { data, isLoading, error } = useApiQuery<{ url: string; provider: string; expiresIn?: number }>(
    ['videos', video._id, 'play'],
    `/academics/videos/${video._id}/play`,
  );

  const url = data?.url ?? video.publicUrl;
  const isEmbed = /youtube|youtu\.be|vimeo/.test(url ?? '');
  const embedUrl = toEmbed(url ?? '');

  return (
    <Modal open onClose={onClose} title={video.title} description={video.description} size="xl"
      footer={<Button variant="outline" size="sm" onClick={onClose}>Close</Button>}>
      {isLoading ? (
        <Skeleton className="aspect-video w-full" />
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
          {error.message}
        </div>
      ) : !url ? (
        <div className="rounded-xl bg-ink-50 px-3.5 py-8 text-center text-sm text-ink-500">
          No playable source is configured for this video.
        </div>
      ) : isEmbed ? (
        <iframe
          src={embedUrl}
          title={video.title}
          className="aspect-video w-full rounded-xl border border-ink-200"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <video src={url} controls className="aspect-video w-full rounded-xl bg-black" onError={() => toast.error('Playback failed', 'The video source could not be loaded.')} />
      )}
      {data?.expiresIn && (
        <p className="mt-2 text-xs text-ink-400">This signed link expires in {Math.round(data.expiresIn / 60)} minutes.</p>
      )}
    </Modal>
  );
}

function toEmbed(url: string) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vim = url.match(/vimeo\.com\/(\d+)/);
  if (vim) return `https://player.vimeo.com/video/${vim[1]}`;
  return url;
}

export const videoApi = api;
