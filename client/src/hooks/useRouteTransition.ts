import { useEffect, useState } from 'react';

/** Wait this long before showing anything — fast navigations never flash. */
export const SHOW_DELAY_MS = 180;

/**
 * Returns `false` for the first `delayMs` after mount, then `true`.
 *
 * This is the anti-flash primitive behind the route transition indicator. The
 * indicator is rendered as a Suspense fallback, so it only mounts at all when a
 * route's code chunk is genuinely still loading; this hook then suppresses it
 * for a further short delay, so an already-cached chunk (the overwhelming
 * majority of in-app navigations) resolves before anything is ever painted.
 *
 * Note what this is *not*: it never delays the navigation itself and never
 * holds a loader open for a fixed time. The route renders the instant it is
 * ready — the timer only gates whether a loading indicator is worth showing.
 */
export function useDelayedVisible(delayMs: number = SHOW_DELAY_MS): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);

  return visible;
}
