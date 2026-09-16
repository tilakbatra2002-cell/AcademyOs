import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RequirePortal, RedirectIfAuthed } from '@/components/RouteGuards';
import { useAuth, portalForRole } from '@/lib/auth';
import { PageLoader, EmptyState, Button } from '@/components/ui';
import { AdminRoutes } from '@/pages/admin/routes';
import { OwnerRoutes } from '@/pages/owner/routes';
import { TeacherRoutes } from '@/pages/teacher/routes';
import { StudentRoutes } from '@/pages/student/routes';
import { ParentRoutes } from '@/pages/parent/routes';
import { Compass } from 'lucide-react';

export default function App() {
  return (
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
  );
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
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
