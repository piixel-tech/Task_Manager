import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore();

  if (user?.role !== 'admin') {
    return <Navigate to="/app/tasks" replace />;
  }

  return <>{children}</>;
};
