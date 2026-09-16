import { Routes, Route, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, Users, Layers, ClipboardCheck, Award, FileText, Megaphone, BookOpen,
} from 'lucide-react';
import { PortalLayout, NavSection } from '@/layouts/PortalLayout';
import { TeacherDashboard } from './Dashboard';
import { TeacherSchedule } from './Schedule';
import { TeacherStudents } from './Students';
import { TeacherBatches } from './Batches';
import { AttendancePage } from '@/pages/admin/Attendance';
import { ResultsPage } from '@/pages/admin/Results';
import { AssignmentsPage } from '@/pages/admin/Assignments';
import { MaterialsPage } from '@/pages/admin/Materials';
import { TeacherAnnouncements } from './Announcements';
import { ProfilePage } from '@/pages/shared/Profile';
import { NotFoundInline } from '@/pages/shared/NotFoundInline';

const SECTIONS: NavSection[] = [
  {
    items: [{ to: '/teacher', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    title: 'Teaching',
    items: [
      { to: '/teacher/schedule', label: 'My schedule', icon: CalendarDays },
      { to: '/teacher/batches', label: 'My batches', icon: Layers },
      { to: '/teacher/students', label: 'My students', icon: Users },
      { to: '/teacher/attendance', label: 'Attendance', icon: ClipboardCheck, permission: 'attendance:read' },
    ],
  },
  {
    title: 'Assessment',
    items: [
      { to: '/teacher/results', label: 'Results', icon: Award, permission: 'result:read' },
      { to: '/teacher/assignments', label: 'Assignments', icon: FileText, permission: 'assignment:read' },
      { to: '/teacher/materials', label: 'Study material', icon: BookOpen, permission: 'material:read' },
    ],
  },
  {
    title: 'Workspace',
    items: [{ to: '/teacher/announcements', label: 'Announcements', icon: Megaphone }],
  },
];

export function TeacherRoutes() {
  return (
    <Routes>
      <Route element={<PortalLayout portal="teacher" portalLabel="Teacher portal" sections={SECTIONS} />}>
        <Route index element={<TeacherDashboard />} />
        <Route path="schedule" element={<TeacherSchedule />} />
        <Route path="batches" element={<TeacherBatches />} />
        <Route path="students" element={<TeacherStudents />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="materials" element={<MaterialsPage />} />
        <Route path="announcements" element={<TeacherAnnouncements />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundInline />} />
      </Route>
      <Route path="login" element={<Navigate to="/teacher" replace />} />
    </Routes>
  );
}
