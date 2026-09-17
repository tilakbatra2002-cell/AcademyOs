import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, PORTAL_ROLES, portalForRole } from '@/lib/auth';
import { EmptyState, Button } from '@/components/ui';
import { AppPreloader } from '@/components/AppPreloader';
import { ShieldAlert } from 'lucide-react';
import type { PortalKey } from '@/types';

/**
 * Route guards are a UX convenience only — the backend independently enforces
 * every permission. Hiding a route here never grants or protects access.
 */

export function RequirePortal({ portal, children }: { portal: PortalKey; children: ReactNode }) {
  const { user, organization, loading } = useAuth();
  const location = useLocation();

  // Branded splash while the session is restored / the authenticated app boots.
  // `loading` is set false in a finally block, so a failed /auth/me cannot hang here.
  if (loading) {
    return (
      <AppPreloader
        logoUrl={organization?.branding?.logoUrl}
        brandName={organization?.name ?? 'AcademyOS'}
      />
    );
  }
  if (!user) return <Navigate to={`/${portal}/login`} state={{ from: location.pathname }} replace />;

  // Signed in, but into a different portal — send them to the right one.
  if (!PORTAL_ROLES[portal].includes(user.role)) {
    return <Navigate to={`/${portalForRole(user.role)}`} replace />;
  }
  return <>{children}</>;
}

export function RedirectIfAuthed({ portal, children }: { portal: PortalKey; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AppPreloader />;
  if (user) return <Navigate to={`/${portalForRole(user.role)}`} replace />;
  void portal;
  return <>{children}</>;
}

export function RequirePermission({
  permission,
  children,
  fallbackTo,
}: {
  permission: string | string[];
  children: ReactNode;
  fallbackTo?: string;
}) {
  const { can } = useAuth();
  const needed = Array.isArray(permission) ? permission : [permission];
  const allowed = needed.some((p) => can(p));

  if (!allowed) {
    if (fallbackTo) return <Navigate to={fallbackTo} replace />;
    return (
      <EmptyState
        icon={<ShieldAlert className="h-6 w-6" />}
        title="You don't have access to this"
        description="Your role doesn't include permission for this section. Contact your administrator if you think this is a mistake."
        action={
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            Go back
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}
