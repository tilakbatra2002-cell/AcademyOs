import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pin, Megaphone, Users, Clock } from 'lucide-react';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { PageHeader, Card, Button, Badge, Skeleton, ErrorState, EmptyState } from '@/components/ui';
import { formatDate, fromNow, titleCase, labelOf } from '@/lib/utils';
import type { Announcement, PortalKey } from '@/types';

interface AnnouncementDetailData extends Announcement {
  expiresAt?: string;
  courseId?: { title?: string } | string;
  batchId?: { name?: string } | string;
}

/**
 * Announcement detail page — the destination for an announcement notification.
 *
 * Shared by the admin, teacher, student and parent portals; each mounts it at
 * `/{portal}/announcements/:id`. It reuses the existing `/comm/announcements/:id`
 * endpoint, whose scoping is identical to the list (organization always from the
 * session, and portal roles only ever see published announcements addressed to
 * them), so this page cannot surface anything the feed would hide.
 *
 * A missing, foreign-tenant or not-addressed-to-you id all come back as 404 and
 * render the standard not-found state rather than an error dump.
 */
export function AnnouncementDetailPage({ portal }: { portal: PortalKey }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useApiQuery<AnnouncementDetailData>(
    ['announcements', id],
    `/comm/announcements/${id}`,
  );

  // Opening the announcement marks it read, matching the feed's behaviour.
  const markRead = useApiMutation<void>(`/comm/announcements/${id}/read`, {
    method: 'post',
    invalidate: ['announcements', 'notifications'],
    silentError: true,
  });

  const shouldMarkRead = !!data && data.isRead === false;
  useEffect(() => {
    if (shouldMarkRead) markRead.mutate(undefined as never);
    // Only fire when the announcement first resolves as unread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldMarkRead]);

  const listPath = `/${portal}/announcements`;

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // 404 covers: unknown id, another organization's announcement, and one not
  // addressed to this user. All render the same neutral not-found state so the
  // page never confirms that a foreign id exists.
  if (error?.isNotFound) {
    return (
      <div className="space-y-5">
        <Button variant="outline" size="sm" onClick={() => navigate(listPath)} icon={<ArrowLeft className="h-4 w-4" />}>
          Back to announcements
        </Button>
        <Card>
          <EmptyState
            icon={<Megaphone className="h-6 w-6" />}
            title="Announcement not found"
            description="This announcement may have been removed, expired, or is not available to you."
            action={<Button size="sm" onClick={() => navigate(listPath)}>Back to announcements</Button>}
          />
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Could not load the announcement"
        description={error?.message ?? 'Please try again.'}
        onRetry={() => navigate(0)}
      />
    );
  }

  const courseName = labelOf(data.courseId as never, 'title');
  const batchName = labelOf(data.batchId as never, 'name');
  const published = data.publishedAt ?? data.createdAt;

  return (
    <div className="space-y-5">
      <Button variant="outline" size="sm" onClick={() => navigate(listPath)} icon={<ArrowLeft className="h-4 w-4" />}>
        Back to announcements
      </Button>

      <PageHeader
        title={data.title}
        description={data.createdByName ? `Posted by ${data.createdByName}` : undefined}
      />

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {data.isPinned && (
            <Badge tone="warning">
              <Pin className="mr-1 inline h-3 w-3" />
              Pinned
            </Badge>
          )}
          <Badge tone={data.priority}>{titleCase(data.priority)}</Badge>
          <Badge>{titleCase(data.audience)}</Badge>
          {data.status !== 'PUBLISHED' && <Badge>{titleCase(data.status)}</Badge>}
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{data.body}</p>

        <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-ink-100 pt-4 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-medium text-ink-500">Published</dt>
            <dd className="mt-0.5 text-ink-800">
              {formatDate(published, 'DD MMM YYYY')} <span className="text-ink-400">({fromNow(published)})</span>
            </dd>
          </div>
          {data.expiresAt && (
            <div>
              <dt className="flex items-center gap-1 font-medium text-ink-500"><Clock className="h-3 w-3" /> Expires</dt>
              <dd className="mt-0.5 text-ink-800">{formatDate(data.expiresAt, 'DD MMM YYYY')}</dd>
            </div>
          )}
          {courseName && courseName !== '—' && (
            <div>
              <dt className="font-medium text-ink-500">Course</dt>
              <dd className="mt-0.5 text-ink-800">{courseName}</dd>
            </div>
          )}
          {batchName && batchName !== '—' && (
            <div>
              <dt className="font-medium text-ink-500">Batch</dt>
              <dd className="mt-0.5 text-ink-800">{batchName}</dd>
            </div>
          )}
          {typeof data.readCount === 'number' && portal === 'admin' && (
            <div>
              <dt className="flex items-center gap-1 font-medium text-ink-500"><Users className="h-3 w-3" /> Read by</dt>
              <dd className="mt-0.5 text-ink-800">{data.readCount}</dd>
            </div>
          )}
        </dl>
      </Card>
    </div>
  );
}
