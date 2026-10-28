import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { homeForRole } from './roleHome';

export const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore();

  if (user?.role !== 'admin') {
    return <Navigate to={user ? homeForRole(user.role) : '/login'} replace />;
  }

  return <>{children}</>;
};
