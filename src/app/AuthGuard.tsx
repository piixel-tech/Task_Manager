import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import type { UserRole } from '../types';
import { homeForRole } from './roleHome';

export const AuthGuard: React.FC<{ children: React.ReactNode; roles?: UserRole[] }> = ({
  children,
  roles
}) => {
  const { user, isLoading, initialized, loadCurrentUser } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!initialized) {
      loadCurrentUser();
    }
  }, [initialized, loadCurrentUser]);

  if (!initialized || isLoading) {
    return (
      <div className="min-h-screen bg-[var(--tm-card-muted)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[var(--tm-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-[var(--tm-ink-muted)]">Loading Task Manager workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  return <>{children}</>;
};
