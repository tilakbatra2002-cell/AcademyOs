import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDelayedVisible } from '@/hooks/useRouteTransition';

/**
 * Branded AcademyOS loading states.
 *
 * Two related pieces, deliberately different in weight:
 *
 *  - `AppPreloader` — the full-screen branded splash shown while the
 *    authenticated app initialises (session restore, first login). Prominent,
 *    but only rendered while work is genuinely in flight.
 *  - `RouteProgress` — a slim top progress bar for in-app navigation. It is
 *    intentionally NOT a blocking overlay: it never covers content, never traps
 *    focus, and never interferes with forms, modals, dropdowns, tables or the
 *    per-page skeletons that already exist.
 *
 * Both reuse the existing brand mark (the `GraduationCap` tile, or the tenant's
 * white-label logo) and the app's design tokens — no new logo, no new palette.
 */

export function AppPreloader({
  label = 'Loading AcademyOS…',
  logoUrl,
  brandName = 'AcademyOS',
}: {
  label?: string;
  logoUrl?: string | null;
  brandName?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-5">
        {/* Brand mark: the tenant logo when white-labelled, else the app icon. */}
        <div className="relative">
          <span
            className="absolute inset-0 -z-10 animate-ping rounded-2xl opacity-20"
            style={{ backgroundColor: 'var(--brand-primary)' }}
            aria-hidden="true"
          />
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lift"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-14 w-14 rounded-2xl object-cover" />
            ) : (
              <GraduationCap className="h-7 w-7" />
            )}
          </div>
        </div>

        <p className="font-display text-lg font-bold tracking-tight text-ink-900">{brandName}</p>

        {/* Indeterminate track — subtle, no percentage theatre. */}
        <div className="h-1 w-40 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full w-1/3 rounded-full animate-preloader-sweep"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          />
        </div>

        <p className="text-sm text-ink-500">{label}</p>
      </div>
    </div>
  );
}

/**
 * Slim top-of-viewport progress bar for route transitions.
 *
 * Rendered as a Suspense fallback, so it exists only while a route's code chunk
 * is actually loading. `useDelayedVisible` then suppresses the paint for a short
 * delay, so cached/instant navigations show nothing at all.
 *
 * It is deliberately non-blocking: `pointer-events-none`, 2px tall, pinned to
 * the top edge. The previous page stays interactive underneath and no form,
 * modal, dropdown or table is ever covered or unmounted.
 */
export function RouteProgress() {
  const visible = useDelayedVisible();

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[90] h-0.5 overflow-hidden transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      )}
      role="status"
      aria-live="polite"
      aria-label={visible ? 'Loading page' : undefined}
    >
      <div
        className="h-full w-1/3 animate-preloader-sweep"
        style={{ backgroundColor: 'var(--brand-primary)' }}
      />
    </div>
  );
}
