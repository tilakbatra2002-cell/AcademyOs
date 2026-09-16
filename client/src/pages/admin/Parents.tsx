import { ResourcePage, clean } from '@/components/ResourcePage';
import { Field, Input, Select, Badge, Avatar } from '@/components/ui';
import { Column } from '@/components/DataTable';
import { titleCase } from '@/lib/utils';
import type { Parent } from '@/types';

interface ParentForm {
  name: string; phone: string; email: string; occupation: string;
  relation: string; createLogin: boolean;
  address: { line1: string; city: string; state: string };
}

const RELATIONS = ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'];

export function ParentsPage() {
  const columns: Column<Parent>[] = [
    {
      key: 'name',
      header: 'Parent',
      render: (p) => (
        <div className="flex items-center gap-3">
          <Avatar name={p.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{p.name}</p>
            <p className="truncate text-xs text-ink-500">{titleCase(p.relation)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (p) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] text-ink-700">{p.phone}</p>
          <p className="truncate text-xs text-ink-400">{p.email ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'children',
      header: 'Children',
      hideBelow: 'md',
      render: (p) => {
        const kids = p.childrenIds ?? [];
        if (!kids.length) return <span className="text-[13px] text-ink-400">None linked</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {kids.slice(0, 2).map((c, i) => (
              <Badge key={i}>{typeof c === 'object' ? c.name : 'Student'}</Badge>
            ))}
            {kids.length > 2 && <Badge>+{kids.length - 2}</Badge>}
          </div>
        );
      },
    },
    { key: 'occupation', header: 'Occupation', hideBelow: 'lg', render: (p) => <span className="text-[13px]">{p.occupation ?? '—'}</span> },
    { key: 'city', header: 'City', hideBelow: 'xl', render: (p) => <span className="text-[13px]">{p.address?.city ?? '—'}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Badge tone={p.isActive ? 'ACTIVE' : 'INACTIVE'}>{p.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
  ];

  return (
    <ResourcePage<Parent, ParentForm>
      resource="parents"
      endpoint="/people/parents"
      title="Parents"
      describe={(n) => `${n} parent${n === 1 ? '' : 's'} and guardians`}
      permission="parent"
      columns={columns}
      searchPlaceholder="Search by name, phone or email…"
      emptyDescription="Parents added here can be linked to students and given a parent-portal login."
      invalidate={['students']}
      filters={[
        { key: 'relation', label: 'All relations', options: RELATIONS.map((r) => ({ value: r, label: titleCase(r) })) },
        { key: 'isActive', label: 'All statuses', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
      ]}
      defaultValues={(row) => ({
        name: row?.name ?? '', phone: row?.phone ?? '', email: row?.email ?? '',
        occupation: row?.occupation ?? '', relation: row?.relation ?? 'FATHER',
        createLogin: false,
        address: { line1: row?.address?.line1 ?? '', city: row?.address?.city ?? '', state: row?.address?.state ?? '' },
      })}
      toPayload={(v, row) => {
        const { address, ...rest } = v;
        const p = clean(rest);
        if (row) delete p.createLogin;
        const addr = clean(address as unknown as Record<string, unknown>);
        if (Object.keys(addr).length) p.address = addr;
        return p;
      }}
      deleteConfirm={(p) => ({
        title: `Delete ${p.name}?`,
        description: 'The parent record and their portal login will be removed. Linked students are not deleted.',
      })}
      renderForm={({ register, formState: { errors } }, row) => (
        <>
          <Field label="Full name" error={errors.name?.message} required>
            <Input placeholder="e.g. Rajesh Sharma" invalid={!!errors.name} {...register('name', { required: 'Enter the parent name' })} />
          </Field>
          <Field label="Phone" error={errors.phone?.message} required>
            <Input placeholder="9876543210" invalid={!!errors.phone} {...register('phone', { required: 'Enter a phone number' })} />
          </Field>
          <Field label="Email" hint="Required for a parent portal login">
            <Input type="email" placeholder="parent@example.com" {...register('email')} />
          </Field>
          <Field label="Relation">
            <Select {...register('relation')}>
              {RELATIONS.map((r) => (
                <option key={r} value={r}>{titleCase(r)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Occupation">
            <Input placeholder="e.g. Bank manager" {...register('occupation')} />
          </Field>
          <Field label="City">
            <Input placeholder="e.g. Shimla" {...register('address.city')} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input placeholder="Street address" {...register('address.line1')} />
          </Field>
          {!row && (
            <label className="flex items-center gap-2.5 sm:col-span-2">
              <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-[var(--brand-primary)]" {...register('createLogin')} />
              <span className="text-sm text-ink-700">Create a parent portal login (requires an email)</span>
            </label>
          )}
        </>
      )}
    />
  );
}
