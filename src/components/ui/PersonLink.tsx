import React from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { profilePath } from '../../features/settings/settingsMenu';

/** Wrap anyone's avatar or name to make it open their profile view. Renders plain children if there is no person to open. */
export const PersonLink: React.FC<{ userId?: string | null; className?: string; children: React.ReactNode }> = ({
  userId,
  className = '',
  children
}) => {
  const role = useAuthStore((s) => s.user?.role);
  if (!userId) return <>{children}</>;
  return (
    <Link
      to={profilePath(role, userId)}
      onClick={(e) => e.stopPropagation()} // a person inside a clickable row opens the profile, not the row
      className={`rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-primary)] hover:underline ${className}`}
    >
      {children}
    </Link>
  );
};
