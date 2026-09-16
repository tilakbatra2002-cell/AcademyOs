import { useState, useEffect } from 'react';
import {
  User, Users, BookOpen, Layers, Wallet, CreditCard, ClipboardCheck, Check, ChevronRight,
  ChevronLeft, Plus, Trash2, AlertTriangle,
} from 'lucide-react';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import {
  Modal, Button, Field, Input, Select, Textarea, Badge, Skeleton, useToast,
} from '@/components/ui';
import { cn, formatCurrency, formatDate, toInputDate, labelOf } from '@/lib/utils';
import type { Lead, Course, Batch, Parent } from '@/types';

/**
 * Seven-step admission wizard.
 *
 * The whole thing is submitted as ONE request so the backend can run it inside a
 * MongoDB transaction: student + parent + enrolment + fee plan + instalments +
 * first payment + receipt either all commit, or none do.
 */

interface WizardState {
  student: {
    name: string; email: string; phone: string; dateOfBirth: string;
    gender: '' | 'MALE' | 'FEMALE' | 'OTHER'; schoolName: string; createLogin: boolean;
    address: { line1: string; city: string; state: string; postalCode: string };
  };
  parent: {
    create: boolean; existingParentId: string; name: string; phone: string; email: string;
    relation: 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'OTHER'; createLogin: boolean;
  };
  courseId: string;
  batchId: string;
  feePlan: {
    title: string; totalAmount: number; discountAmount: number;
    installments: { title: string; amount: number; dueDate: string }[];
  };
  initialPayment: { amount: number; method: string; transactionId: string };
  remarks: string;
}

const STEPS = [
  { key: 'student', label: 'Student', icon: User },
  { key: 'parent', label: 'Parent', icon: Users },
  { key: 'course', label: 'Course', icon: BookOpen },
  { key: 'batch', label: 'Batch', icon: Layers },
  { key: 'fees', label: 'Fee plan', icon: Wallet },
  { key: 'payment', label: 'Payment', icon: CreditCard },
  { key: 'review', label: 'Review', icon: ClipboardCheck },
];

export function AdmissionWizard({
  lead,
  onClose,
  onDone,
}: {
  lead?: Lead | null;
  onClose: () => void;
  onDone?: (studentId: string) => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: courses, isLoading: coursesLoading } = useApiQuery<{ items: Course[] }>(
    ['courses', 'options'], '/academics/courses', { limit: 100, status: 'PUBLISHED' },
  );
  const { data: batches } = useApiQuery<{ items: Batch[] }>(['batches', 'options'], '/academics/batches', { limit: 100 });
  const { data: parents } = useApiQuery<{ items: Parent[] }>(['parents', 'options'], '/people/parents', { limit: 100 });

  const [state, setState] = useState<WizardState>(() => ({
    student: {
      name: lead?.name ?? '', email: lead?.email ?? '', phone: lead?.phone ?? '',
      dateOfBirth: '', gender: '', schoolName: '', createLogin: true,
      address: { line1: '', city: lead?.city ?? '', state: '', postalCode: '' },
    },
    parent: {
      create: !!lead?.parentName, existingParentId: '',
      name: lead?.parentName ?? '', phone: lead?.parentPhone ?? '', email: '',
      relation: 'FATHER', createLogin: false,
    },
    courseId: typeof lead?.courseId === 'object' ? lead.courseId._id : (lead?.courseId as string) ?? '',
    batchId: '',
    feePlan: { title: '', totalAmount: 0, discountAmount: 0, installments: [] },
    initialPayment: { amount: 0, method: 'CASH', transactionId: '' },
    remarks: '',
  }));

  const selectedCourse = courses?.items.find((c) => c._id === state.courseId);
  const courseBatches = (batches?.items ?? []).filter(
    (b) => (typeof b.courseId === 'object' ? b.courseId._id : b.courseId) === state.courseId,
  );

  // Seed the fee plan from the chosen course exactly once per course selection.
  useEffect(() => {
    if (!selectedCourse) return;
    setState((s) => {
      if (s.feePlan.totalAmount === selectedCourse.price && s.feePlan.installments.length) return s;
      const total = selectedCourse.price;
      const discount = selectedCourse.discount ?? 0;
      const net = total - discount;
      const half = Math.round(net / 2);
      return {
        ...s,
        feePlan: {
          title: `${selectedCourse.title} — fee plan`,
          totalAmount: total,
          discountAmount: discount,
          installments: [
            { title: 'Instalment 1 of 2', amount: half, dueDate: toInputDate(new Date()) },
            {
              title: 'Instalment 2 of 2',
              amount: net - half,
              dueDate: toInputDate(new Date(Date.now() + 90 * 86400000)),
            },
          ],
        },
      };
    });
  }, [selectedCourse]);

  const netAmount = state.feePlan.totalAmount - state.feePlan.discountAmount;
  const installmentTotal = state.feePlan.installments.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const installmentDelta = Math.round((installmentTotal - netAmount) * 100) / 100;
  const feeBalanced = Math.abs(installmentDelta) <= 1;

  const submit = useApiMutation<Record<string, unknown>, { student?: { _id: string }; admission?: unknown }>(
    lead ? `/crm/leads/${lead._id}/convert` : '/crm/admissions',
    {
      invalidate: ['students', 'leads', 'dashboard', 'fee-plans', 'admissions', 'payments'],
      silentError: true,
      onSuccess: (res) => {
        toast.success('Admission confirmed', 'Student, fee plan and receipt have been created.');
        onDone?.(res.student?._id ?? '');
        onClose();
      },
    },
  );

  /* ------------------------------- Validation ------------------------------- */

  const validateStep = (index: number): boolean => {
    const e: Record<string, string> = {};
    if (index === 0) {
      if (state.student.name.trim().length < 2) e.name = 'Enter the student name';
      if (state.student.email && !/^\S+@\S+\.\S+$/.test(state.student.email)) e.email = 'Enter a valid email';
      if (state.student.createLogin && !state.student.email) e.email = 'An email is required to create a portal login';
    }
    if (index === 1 && state.parent.create && !state.parent.existingParentId) {
      if (!state.parent.name.trim()) e.parentName = 'Enter the parent name';
      if (!state.parent.phone.trim()) e.parentPhone = 'Enter the parent phone number';
      if (state.parent.createLogin && !state.parent.email) e.parentEmail = 'An email is required for a parent login';
    }
    if (index === 2 && !state.courseId) e.courseId = 'Select a course';
    if (index === 4) {
      if (state.feePlan.installments.length === 0) e.installments = 'Add at least one instalment';
      if (!feeBalanced) {
        e.installments = `Instalments total ${formatCurrency(installmentTotal)} but the net fee is ${formatCurrency(netAmount)}`;
      }
    }
    if (index === 5 && state.initialPayment.amount > netAmount) {
      e.payment = `The first payment cannot exceed the net fee of ${formatCurrency(netAmount)}`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = () => {
    for (let i = 0; i < STEPS.length - 1; i++) {
      if (!validateStep(i)) {
        setStep(i);
        return;
      }
    }
    const payload: Record<string, unknown> = {
      student: {
        name: state.student.name.trim(),
        email: state.student.email || undefined,
        phone: state.student.phone || undefined,
        dateOfBirth: state.student.dateOfBirth || undefined,
        gender: state.student.gender || undefined,
        schoolName: state.student.schoolName || undefined,
        createLogin: state.student.createLogin,
        address: state.student.address.line1 || state.student.address.city ? state.student.address : undefined,
      },
      courseId: state.courseId,
      batchId: state.batchId || undefined,
      feePlan: {
        title: state.feePlan.title || undefined,
        totalAmount: state.feePlan.totalAmount,
        discountAmount: state.feePlan.discountAmount,
        installments: state.feePlan.installments.map((i) => ({
          title: i.title || undefined,
          amount: Number(i.amount),
          dueDate: i.dueDate,
        })),
      },
      remarks: state.remarks || undefined,
    };
    if (state.parent.existingParentId) {
      payload.parent = { create: false, existingParentId: state.parent.existingParentId, relation: state.parent.relation };
    } else if (state.parent.create && state.parent.name) {
      payload.parent = {
        create: true,
        name: state.parent.name,
        phone: state.parent.phone,
        email: state.parent.email || undefined,
        relation: state.parent.relation,
        createLogin: state.parent.createLogin,
      };
    }
    if (state.initialPayment.amount > 0) {
      payload.initialPayment = {
        amount: state.initialPayment.amount,
        method: state.initialPayment.method,
        transactionId: state.initialPayment.transactionId || undefined,
      };
    }
    submit.mutate(payload);
  };

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  const capacityFull = (b: Batch) => b.enrolledCount >= b.capacity;

  return (
    <Modal
      open
      onClose={onClose}
      title={lead ? `Admit ${lead.name}` : 'New admission'}
      description="Seven steps. Everything is saved together in a single transaction at the end."
      size="2xl"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          {step > 0 && (
            <Button variant="outline" size="sm" onClick={back} icon={<ChevronLeft className="h-4 w-4" />}>Back</Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={next}>
              Continue <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" loading={submit.isPending} onClick={handleSubmit} icon={<Check className="h-4 w-4" />}>
              Confirm admission
            </Button>
          )}
        </>
      }
    >
      {/* -------------------------------- Stepper -------------------------------- */}
      <div className="mb-6 flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <button
              key={s.key}
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition',
                active && 'bg-[var(--brand-primary)] text-white',
                done && 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
                !active && !done && 'text-ink-400',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          );
        })}
      </div>

      {submit.error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">{submit.error.message}</p>
            {Object.entries(submit.error.fields ?? {}).map(([k, v]) => (
              <p key={k} className="text-xs">{k}: {String(v)}</p>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------- Step 1: Student ------------------------- */}
      {step === 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" error={errors.name} required className="sm:col-span-2">
            <Input
              value={state.student.name}
              onChange={(e) => set('student', { ...state.student, name: e.target.value })}
              placeholder="e.g. Aarav Sharma"
            />
          </Field>
          <Field label="Phone">
            <Input value={state.student.phone} onChange={(e) => set('student', { ...state.student, phone: e.target.value })} placeholder="9876543210" />
          </Field>
          <Field label="Email" error={errors.email} hint="Needed for the student portal login">
            <Input type="email" value={state.student.email} onChange={(e) => set('student', { ...state.student, email: e.target.value })} placeholder="student@example.com" />
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={state.student.dateOfBirth} onChange={(e) => set('student', { ...state.student, dateOfBirth: e.target.value })} />
          </Field>
          <Field label="Gender">
            <Select value={state.student.gender} onChange={(e) => set('student', { ...state.student, gender: e.target.value as 'MALE' })}>
              <option value="">Select…</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="School / college" className="sm:col-span-2">
            <Input value={state.student.schoolName} onChange={(e) => set('student', { ...state.student, schoolName: e.target.value })} placeholder="e.g. DAV Public School" />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={state.student.address.line1} onChange={(e) => set('student', { ...state.student, address: { ...state.student.address, line1: e.target.value } })} placeholder="Street address" />
          </Field>
          <Field label="City">
            <Input value={state.student.address.city} onChange={(e) => set('student', { ...state.student, address: { ...state.student.address, city: e.target.value } })} />
          </Field>
          <Field label="State">
            <Input value={state.student.address.state} onChange={(e) => set('student', { ...state.student, address: { ...state.student.address, state: e.target.value } })} />
          </Field>
          <label className="flex items-center gap-2.5 sm:col-span-2">
            <input
              type="checkbox"
              checked={state.student.createLogin}
              onChange={(e) => set('student', { ...state.student, createLogin: e.target.checked })}
              className="h-4 w-4 rounded border-ink-300 text-[var(--brand-primary)]"
            />
            <span className="text-sm text-ink-700">Create a student portal login and email the credentials</span>
          </label>
        </div>
      )}

      {/* ------------------------------- Step 2: Parent -------------------------- */}
      {step === 1 && (
        <div className="space-y-4">
          <Field label="Link an existing parent" hint="Leave blank to create a new parent record">
            <Select
              value={state.parent.existingParentId}
              onChange={(e) => set('parent', { ...state.parent, existingParentId: e.target.value, create: !e.target.value })}
            >
              <option value="">Create a new parent</option>
              {(parents?.items ?? []).map((p) => (
                <option key={p._id} value={p._id}>{p.name} — {p.phone}</option>
              ))}
            </Select>
          </Field>

          {!state.parent.existingParentId && (
            <>
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={state.parent.create}
                  onChange={(e) => set('parent', { ...state.parent, create: e.target.checked })}
                  className="h-4 w-4 rounded border-ink-300 text-[var(--brand-primary)]"
                />
                <span className="text-sm text-ink-700">Add a parent / guardian record</span>
              </label>

              {state.parent.create && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Parent name" error={errors.parentName} required>
                    <Input value={state.parent.name} onChange={(e) => set('parent', { ...state.parent, name: e.target.value })} />
                  </Field>
                  <Field label="Parent phone" error={errors.parentPhone} required>
                    <Input value={state.parent.phone} onChange={(e) => set('parent', { ...state.parent, phone: e.target.value })} />
                  </Field>
                  <Field label="Parent email" error={errors.parentEmail}>
                    <Input type="email" value={state.parent.email} onChange={(e) => set('parent', { ...state.parent, email: e.target.value })} />
                  </Field>
                  <Field label="Relation">
                    <Select value={state.parent.relation} onChange={(e) => set('parent', { ...state.parent, relation: e.target.value as 'FATHER' })}>
                      {['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'].map((r) => (
                        <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>
                      ))}
                    </Select>
                  </Field>
                  <label className="flex items-center gap-2.5 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={state.parent.createLogin}
                      onChange={(e) => set('parent', { ...state.parent, createLogin: e.target.checked })}
                      className="h-4 w-4 rounded border-ink-300 text-[var(--brand-primary)]"
                    />
                    <span className="text-sm text-ink-700">Create a parent portal login</span>
                  </label>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ------------------------------- Step 3: Course -------------------------- */}
      {step === 2 && (
        <div className="space-y-3">
          {errors.courseId && <p className="text-sm font-medium text-rose-600">{errors.courseId}</p>}
          {coursesLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(courses?.items ?? []).map((c) => (
                <button
                  key={c._id}
                  onClick={() => set('courseId', c._id)}
                  className={cn(
                    'rounded-xl border p-3.5 text-left transition',
                    state.courseId === c._id
                      ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 ring-2 ring-[var(--brand-primary)]/20'
                      : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-semibold text-ink-900">{c.title}</p>
                    {state.courseId === c._id && <Check className="h-4 w-4 shrink-0 text-[var(--brand-primary)]" />}
                  </div>
                  <p className="mt-1 text-xs text-ink-500">{c.category} · {c.level}</p>
                  <p className="mt-2 text-sm font-bold text-ink-900">{formatCurrency(c.price)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------- Step 4: Batch --------------------------- */}
      {step === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-ink-500">Choose a batch, or skip and assign one later.</p>
          {courseBatches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink-300 px-4 py-8 text-center">
              <p className="text-sm text-ink-500">No batches exist for this course yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => set('batchId', '')}
                className={cn(
                  'rounded-xl border p-3.5 text-left transition',
                  !state.batchId ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 ring-2 ring-[var(--brand-primary)]/20' : 'border-ink-200 hover:bg-ink-50',
                )}
              >
                <p className="text-[13px] font-semibold text-ink-900">Assign later</p>
                <p className="mt-1 text-xs text-ink-500">The student will not be placed in a batch yet.</p>
              </button>
              {courseBatches.map((b) => {
                const full = capacityFull(b);
                return (
                  <button
                    key={b._id}
                    disabled={full}
                    onClick={() => set('batchId', b._id)}
                    className={cn(
                      'rounded-xl border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                      state.batchId === b._id
                        ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 ring-2 ring-[var(--brand-primary)]/20'
                        : 'border-ink-200 hover:bg-ink-50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold text-ink-900">{b.name}</p>
                      {full ? <Badge tone="CANCELLED">Full</Badge> : <Badge tone={b.status}>{b.enrolledCount}/{b.capacity}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-ink-500">
                      {b.schedule?.map((s) => `${s.day} ${s.startTime}`).join(', ') || 'No schedule'}
                    </p>
                    <p className="mt-1 text-xs text-ink-400">{labelOf(b.teacherId, 'name', 'No teacher')} · {b.room ?? 'No room'}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------- Step 5: Fees --------------------------- */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Total fee">
              <Input
                type="number"
                value={state.feePlan.totalAmount}
                onChange={(e) => set('feePlan', { ...state.feePlan, totalAmount: Number(e.target.value) })}
              />
            </Field>
            <Field label="Discount">
              <Input
                type="number"
                value={state.feePlan.discountAmount}
                onChange={(e) => set('feePlan', { ...state.feePlan, discountAmount: Number(e.target.value) })}
              />
            </Field>
            <Field label="Net payable">
              <Input value={formatCurrency(netAmount)} disabled />
            </Field>
          </div>

          <div className="rounded-xl border border-ink-200">
            <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-3.5 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Instalments</p>
              <Button
                variant="ghost"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() =>
                  set('feePlan', {
                    ...state.feePlan,
                    installments: [
                      ...state.feePlan.installments,
                      { title: `Instalment ${state.feePlan.installments.length + 1}`, amount: 0, dueDate: toInputDate(new Date()) },
                    ],
                  })
                }
              >
                Add
              </Button>
            </div>
            <div className="divide-y divide-ink-100">
              {state.feePlan.installments.map((inst, i) => (
                <div key={i} className="flex items-end gap-2 p-3">
                  <Field label={i === 0 ? 'Title' : undefined} className="flex-1">
                    <Input
                      value={inst.title}
                      onChange={(e) => {
                        const next = [...state.feePlan.installments];
                        next[i] = { ...inst, title: e.target.value };
                        set('feePlan', { ...state.feePlan, installments: next });
                      }}
                    />
                  </Field>
                  <Field label={i === 0 ? 'Amount' : undefined} className="w-32">
                    <Input
                      type="number"
                      value={inst.amount}
                      onChange={(e) => {
                        const next = [...state.feePlan.installments];
                        next[i] = { ...inst, amount: Number(e.target.value) };
                        set('feePlan', { ...state.feePlan, installments: next });
                      }}
                    />
                  </Field>
                  <Field label={i === 0 ? 'Due date' : undefined} className="w-40">
                    <Input
                      type="date"
                      value={inst.dueDate}
                      onChange={(e) => {
                        const next = [...state.feePlan.installments];
                        next[i] = { ...inst, dueDate: e.target.value };
                        set('feePlan', { ...state.feePlan, installments: next });
                      }}
                    />
                  </Field>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mb-0.5"
                    onClick={() =>
                      set('feePlan', {
                        ...state.feePlan,
                        installments: state.feePlan.installments.filter((_, x) => x !== i),
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              ))}
            </div>
            <div
              className={cn(
                'flex items-center justify-between border-t px-3.5 py-2.5 text-[13px]',
                feeBalanced ? 'border-ink-200 bg-emerald-50/60 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700',
              )}
            >
              <span className="font-medium">Instalments total</span>
              <span className="font-semibold">
                {formatCurrency(installmentTotal)}
                {!feeBalanced && ` (${installmentDelta > 0 ? '+' : ''}${formatCurrency(installmentDelta)} vs net fee)`}
              </span>
            </div>
          </div>
          {errors.installments && <p className="text-sm font-medium text-rose-600">{errors.installments}</p>}
        </div>
      )}

      {/* ------------------------------ Step 6: Payment -------------------------- */}
      {step === 5 && (
        <div className="space-y-4">
          <p className="text-sm text-ink-500">
            Record a first payment now, or leave it at zero and collect later.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Amount received" error={errors.payment}>
              <Input
                type="number"
                min={0}
                value={state.initialPayment.amount}
                onChange={(e) => set('initialPayment', { ...state.initialPayment, amount: Number(e.target.value) })}
              />
            </Field>
            <Field label="Method">
              <Select
                value={state.initialPayment.method}
                onChange={(e) => set('initialPayment', { ...state.initialPayment, method: e.target.value })}
              >
                {['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE'].map((m) => (
                  <option key={m} value={m}>{m.replace('_', ' ')}</option>
                ))}
              </Select>
            </Field>
            <Field label="Reference / txn id">
              <Input
                value={state.initialPayment.transactionId}
                onChange={(e) => set('initialPayment', { ...state.initialPayment, transactionId: e.target.value })}
                placeholder="Optional"
              />
            </Field>
          </div>
          {state.initialPayment.amount > 0 && (
            <div className="rounded-xl bg-emerald-50 px-3.5 py-3 text-[13px] text-emerald-800">
              A receipt and invoice will be generated automatically for {formatCurrency(state.initialPayment.amount)}.
              Remaining balance: {formatCurrency(netAmount - state.initialPayment.amount)}.
            </div>
          )}
          <Field label="Remarks">
            <Textarea value={state.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="Any notes about this admission" />
          </Field>
        </div>
      )}

      {/* ------------------------------- Step 7: Review -------------------------- */}
      {step === 6 && (
        <div className="space-y-4">
          <ReviewBlock title="Student">
            <ReviewRow label="Name" value={state.student.name} />
            <ReviewRow label="Phone" value={state.student.phone || '—'} />
            <ReviewRow label="Email" value={state.student.email || '—'} />
            <ReviewRow label="Portal login" value={state.student.createLogin ? 'Will be created' : 'Not created'} />
          </ReviewBlock>

          <ReviewBlock title="Parent">
            {state.parent.existingParentId ? (
              <ReviewRow
                label="Linked parent"
                value={parents?.items.find((p) => p._id === state.parent.existingParentId)?.name ?? 'Existing parent'}
              />
            ) : state.parent.create && state.parent.name ? (
              <>
                <ReviewRow label="Name" value={state.parent.name} />
                <ReviewRow label="Phone" value={state.parent.phone} />
                <ReviewRow label="Portal login" value={state.parent.createLogin ? 'Will be created' : 'Not created'} />
              </>
            ) : (
              <ReviewRow label="Parent" value="Not added" />
            )}
          </ReviewBlock>

          <ReviewBlock title="Course & batch">
            <ReviewRow label="Course" value={selectedCourse?.title ?? '—'} />
            <ReviewRow label="Batch" value={courseBatches.find((b) => b._id === state.batchId)?.name ?? 'Assign later'} />
          </ReviewBlock>

          <ReviewBlock title="Fees">
            <ReviewRow label="Total" value={formatCurrency(state.feePlan.totalAmount)} />
            <ReviewRow label="Discount" value={formatCurrency(state.feePlan.discountAmount)} />
            <ReviewRow label="Net payable" value={formatCurrency(netAmount)} strong />
            {state.feePlan.installments.map((i, idx) => (
              <ReviewRow key={idx} label={i.title || `Instalment ${idx + 1}`} value={`${formatCurrency(i.amount)} · due ${formatDate(i.dueDate)}`} />
            ))}
            <ReviewRow label="Paying now" value={formatCurrency(state.initialPayment.amount)} />
            <ReviewRow label="Balance" value={formatCurrency(netAmount - state.initialPayment.amount)} strong />
          </ReviewBlock>

          <div className="rounded-xl bg-ink-50 px-3.5 py-3 text-[13px] text-ink-600">
            Confirming will create the student, fee plan, instalments
            {state.initialPayment.amount > 0 ? ', payment, invoice and receipt' : ''} together in one transaction.
          </div>
        </div>
      )}
    </Modal>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink-200">
      <p className="border-b border-ink-200 bg-ink-50 px-3.5 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
        {title}
      </p>
      <dl className="divide-y divide-ink-100">{children}</dl>
    </div>
  );
}

function ReviewRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2">
      <dt className="text-[13px] text-ink-500">{label}</dt>
      <dd className={cn('text-right text-[13px]', strong ? 'font-bold text-ink-900' : 'font-medium text-ink-800')}>{value}</dd>
    </div>
  );
}
