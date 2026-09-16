import { FileText, Download, ExternalLink } from 'lucide-react';
import { ResourcePage, clean } from '@/components/ResourcePage';
import { Field, Input, Select, Textarea, Badge, Button, useToast } from '@/components/ui';
import { Column } from '@/components/DataTable';
import { useApiQuery } from '@/hooks/useApi';
import { downloadFile, ApiError } from '@/lib/api';
import { formatBytes, formatDate, titleCase, labelOf } from '@/lib/utils';
import type { StudyMaterial, Course } from '@/types';

const TYPES = ['PDF', 'PPT', 'DOC', 'IMAGE', 'LINK', 'NOTE', 'VIDEO', 'OTHER'];
const VISIBILITY = ['ENROLLED', 'PUBLIC', 'PRIVATE'];

interface MaterialForm {
  title: string; description: string; type: string; courseId: string;
  externalUrl: string; visibility: string;
}

export function MaterialsPage() {
  const toast = useToast();
  const { data: courses } = useApiQuery<{ items: Course[] }>(['courses', 'options'], '/academics/courses', { limit: 100 });

  const handleDownload = async (m: StudyMaterial) => {
    if (m.externalUrl && m.type === 'LINK') {
      window.open(m.externalUrl, '_blank', 'noopener');
      return;
    }
    try {
      await downloadFile(`/academics/materials/${m._id}/download`, m.title);
    } catch (e) {
      toast.error('Download failed', (e as ApiError).message);
    }
  };

  const columns: Column<StudyMaterial>[] = [
    {
      key: 'title',
      header: 'Material',
      render: (m) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{m.title}</p>
            <p className="truncate text-xs text-ink-500">{m.description || titleCase(m.type)}</p>
          </div>
        </div>
      ),
    },
    { key: 'type', header: 'Type', hideBelow: 'md', render: (m) => <Badge>{m.type}</Badge> },
    { key: 'course', header: 'Course', hideBelow: 'lg', render: (m) => <span className="text-[13px]">{labelOf(m.courseId, 'title', '—')}</span> },
    { key: 'size', header: 'Size', hideBelow: 'xl', render: (m) => <span className="text-[13px] text-ink-500">{m.sizeBytes ? formatBytes(m.sizeBytes) : '—'}</span> },
    { key: 'downloads', header: 'Downloads', hideBelow: 'xl', render: (m) => <span className="text-[13px] text-ink-600">{m.downloadCount ?? 0}</span> },
    { key: 'visibility', header: 'Visibility', hideBelow: 'lg', render: (m) => <Badge tone={m.visibility === 'PUBLIC' ? 'ACTIVE' : undefined}>{titleCase(m.visibility)}</Badge> },
    {
      key: 'get',
      header: '',
      className: 'w-px',
      render: (m) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" title="Open" onClick={() => handleDownload(m)}>
            {m.type === 'LINK' ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <ResourcePage<StudyMaterial, MaterialForm>
      resource="materials"
      endpoint="/academics/materials"
      title="Study material"
      describe={(n) => `${n} resource${n === 1 ? '' : 's'} shared with students`}
      permission="material"
      columns={columns}
      searchPlaceholder="Search material…"
      emptyDescription="Share notes, worksheets and reference links with enrolled students."
      filters={[
        { key: 'type', label: 'All types', options: TYPES.map((t) => ({ value: t, label: t })) },
        { key: 'courseId', label: 'All courses', options: (courses?.items ?? []).map((c) => ({ value: c._id, label: c.title })) },
        { key: 'visibility', label: 'All visibility', options: VISIBILITY.map((v) => ({ value: v, label: titleCase(v) })) },
      ]}
      formSize="lg"
      formDescription="Link to an external resource, or upload files from the course builder."
      defaultValues={(row) => ({
        title: row?.title ?? '', description: row?.description ?? '',
        type: row?.type ?? 'LINK',
        courseId: typeof row?.courseId === 'object' ? row.courseId._id : (row?.courseId as string) ?? '',
        externalUrl: row?.externalUrl ?? '', visibility: row?.visibility ?? 'ENROLLED',
      })}
      toPayload={(v) => clean(v)}
      deleteConfirm={(m) => ({ title: `Delete "${m.title}"?`, description: 'Students will lose access to this resource.' })}
      renderForm={({ register, formState: { errors } }) => (
        <>
          <Field label="Title" error={errors.title?.message} required className="sm:col-span-2">
            <Input placeholder="e.g. Thermodynamics formula sheet" invalid={!!errors.title} {...register('title', { required: 'Enter a title' })} />
          </Field>
          <Field label="Type">
            <Select {...register('type')}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Course" error={errors.courseId?.message} required>
            <Select invalid={!!errors.courseId} {...register('courseId', { required: 'Select a course' })}>
              <option value="">Select a course…</option>
              {(courses?.items ?? []).map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
            </Select>
          </Field>
          <Field label="Link / URL" className="sm:col-span-2" hint="For uploaded files, use the course builder instead">
            <Input placeholder="https://…" {...register('externalUrl')} />
          </Field>
          <Field label="Visibility" className="sm:col-span-2">
            <Select {...register('visibility')}>
              {VISIBILITY.map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}
            </Select>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea placeholder="What does this cover?" {...register('description')} />
          </Field>
        </>
      )}
    />
  );
}

export const materialDate = formatDate;
