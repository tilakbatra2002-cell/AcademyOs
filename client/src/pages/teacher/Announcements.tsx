import { Pin, Megaphone } from 'lucide-react';
import { useListQuery } from '@/hooks/useApi';
import { PageHeader, Card, Skeleton, EmptyState, ErrorState, Badge, Pagination } from '@/components/ui';
import { formatDate, titleCase, fromNow } from '@/lib/utils';
import type { Announcement } from '@/types';

/** Read-only announcement feed shared by the teacher, student and parent portals. */
export function AnnouncementFeed({ title, description }: { title: string; description: string }) {
  const list = useListQuery<Announcement>('announcements', '/comm/announcements', {}, { limit: 10 });

  return (
    <div className="space-y-5">
      <PageHeader title={title} description={description} />

      {list.error ? (
        <ErrorState title="Could not load announcements" description={list.error.message} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : list.items.length === 0 ? (
        <Card><EmptyState icon={<Megaphone className="h-6 w-6" />} title="No announcements" description="Notices from your academy will appear here." /></Card>
      ) : (
        <>
          <div className="space-y-3">
            {list.items.map((a) => (
              <Card key={a._id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 font-display text-base font-bold text-ink-900">
                    {a.isPinned && <Pin className="h-3.5 w-3.5 text-amber-500" />}
                    {a.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={a.priority}>{titleCase(a.priority)}</Badge>
                    <Badge>{titleCase(a.audience)}</Badge>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-700">{a.body}</p>
                <p className="mt-3 text-xs text-ink-400">
                  {a.createdByName ? `${a.createdByName} · ` : ''}
                  {a.publishedAt ? `${formatDate(a.publishedAt, 'DD MMM YYYY')} (${fromNow(a.publishedAt)})` : fromNow(a.createdAt)}
                </p>
              </Card>
            ))}
          </div>
          <Pagination page={list.page} pages={list.pages} total={list.total} limit={list.limit} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

export function TeacherAnnouncements() {
  return <AnnouncementFeed title="Announcements" description="Notices from your academy." />;
}
