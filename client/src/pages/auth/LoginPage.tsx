import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { GraduationCap, ShieldCheck, Users, BookOpen, Wallet, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth, portalForRole } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { PortalKey } from '@/types';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

interface PortalCopy {
  title: string;
  subtitle: string;
  accent: string;
  icon: typeof GraduationCap;
  highlights: { icon: typeof Users; label: string }[];
}

const COPY: Record<PortalKey, PortalCopy> = {
  owner: {
    title: 'Platform owner',
    subtitle: 'Manage academies, subscriptions and platform-wide reporting.',
    accent: '#0f172a',
    icon: ShieldCheck,
    highlights: [
      { icon: Users, label: 'Onboard new academies and their admins' },
      { icon: Wallet, label: 'Track subscriptions, plans and usage limits' },
      { icon: BookOpen, label: 'Audit every action across all tenants' },
    ],
  },
  admin: {
    title: 'Academy admin',
    subtitle: 'Run admissions, academics, staff and finances from one place.',
    accent: '#4f46e5',
    icon: GraduationCap,
    highlights: [
      { icon: Users, label: 'Leads, follow-ups and the admission pipeline' },
      { icon: BookOpen, label: 'Courses, batches, attendance and results' },
      { icon: Wallet, label: 'Fee plans, payments, invoices and receipts' },
    ],
  },
  teacher: {
    title: 'Teacher',
    subtitle: 'Your classes, attendance, assignments and student progress.',
    accent: '#0f766e',
    icon: BookOpen,
    highlights: [
      { icon: Users, label: 'Mark attendance for your batches' },
      { icon: BookOpen, label: 'Publish assignments and grade submissions' },
      { icon: Wallet, label: 'Enter exam marks and publish results' },
    ],
  },
  student: {
    title: 'Student',
    subtitle: 'Your courses, classes, results and fees.',
    accent: '#4f46e5',
    icon: GraduationCap,
    highlights: [
      { icon: BookOpen, label: 'Watch lessons and track your progress' },
      { icon: Users, label: 'See your timetable and attendance' },
      { icon: Wallet, label: 'Check fee dues and payment history' },
    ],
  },
  parent: {
    title: 'Parent',
    subtitle: "Follow your child's attendance, results and fees.",
    accent: '#be123c',
    icon: Users,
    highlights: [
      { icon: Users, label: "Your child's attendance and timetable" },
      { icon: BookOpen, label: 'Exam results and assignment feedback' },
      { icon: Wallet, label: 'Fee dues, receipts and payment history' },
    ],
  },
};

export function LoginPage({ portal }: { portal: PortalKey }) {
  const copy = COPY[portal];
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const user = await login(portal, values.email.trim(), values.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? `/${portalForRole(user.role)}`, { replace: true });
    } catch (err) {
      const e = err as ApiError;
      if (e.fields && Object.keys(e.fields).length) {
        Object.entries(e.fields).forEach(([k, v]) => setError(k as keyof FormValues, { message: String(v) }));
      }
      setServerError(e.message || 'Unable to sign in. Please try again.');
    }
  };

  const Icon = copy.icon;

  return (
    <div className="flex min-h-screen bg-white" style={{ ['--brand-primary' as string]: copy.accent }}>
      {/* ------------------------------ Form side ------------------------------ */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-[46%] lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
              style={{ backgroundColor: copy.accent }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-lg font-bold leading-tight text-ink-900">AcademyOS</p>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{copy.title}</p>
            </div>
          </div>

          <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink-900">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-ink-500">{copy.subtitle}</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
            {serverError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                {serverError}
              </div>
            )}

            <Field label="Email address" error={errors.email?.message} required>
              <Input
                type="email"
                autoComplete="username"
                placeholder="you@academy.com"
                invalid={!!errors.email}
                {...register('email')}
              />
            </Field>

            <Field label="Password" error={errors.password?.message} required>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pr-10"
                  invalid={!!errors.password}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            <Button type="submit" loading={isSubmitting} className="w-full" size="lg">
              Sign in
              {!isSubmitting && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <div className="mt-8 border-t border-ink-200 pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Other portals</p>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {(Object.keys(COPY) as PortalKey[])
                .filter((p) => p !== portal)
                .map((p) => (
                  <Link
                    key={p}
                    to={`/${p}/login`}
                    className="text-[13px] font-medium text-ink-500 transition hover:text-ink-900 hover:underline"
                  >
                    {COPY[p].title}
                  </Link>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------ Brand side ----------------------------- */}
      <div
        className="relative hidden overflow-hidden lg:block lg:w-[54%]"
        style={{ background: `linear-gradient(140deg, ${copy.accent} 0%, ${shade(copy.accent)} 100%)` }}
      >
        <div className="absolute inset-0 opacity-[0.15]">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white blur-3xl" />
          <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white blur-3xl" />
        </div>

        <div className="relative flex h-full flex-col justify-center px-16">
          <h2 className="max-w-md font-display text-4xl font-bold leading-[1.15] tracking-tight text-white">
            The operating system for modern coaching institutes.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/75">
            CRM, learning management, attendance, examinations and fee collection — built for multi-branch academies
            that need every number to be real.
          </p>

          <div className="mt-10 space-y-3.5">
            {copy.highlights.map((h, i) => {
              const HIcon = h.icon;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                    <HIcon className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-sm text-white/85">{h.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Darkens a hex colour for the gradient end stop. */
function shade(hex: string, amount = -40) {
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) + amount);
  const g = clamp(((num >> 8) & 0xff) + amount);
  const b = clamp((num & 0xff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export const loginPageClasses = cn();
