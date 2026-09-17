import { ComponentType, ReactNode, Suspense, isValidElement, useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Menu, X, Bell, Search, LogOut, ChevronDown, GraduationCap, Settings, User as UserIcon, Check,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { cn, titleCase, fromNow } from '@/lib/utils';
import { notificationPath } from '@/lib/notificationPath';
import { RouteProgress } from '@/components/AppPreloader';
import { Avatar, Button, Spinner } from '@/components/ui';
import type { NotificationItem, SearchResult, PortalKey } from '@/types';

/** An icon may be given as a rendered element or as a Lucide component. */
export type NavIcon = ReactNode | ComponentType<{ className?: string }>;

export interface NavItem {
  to: string;
  label: string;
  icon: NavIcon;
  /** Only render when the session holds one of these permissions. */
  permission?: string | string[];
  end?: boolean;
  badgeKey?: 'followups';
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

interface PortalLayoutProps {
  portal: PortalKey;
  sections: NavSection[];
  /** Shown under the product name in the sidebar. */
  portalLabel: string;
  showSearch?: boolean;
}

export function PortalLayout({ portal, sections, portalLabel, showSearch }: PortalLayoutProps) {
  // Global search and notifications are tenant-scoped endpoints. The platform
  // owner has no organization, so those APIs correctly reject them with 403 —
  // don't render the widgets that would call them.
  const isTenantPortal = portal !== 'owner';
  const searchEnabled = showSearch ?? isTenantPortal;
  const { user, organization, logout, can } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Apply tenant branding to CSS variables so the whole UI re-themes per academy.
  useEffect(() => {
    const root = document.documentElement;
    const primary = organization?.branding?.primaryColor || (portal === 'owner' ? '#0f172a' : '#4f46e5');
    const accent = organization?.branding?.accentColor || '#0ea5e9';
    root.style.setProperty('--brand-primary', primary);
    root.style.setProperty('--brand-accent', accent);
  }, [organization, portal]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const visibleSections = sections
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => {
        if (!i.permission) return true;
        const perms = Array.isArray(i.permission) ? i.permission : [i.permission];
        return perms.some((p) => can(p));
      }),
    }))
    .filter((s) => s.items.length > 0);

  const handleLogout = async () => {
    await logout();
    navigate(`/${portal}/login`, { replace: true });
  };

  const brandName = portal === 'owner' ? 'AcademyOS' : organization?.name ?? 'AcademyOS';

  return (
    <div className="flex min-h-screen bg-ink-50">
      {/* ------------------------------- Sidebar ------------------------------- */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-ink-200 bg-white transition-transform duration-200 lg:translate-x-0',
          mobileOpen ? 'translate-x-0 shadow-lift' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-ink-200 px-5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {organization?.branding?.logoUrl ? (
              <img src={organization.branding.logoUrl} alt="" className="h-9 w-9 rounded-xl object-cover" />
            ) : (
              <GraduationCap className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-bold leading-tight text-ink-900">{brandName}</p>
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-ink-400">{portalLabel}</p>
          </div>
          <button
            className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {visibleSections.map((section, i) => (
            <div key={i} className={cn(i > 0 && 'mt-5')}>
              {section.title && (
                <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition',
                        isActive
                          ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
                          : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                      )
                    }
                  >
                    <span className="shrink-0">{renderNavIcon(item.icon)}</span>
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-ink-200 p-3">
          <UserMenu name={user?.name} email={user?.email} role={user?.role} onLogout={handleLogout} portal={portal} />
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-ink-900/40 backdrop-blur-[1px] lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* -------------------------------- Main --------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-ink-200 bg-white/85 px-4 backdrop-blur-md sm:px-6">
          <button
            className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {searchEnabled ? <GlobalSearch portal={portal} /> : <div className="flex-1" />}

          {isTenantPortal && (
            <div className="flex items-center gap-1.5">
              <NotificationBell portal={portal} />
            </div>
          )}
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {/*
            Page-level Suspense boundary. Lazy page chunks resolve here, so the
            sidebar, header and notification bell stay mounted and interactive
            during a transition — only the content region is pending, and the
            indicator is a non-blocking top bar rather than an overlay.
          */}
          <Suspense fallback={<RouteProgress />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------- User menu -------------------------------- */

function UserMenu({
  name,
  email,
  role,
  onLogout,
  portal,
}: {
  name?: string;
  email?: string;
  role?: string;
  onLogout: () => void;
  portal: PortalKey;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const settingsPath = portal === 'owner' ? '/owner/settings' : `/${portal}/profile`;

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-full overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-lift">
          <Link
            to={settingsPath}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
          >
            {portal === 'owner' ? <Settings className="h-4 w-4 text-ink-400" /> : <UserIcon className="h-4 w-4 text-ink-400" />}
            {portal === 'owner' ? 'Platform settings' : 'My profile'}
          </Link>
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition hover:bg-ink-100"
      >
        <Avatar name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink-900">{name ?? '—'}</p>
          <p className="truncate text-[11px] text-ink-500">{role ? titleCase(role) : email}</p>
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-400 transition', open && 'rotate-180')} />
      </button>
    </div>
  );
}

/* ------------------------------ Global search ------------------------------ */

function GlobalSearch({ portal }: { portal: PortalKey }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => api.get<{ results: SearchResult[] }>('/comm/search', { q: debounced }),
    enabled: debounced.trim().length >= 2,
  });

  const results = data?.results ?? [];

  return (
    <div ref={ref} className="relative flex-1 max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={SEARCH_PLACEHOLDER[portal] ?? "Search…"}
        className="h-10 w-full rounded-xl border border-ink-200 bg-ink-50/70 pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 transition focus:border-[var(--brand-primary)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--brand-primary)]/10"
      />
      {open && debounced.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-96 overflow-y-auto rounded-xl border border-ink-200 bg-white py-1.5 shadow-lift">
          {isFetching && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-ink-500">
              <Spinner className="h-4 w-4" /> Searching…
            </div>
          )}
          {!isFetching && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink-500">No matches for “{debounced}”.</p>
          )}
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => {
                navigate(r.link);
                setOpen(false);
                setQ('');
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ink-50"
            >
              <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                {r.type}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink-900">{r.title}</span>
                {r.subtitle && <span className="block truncate text-xs text-ink-500">{r.subtitle}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Notification bell --------------------------- */

function NotificationBell({ portal }: { portal: PortalKey }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', { limit: 12 }],
    queryFn: () => api.get<{ items: NotificationItem[]; unread: number }>('/comm/notifications', { limit: 12 }),
    refetchInterval: 60_000,
  });

  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  const markRead = async (ids?: string[]) => {
    await api.post('/comm/notifications/read', ids ? { ids } : { all: true });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-xl p-2 text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[340px] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lift">
          <div className="flex items-center justify-between border-b border-ink-200 px-4 py-2.5">
            <p className="text-sm font-semibold text-ink-900">Notifications</p>
            {unread > 0 && (
              <button onClick={() => markRead()} className="flex items-center gap-1 text-xs font-medium text-[var(--brand-primary)] hover:underline">
                <Check className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {isLoading && <div className="px-4 py-6 text-center text-sm text-ink-500">Loading…</div>}
            {!isLoading && items.length === 0 && (
              <div className="px-4 py-8 text-center">
                <Bell className="mx-auto mb-2 h-5 w-5 text-ink-300" />
                <p className="text-sm text-ink-500">You're all caught up.</p>
              </div>
            )}
            {items.map((n) => (
              <button
                key={n._id}
                onClick={() => {
                  if (!n.isRead) void markRead([n._id]);
                  // Resolve against the active portal: announcement links are
                  // stored portal-less because one announcement reaches several
                  // portals at once. Navigating to the raw value 404'd.
                  const target = notificationPath(n, portal);
                  if (target) navigate(target);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full gap-3 border-b border-ink-100 px-4 py-3 text-left transition last:border-0 hover:bg-ink-50',
                  !n.isRead && 'bg-[var(--brand-primary)]/[0.04]',
                )}
              >
                <span
                  className={cn(
                    'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                    n.isRead ? 'bg-transparent' : 'bg-[var(--brand-primary)]',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink-900">{n.title}</span>
                  <span className="mt-0.5 block line-clamp-2 text-xs text-ink-600">{n.message}</span>
                  <span className="mt-1 block text-[11px] text-ink-400">{fromNow(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { Button };


const SEARCH_PLACEHOLDER: Partial<Record<PortalKey, string>> = {
  admin: 'Search students, leads, courses…',
  teacher: 'Search students, batches, classes…',
  student: 'Search courses, lessons, material…',
  parent: 'Search your children, results, fees…',
};

/**
 * Accepts either `<Icon className={ICON} />` or a bare `Icon` component.
 * Lucide icons are forwardRef *objects*, not functions, so test for a valid
 * element rather than for `typeof === 'function'`.
 */
function renderNavIcon(icon: NavIcon): ReactNode {
  if (isValidElement(icon)) return icon;
  if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null)) {
    const Icon = icon as ComponentType<{ className?: string }>;
    return <Icon className="h-[18px] w-[18px]" />;
  }
  return null;
}
