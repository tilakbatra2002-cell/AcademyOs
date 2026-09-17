import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserPlus, GraduationCap, BookOpen, CalendarDays, ClipboardCheck,
  Wallet, BarChart3, Megaphone, Settings, KanbanSquare, PhoneCall, Layers, Video,
  FileText, ClipboardList, Receipt, UserCog, CalendarRange, FolderOpen, Trophy,
} from 'lucide-react';
import { PortalLayout, NavSection } from '@/layouts/PortalLayout';
import { AdminDashboard } from './Dashboard';
import { LeadsPage } from './Leads';
import { LeadDetailPage } from './LeadDetail';
import { FollowUpsPage } from './FollowUps';
import { AdmissionsPage } from './Admissions';
import { StudentsPage } from './Students';
import { StudentDetailPage } from './StudentDetail';
import { ParentsPage } from './Parents';
import { TeachersPage } from './Teachers';
import { StaffPage } from './Staff';
import { CoursesPage } from './Courses';
import { SubjectsPage } from './Subjects';
import { MaterialsPage } from './Materials';
import { BatchesPage } from './Batches';
import { AttendancePage } from './Attendance';
import { ExamsPage } from './Exams';
import { FeePlansPage } from './FeePlans';
import { PaymentsPage } from './Payments';
import { InvoicesPage } from './Invoices';
import { AnnouncementsPage } from './Announcements';
import { DocumentsPage } from './Documents';
import { SettingsPage } from './Settings';
import { ProfilePage } from '@/pages/shared/Profile';
import { NotFoundInline } from '@/pages/shared/NotFoundInline';
import { AnnouncementDetailPage } from '@/pages/AnnouncementDetail';

/**
 * Heavier admin pages (charts, builders, calendars) are code-split so they are
 * fetched only when visited. Their Suspense boundary lives in PortalLayout, so
 * the shell stays interactive and only a slim top bar appears — and only if the
 * chunk actually takes long enough to warrant it.
 */
const ReportsPage = lazy(() => import('./Reports').then((m) => ({ default: m.ReportsPage })));
const CourseBuilderPage = lazy(() => import('./CourseBuilder').then((m) => ({ default: m.CourseBuilderPage })));
const TimetablePage = lazy(() => import('./Timetable').then((m) => ({ default: m.TimetablePage })));
const CalendarPage = lazy(() => import('./Calendar').then((m) => ({ default: m.CalendarPage })));
const AssignmentsPage = lazy(() => import('./Assignments').then((m) => ({ default: m.AssignmentsPage })));
const ResultsPage = lazy(() => import('./Results').then((m) => ({ default: m.ResultsPage })));
const PipelinePage = lazy(() => import('./Pipeline').then((m) => ({ default: m.PipelinePage })));
const VideosPage = lazy(() => import('./Videos').then((m) => ({ default: m.VideosPage })));

const ICON = 'h-[18px] w-[18px]';

const SECTIONS: NavSection[] = [
  {
    items: [{ to: '/admin', label: 'Dashboard', icon: <LayoutDashboard className={ICON} />, end: true }],
  },
  {
    title: 'Admissions',
    items: [
      { to: '/admin/pipeline', label: 'Pipeline', icon: <KanbanSquare className={ICON} />, permission: 'lead:read' },
      { to: '/admin/leads', label: 'Leads', icon: <UserPlus className={ICON} />, permission: 'lead:read' },
      { to: '/admin/follow-ups', label: 'Follow-ups', icon: <PhoneCall className={ICON} />, permission: 'followup:read' },
      { to: '/admin/admissions', label: 'Admissions', icon: <ClipboardList className={ICON} />, permission: 'admission:read' },
    ],
  },
  {
    title: 'People',
    items: [
      { to: '/admin/students', label: 'Students', icon: <GraduationCap className={ICON} />, permission: 'student:read' },
      { to: '/admin/parents', label: 'Parents', icon: <Users className={ICON} />, permission: 'parent:read' },
      { to: '/admin/teachers', label: 'Teachers', icon: <UserCog className={ICON} />, permission: 'teacher:read' },
      { to: '/admin/staff', label: 'Staff & roles', icon: <Users className={ICON} />, permission: 'user:read' },
    ],
  },
  {
    title: 'Academics',
    items: [
      { to: '/admin/courses', label: 'Courses', icon: <BookOpen className={ICON} />, permission: 'course:read' },
      { to: '/admin/subjects', label: 'Subjects', icon: <Layers className={ICON} />, permission: 'subject:read' },
      { to: '/admin/videos', label: 'Videos', icon: <Video className={ICON} />, permission: 'video:read' },
      { to: '/admin/materials', label: 'Study material', icon: <FileText className={ICON} />, permission: 'material:read' },
      { to: '/admin/batches', label: 'Batches', icon: <Layers className={ICON} />, permission: 'batch:read' },
      { to: '/admin/timetable', label: 'Timetable', icon: <CalendarDays className={ICON} />, permission: 'class:read' },
      { to: '/admin/attendance', label: 'Attendance', icon: <ClipboardCheck className={ICON} />, permission: 'attendance:read' },
      { to: '/admin/exams', label: 'Exams', icon: <Trophy className={ICON} />, permission: 'exam:read' },
      { to: '/admin/results', label: 'Results', icon: <BarChart3 className={ICON} />, permission: 'result:read' },
      { to: '/admin/assignments', label: 'Assignments', icon: <ClipboardList className={ICON} />, permission: 'assignment:read' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/admin/fee-plans', label: 'Fee plans', icon: <Wallet className={ICON} />, permission: 'feeplan:read' },
      { to: '/admin/payments', label: 'Payments', icon: <Receipt className={ICON} />, permission: 'payment:read' },
      { to: '/admin/invoices', label: 'Invoices', icon: <FileText className={ICON} />, permission: 'invoice:read' },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { to: '/admin/reports', label: 'Reports', icon: <BarChart3 className={ICON} />, permission: 'report:read' },
      { to: '/admin/announcements', label: 'Announcements', icon: <Megaphone className={ICON} />, permission: 'announcement:read' },
      { to: '/admin/calendar', label: 'Calendar', icon: <CalendarRange className={ICON} />, permission: 'calendar:read' },
      { to: '/admin/documents', label: 'Documents', icon: <FolderOpen className={ICON} />, permission: 'document:read' },
      { to: '/admin/settings', label: 'Settings', icon: <Settings className={ICON} />, permission: 'org:settings:read' },
    ],
  },
];

export function AdminRoutes() {
  return (
    <Routes>
      <Route element={<PortalLayout portal="admin" portalLabel="Admin portal" sections={SECTIONS} />}>
        <Route index element={<AdminDashboard />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="leads/:id" element={<LeadDetailPage />} />
        <Route path="follow-ups" element={<FollowUpsPage />} />
        <Route path="admissions" element={<AdmissionsPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="students/:id" element={<StudentDetailPage />} />
        <Route path="parents" element={<ParentsPage />} />
        <Route path="teachers" element={<TeachersPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="courses" element={<CoursesPage />} />
        <Route path="courses/:id/builder" element={<CourseBuilderPage />} />
        <Route path="subjects" element={<SubjectsPage />} />
        <Route path="videos" element={<VideosPage />} />
        <Route path="materials" element={<MaterialsPage />} />
        <Route path="batches" element={<BatchesPage />} />
        <Route path="timetable" element={<TimetablePage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="exams" element={<ExamsPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="fee-plans" element={<FeePlansPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="announcements/:id" element={<AnnouncementDetailPage portal="admin" />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundInline />} />
      </Route>
      <Route path="login" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
