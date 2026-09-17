import { Routes, Route, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, CalendarDays, ClipboardCheck, Award, FileText, Wallet, Megaphone, Library,
} from 'lucide-react';
import { PortalLayout, NavSection } from '@/layouts/PortalLayout';
import { StudentDashboard } from './Dashboard';
import { StudentCourses } from './Courses';
import { CoursePlayer } from './CoursePlayer';
import {
  StudentAttendance, StudentResults, StudentFees, StudentSchedule, StudentAssignments, StudentMaterials,
} from './Pages';
import { AnnouncementFeed } from '@/pages/teacher/Announcements';
import { ProfilePage } from '@/pages/shared/Profile';
import { NotFoundInline } from '@/pages/shared/NotFoundInline';
import { AnnouncementDetailPage } from '@/pages/AnnouncementDetail';

const SECTIONS: NavSection[] = [
  { items: [{ to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    title: 'Learning',
    items: [
      { to: '/student/courses', label: 'My courses', icon: BookOpen },
      { to: '/student/materials', label: 'Study material', icon: Library },
      { to: '/student/assignments', label: 'Assignments', icon: FileText },
    ],
  },
  {
    title: 'Progress',
    items: [
      { to: '/student/schedule', label: 'Schedule', icon: CalendarDays },
      { to: '/student/attendance', label: 'Attendance', icon: ClipboardCheck },
      { to: '/student/results', label: 'Results', icon: Award },
    ],
  },
  {
    title: 'Account',
    items: [
      { to: '/student/fees', label: 'Fees', icon: Wallet },
      { to: '/student/announcements', label: 'Announcements', icon: Megaphone },
    ],
  },
];

export function StudentRoutes() {
  return (
    <Routes>
      <Route element={<PortalLayout portal="student" portalLabel="Student portal" sections={SECTIONS} />}>
        <Route index element={<StudentDashboard />} />
        <Route path="courses" element={<StudentCourses />} />
        <Route path="courses/:id" element={<CoursePlayer />} />
        <Route path="materials" element={<StudentMaterials />} />
        <Route path="assignments" element={<StudentAssignments />} />
        <Route path="schedule" element={<StudentSchedule />} />
        <Route path="attendance" element={<StudentAttendance />} />
        <Route path="results" element={<StudentResults />} />
        <Route path="fees" element={<StudentFees />} />
        <Route path="announcements" element={<AnnouncementFeed title="Announcements" description="Notices from your academy." />} />
        <Route path="announcements/:id" element={<AnnouncementDetailPage portal="student" />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundInline />} />
      </Route>
      <Route path="login" element={<Navigate to="/student" replace />} />
    </Routes>
  );
}
