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
import { AdminSettingsPage } from '../features/admin/pages/AdminSettingsPage';

import { AttendancePage } from '../features/attendance/pages/AttendancePage';
import { AdminAttendancePage } from '../features/attendance/pages/AdminAttendancePage';

import { CalendarPage } from '../features/calendar/pages/CalendarPage';
import { ProjectsPage } from '../features/projects/pages/ProjectsPage';
import { ProjectDetailPage } from '../features/projects/pages/ProjectDetailPage';
import { TasksPage } from '../features/tasks/pages/TasksPage';
import { TaskDetailPage } from '../features/tasks/pages/TaskDetailPage';
import { ChatPage } from '../features/chat/pages/ChatPage';
import { DailyUpdatesPage } from '../features/gamification/pages/DailyUpdatesPage';
import { MonthlyWrappedPage } from '../features/gamification/pages/MonthlyWrappedPage';
import { ProfilePage } from '../features/employee/pages/ProfilePage';

import { SubmissionsFeedPage } from '../features/admin/pages/SubmissionsFeedPage';
import { ClientJoinPage } from '../features/client/pages/ClientJoinPage';
import { ClientPortalPage } from '../features/client/pages/ClientPortalPage';

import { useAuthStore } from '../store/authStore';

const RootRedirect: React.FC = () => {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  if (user.role === 'client') return <Navigate to="/client/portal" replace />;
  return <Navigate to="/app/attendance" replace />;
};

const WrappedRedirect: React.FC = () => {
  const { user } = useAuthStore();
  if (user?.role === 'admin') return <Navigate to="/admin/wrapped" replace />;
  return <Navigate to="/app/wrapped" replace />;
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
      { path: 'liveboard', element: <Navigate to="/admin/attendance" replace /> },
      { path: 'daily-updates', element: <DailyUpdatesPage /> },
      { path: 'workload', element: <Navigate to="/admin/dashboard" replace /> },
      { path: 'users', element: <AdminUsersPage /> },
      { path: 'attendance', element: <AdminAttendancePage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:id', element: <ProjectDetailPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'tasks/:id', element: <TaskDetailPage /> },
      { path: 'submissions', element: <SubmissionsFeedPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'chat', element: <ChatPage /> },
      { path: 'wrapped', element: <Navigate to="/admin/dashboard" replace /> },
      { path: 'settings', element: <AdminSettingsPage /> },
      { path: 'gamification', element: <Navigate to="/admin/dashboard" replace /> },
      { path: '*', element: <Navigate to="/admin/dashboard" replace /> }
    ]
  },
  {
    path: '/app',
    element: (
      <AuthGuard>
        <EmployeeLayout />
      </AuthGuard>
    ),
    children: [
      { path: 'attendance', element: <AttendancePage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'tasks/:id', element: <TaskDetailPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:id', element: <ProjectDetailPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'chat', element: <ChatPage /> },
      { path: 'wrapped', element: <MonthlyWrappedPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'gamification', element: <Navigate to="/app/attendance" replace /> },
      { path: '*', element: <Navigate to="/app/attendance" replace /> }
    ]
  },
  {
    path: '/wrapped',
    element: (
      <AuthGuard>
        <WrappedRedirect />
      </AuthGuard>
    )
  },
  {
    path: '/client',
    element: (
      <AuthGuard>
        <ClientLayout />
      </AuthGuard>
    ),
    children: [
      { path: 'portal', element: <ClientPortalPage /> },
      { path: '*', element: <Navigate to="/client/portal" replace /> }
    ]
  },
  {
    path: '*',
    element: <Navigate to="/" replace />
  }
]);

