import { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui';

export function StatCard({
  label,
  value,
  icon,
  hint,
  trend,
  tone = 'brand',
  loading,
  onClick,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  trend?: { value: number; label?: string };
  tone?: 'brand' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet';
  loading?: boolean;
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    brand: 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    sky: 'bg-sky-50 text-sky-600',
    violet: 'bg-violet-50 text-violet-600',
  };

  if (loading) {
    return (
      <div className="card p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-32" />
        <Skeleton className="mt-3 h-3 w-20" />
      </div>
    );
  }

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'card w-full p-5 text-left transition',
        onClick && 'hover:-translate-y-0.5 hover:shadow-lift',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-500">{label}</p>
        {icon && <span className={cn('rounded-xl p-2', tones[tone])}>{icon}</span>}
      </div>
      <p className="mt-2 font-display text-[26px] font-bold leading-none tracking-tight text-ink-900">{value}</p>
      <div className="mt-2.5 flex items-center gap-2">
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold',
              trend.value >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
            )}
          >
            {trend.value >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend.value)}%
          </span>
        )}
        {hint && <p className="truncate text-xs text-ink-500">{hint}</p>}
      </div>
    </Wrapper>
  );
}
