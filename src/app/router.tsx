import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';
import { AdminGuard } from './AdminGuard';
import { AdminLayout } from '../components/layout/AdminLayout';
import { EmployeeLayout } from '../components/layout/EmployeeLayout';
import { ClientLayout } from '../components/layout/ClientLayout';

import { LoginPage } from '../features/auth/pages/LoginPage';
import { ChangePasswordPage } from '../features/auth/pages/ChangePasswordPage';
import { LeavePage } from '../features/auth/pages/LeavePage';

import { AdminDashboardPage } from '../features/admin/pages/AdminDashboardPage';
import { AdminUsersPage } from '../features/admin/pages/AdminUsersPage';
import { MonthlyReportPage } from '../features/reports/pages/MonthlyReportPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { PersonProfilePage } from '../features/people/PersonProfilePage';

import { DashboardPage } from '../features/dashboard/pages/DashboardPage';

import { CalendarPage } from '../features/calendar/pages/CalendarPage';
import { ActivityPage } from '../features/notifications/pages/ActivityPage';
import { OfficePage } from '../features/office/pages/OfficePage';
import { ProjectsPage } from '../features/projects/pages/ProjectsPage';
import { ProjectDetailPage } from '../features/projects/pages/ProjectDetailPage';
import { SubfolderPage } from '../features/projects/pages/SubfolderPage';
import { TasksPage } from '../features/tasks/pages/TasksPage';
import { TaskDetailPage } from '../features/tasks/pages/TaskDetailPage';
import { ChatPage } from '../features/chat/pages/ChatPage';
import { ProfilePage } from '../features/employee/pages/ProfilePage';

import { ReviewsPage } from '../features/reviews/pages/ReviewsPage';
import { ClientJoinPage } from '../features/client/pages/ClientJoinPage';
import { ClientHomePage } from '../features/client/pages/ClientHomePage';
import { ClientChatsPage, PortalEntry } from '../features/client/pages/ClientChatsPage';
import { ClientApprovalsPage } from '../features/client/pages/ClientApprovalsPage';
import { ClientDeliverablesPage } from '../features/client/pages/ClientDeliverablesPage';
import { ClientRequirementsPage } from '../features/client/pages/ClientRequirementsPage';
import { ClientMeetingsPage } from '../features/client/pages/ClientMeetingsPage';

import { useAuthStore } from '../store/authStore';
import { homeForRole } from './roleHome';

const RootRedirect: React.FC = () => {
  const { user, initialized, loadCurrentUser } = useAuthStore();
  React.useEffect(() => {
    if (!initialized) loadCurrentUser();
  }, [initialized, loadCurrentUser]);
  if (!initialized) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <Navigate to={homeForRole(user.role)} replace />;
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootRedirect />
  },
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    path: '/join/:code',
    element: <ClientJoinPage />
  },
  {
    path: '/change-password',
    element: (
      <AuthGuard>
        <ChangePasswordPage />
      </AuthGuard>
    )
  },
  {
    path: '/app/leave',
    element: (
      <AuthGuard>
        <LeavePage />
      </AuthGuard>
    )
  },
  {
    path: '/admin',
    element: (
      <AuthGuard>
        <AdminGuard>
          <AdminLayout />
        </AdminGuard>
      </AuthGuard>
    ),
    children: [
      { path: 'dashboard', element: <AdminDashboardPage /> },
      { path: 'liveboard', element: <Navigate to="/admin/dashboard" replace /> },
      { path: 'attendance', element: <Navigate to="/admin/dashboard" replace /> },
      { path: 'workload', element: <Navigate to="/admin/dashboard" replace /> },
      { path: 'users', element: <AdminUsersPage /> },
      { path: 'reports', element: <MonthlyReportPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:id', element: <ProjectDetailPage /> },
      { path: 'projects/:projectId/subfolders/:id', element: <SubfolderPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'tasks/:id', element: <TaskDetailPage /> },
      { path: 'reviews', element: <ReviewsPage /> },
      { path: 'submissions', element: <Navigate to="/admin/reviews" replace /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'calendar/:userId', element: <CalendarPage /> },
      { path: 'office', element: <OfficePage /> },
      { path: 'activity', element: <ActivityPage /> },
      { path: 'inbox', element: <Navigate to="../activity" replace /> },
      { path: 'chat', element: <ChatPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/:section', element: <SettingsPage /> },
      { path: 'people/:userId', element: <PersonProfilePage /> },
      { path: 'gamification', element: <Navigate to="/admin/dashboard" replace /> },
      { path: '*', element: <Navigate to="/admin/dashboard" replace /> }
    ]
  },
  {
    path: '/app',
    element: (
      <AuthGuard roles={['employee']}>
        <EmployeeLayout />
      </AuthGuard>
    ),
    children: [
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'attendance', element: <Navigate to="/app/dashboard" replace /> },
      { path: 'reports', element: <MonthlyReportPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'tasks/:id', element: <TaskDetailPage /> },
      { path: 'reviews', element: <ReviewsPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:id', element: <ProjectDetailPage /> },
      { path: 'projects/:projectId/subfolders/:id', element: <SubfolderPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'calendar/:userId', element: <CalendarPage /> },
      { path: 'office', element: <OfficePage /> },
      { path: 'activity', element: <ActivityPage /> },
      { path: 'inbox', element: <Navigate to="../activity" replace /> },
      { path: 'chat', element: <ChatPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/:section', element: <SettingsPage /> },
      { path: 'people/:userId', element: <PersonProfilePage /> },
      { path: 'gamification', element: <Navigate to="/app/dashboard" replace /> },
      { path: '*', element: <Navigate to="/app/dashboard" replace /> }
    ]
  },
  {
    path: '/client',
    element: (
      <AuthGuard roles={['client']}>
        <ClientLayout />
      </AuthGuard>
    ),
    children: [
      { path: 'portal', element: <PortalEntry /> },
      { path: 'home', element: <ClientHomePage /> },
      { path: 'chats', element: <ClientChatsPage /> },
      { path: 'approvals', element: <ClientApprovalsPage /> },
      { path: 'deliverables', element: <ClientDeliverablesPage /> },
      { path: 'requirements', element: <ClientRequirementsPage /> },
      { path: 'meetings', element: <ClientMeetingsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/:section', element: <SettingsPage /> },
      { path: 'people/:userId', element: <PersonProfilePage /> },
      { path: '*', element: <Navigate to="/client/home" replace /> }
    ]
  },
  {
    path: '*',
    element: <Navigate to="/" replace />
  }
]);

