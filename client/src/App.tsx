import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RequirePortal, RedirectIfAuthed } from '@/components/RouteGuards';
import { useAuth, portalForRole } from '@/lib/auth';
import { EmptyState, Button } from '@/components/ui';
import { Compass } from 'lucide-react';
import { RouteProgress, AppPreloader } from '@/components/AppPreloader';

/**
 * Each portal is code-split so its bundle is fetched on demand. This keeps the
 * initial load small and gives route transitions a real pending state, which
 * <RouteProgress /> reflects (only when the chunk isn't already cached).
 */
const OwnerRoutes = lazy(() => import('@/pages/owner/routes').then((m) => ({ default: m.OwnerRoutes })));
const AdminRoutes = lazy(() => import('@/pages/admin/routes').then((m) => ({ default: m.AdminRoutes })));
const TeacherRoutes = lazy(() => import('@/pages/teacher/routes').then((m) => ({ default: m.TeacherRoutes })));
const StudentRoutes = lazy(() => import('@/pages/student/routes').then((m) => ({ default: m.StudentRoutes })));
const ParentRoutes = lazy(() => import('@/pages/parent/routes').then((m) => ({ default: m.ParentRoutes })));

export default function App() {
  return (
    <Suspense fallback={<RouteProgress />}>
      <Routes>
        {/* ------------------------------- Logins -------------------------------- */}
        <Route path="/owner/login" element={<RedirectIfAuthed portal="owner"><LoginPage portal="owner" /></RedirectIfAuthed>} />
        <Route path="/admin/login" element={<RedirectIfAuthed portal="admin"><LoginPage portal="admin" /></RedirectIfAuthed>} />
        <Route path="/teacher/login" element={<RedirectIfAuthed portal="teacher"><LoginPage portal="teacher" /></RedirectIfAuthed>} />
        <Route path="/student/login" element={<RedirectIfAuthed portal="student"><LoginPage portal="student" /></RedirectIfAuthed>} />
        <Route path="/parent/login" element={<RedirectIfAuthed portal="parent"><LoginPage portal="parent" /></RedirectIfAuthed>} />

        {/* ------------------------------- Portals ------------------------------- */}
        <Route path="/owner/*" element={<RequirePortal portal="owner"><OwnerRoutes /></RequirePortal>} />
        <Route path="/admin/*" element={<RequirePortal portal="admin"><AdminRoutes /></RequirePortal>} />
        <Route path="/teacher/*" element={<RequirePortal portal="teacher"><TeacherRoutes /></RequirePortal>} />
        <Route path="/student/*" element={<RequirePortal portal="student"><StudentRoutes /></RequirePortal>} />
        <Route path="/parent/*" element={<RequirePortal portal="parent"><ParentRoutes /></RequirePortal>} />

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <AppPreloader />;
  if (user) return <Navigate to={`/${portalForRole(user.role)}`} replace />;
  return <Navigate to="/admin/login" replace />;
}

function NotFound() {
  const { user } = useAuth();
  const home = user ? `/${portalForRole(user.role)}` : '/admin/login';
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="card w-full max-w-md">
        <EmptyState
          icon={<Compass className="h-6 w-6" />}
          title="Page not found"
          description="The page you're looking for doesn't exist or you don't have access to it."
          action={
            <Button onClick={() => (window.location.href = home)}>Back to dashboard</Button>
          }
        />
      </div>
    </div>
  );
}
