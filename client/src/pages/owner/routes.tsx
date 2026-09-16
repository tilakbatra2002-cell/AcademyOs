import { Routes, Route, Navigate } from 'react-router-dom';
import { LayoutDashboard, Building2, CreditCard, Users, BarChart3, ScrollText, Settings } from 'lucide-react';
import { PortalLayout, NavSection } from '@/layouts/PortalLayout';
import { OwnerDashboard } from './Dashboard';
import { OwnerOrganizations } from './Organizations';
import { OwnerOrganizationDetail } from './OrganizationDetail';
import { OwnerSubscriptions, OwnerUsers, OwnerAuditLogs, OwnerReports, OwnerSettings } from './Pages';
import { ProfilePage } from '@/pages/shared/Profile';
import { NotFoundInline } from '@/pages/shared/NotFoundInline';

const SECTIONS: NavSection[] = [
  { items: [{ to: '/owner', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    title: 'Platform',
    items: [
      { to: '/owner/organizations', label: 'Academies', icon: Building2 },
      { to: '/owner/subscriptions', label: 'Subscriptions', icon: CreditCard },
      { to: '/owner/users', label: 'Users', icon: Users },
    ],
  },
  {
    title: 'Insights',
    items: [
      { to: '/owner/reports', label: 'Reports', icon: BarChart3 },
      { to: '/owner/audit-logs', label: 'Audit logs', icon: ScrollText },
      { to: '/owner/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function OwnerRoutes() {
  return (
    <Routes>
      <Route element={<PortalLayout portal="owner" portalLabel="Platform owner" sections={SECTIONS} />}>
        <Route index element={<OwnerDashboard />} />
        <Route path="organizations" element={<OwnerOrganizations />} />
        <Route path="organizations/:id" element={<OwnerOrganizationDetail />} />
        <Route path="subscriptions" element={<OwnerSubscriptions />} />
        <Route path="users" element={<OwnerUsers />} />
        <Route path="reports" element={<OwnerReports />} />
        <Route path="audit-logs" element={<OwnerAuditLogs />} />
        <Route path="settings" element={<OwnerSettings />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundInline />} />
      </Route>
      <Route path="login" element={<Navigate to="/owner" replace />} />
    </Routes>
  );
}
