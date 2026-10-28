import type { Company, User, UserRole } from '../../types';
import { api } from '../api';
import type { UserSettings } from './accountApi';

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  company_id: string | null;
  avatar_url: string | null;
  title?: string;
  phone?: string;
  bio?: string;
  must_change_password?: boolean;
  settings?: UserSettings;
  is_active: boolean;
  focus_until?: string | null;
  sidebar_state?: { open?: string[]; order?: Record<string, string[]> };
  created_at: string;
}

export interface ApiCompany {
  id: string;
  name: string;
}

export async function fetchCompanies(): Promise<ApiCompany[]> {
  const { data } = await api.get<ApiCompany[]>('/companies');
  return data;
}

/** Map a backend user onto the frontend `User` shape. */
export function toUser(u: ApiUser, companies: ApiCompany[]): User {
  const name = companies.find((c) => c.id === u.company_id)?.name.toLowerCase();
  return {
    id: u.id,
    name: u.name,
    jobTitle: u.title || u.role,
    phone: u.phone || undefined,
    bio: u.bio || undefined,
    mustChangePassword: u.must_change_password || undefined,
    settings: u.settings,
    company: (name === 'unwork' ? 'unwork' : 'piixel') as Company,
    companyId: u.company_id ?? undefined,
    role: u.role,
    loginId: u.email,
    active: u.is_active,
    avatarUrl: u.avatar_url ?? undefined,
    focusUntil: u.focus_until ?? undefined,
    sidebarState: u.sidebar_state && Object.keys(u.sidebar_state).length ? { open: u.sidebar_state.open ?? [], order: u.sidebar_state.order ?? {} } : undefined,
    joiningDate: u.created_at.slice(0, 10)
  };
}
