import type { UserRole } from '../types';

export const homeForRole = (role: UserRole): string => {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'client') return '/client/portal';
  return '/app/dashboard';
};
