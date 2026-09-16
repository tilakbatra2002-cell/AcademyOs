import { Routes, Route, Navigate } from 'react-router-dom';
import { LayoutDashboard, Users, Megaphone } from 'lucide-react';
import { PortalLayout, NavSection } from '@/layouts/PortalLayout';
import { ParentDashboard } from './Dashboard';
import { ChildDetail } from './ChildDetail';
import { ParentChildren } from './Children';
import { AnnouncementFeed } from '@/pages/teacher/Announcements';
import { ProfilePage } from '@/pages/shared/Profile';
import { NotFoundInline } from '@/pages/shared/NotFoundInline';

const SECTIONS: NavSection[] = [
  { items: [{ to: '/parent', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    title: 'Family',
    items: [
      { to: '/parent/children', label: 'My children', icon: Users },
      { to: '/parent/announcements', label: 'Announcements', icon: Megaphone },
    ],
  },
];

export function ParentRoutes() {
  return (
    <Routes>
      <Route element={<PortalLayout portal="parent" portalLabel="Parent portal" sections={SECTIONS} />}>
        <Route index element={<ParentDashboard />} />
        <Route path="children" element={<ParentChildren />} />
        <Route path="children/:studentId" element={<ChildDetail />} />
        <Route path="announcements" element={<AnnouncementFeed title="Announcements" description="Notices from your child's academy." />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundInline />} />
      </Route>
      <Route path="login" element={<Navigate to="/parent" replace />} />
    </Routes>
  );
}
