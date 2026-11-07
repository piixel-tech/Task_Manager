import type React from 'react';
import { Bell, Building2, Download, HelpCircle, Keyboard, KeyRound, Palette, PartyPopper, Plug, Settings2, Goal, ShieldCheck, Trash2, User, Users } from 'lucide-react';
import type { UserRole } from '../../types';

export interface SettingsItem {
  id: string;
  label: string;
  icon: React.ElementType;
  /** Who gets it. Admin-only items never show up for anyone else. */
  roles: UserRole[];
}

const EVERYONE: UserRole[] = ['admin', 'employee', 'client'];
const TEAM: UserRole[] = ['admin', 'employee'];

/** "Me": the same list for admins and employees; clients get a shorter one (no Focus mode, Connected apps or shortcuts). */
export const ME_ITEMS: SettingsItem[] = [
  { id: 'profile', label: 'My profile', icon: User, roles: EVERYONE },
  { id: 'password', label: 'Change password', icon: KeyRound, roles: EVERYONE },
  { id: 'notifications', label: 'Notifications', icon: Bell, roles: EVERYONE },
  { id: 'focus', label: 'Focus mode', icon: Goal, roles: TEAM },
  { id: 'appearance', label: 'Appearance', icon: Palette, roles: EVERYONE },
  { id: 'connected-apps', label: 'Connected apps', icon: Plug, roles: TEAM },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard, roles: TEAM },
  { id: 'help', label: 'Help', icon: HelpCircle, roles: EVERYONE }
];

export const ADMIN_ITEMS: SettingsItem[] = [
  { id: 'people', label: 'People', icon: Users, roles: ['admin'] },
  { id: 'companies', label: 'Companies', icon: Building2, roles: ['admin'] },
  { id: 'workspace', label: 'Workspace settings', icon: Settings2, roles: ['admin'] },
  { id: 'festival', label: 'Festival theme', icon: PartyPopper, roles: ['admin'] },
  { id: 'trash', label: 'Trash', icon: Trash2, roles: ['admin'] },
  { id: 'export', label: 'Export', icon: Download, roles: ['admin'] },
  { id: 'security', label: 'Security', icon: ShieldCheck, roles: ['admin'] }
];

/** URL prefix of each role's part of the app. */
export const basePath = (role: UserRole | undefined): string => (role === 'admin' ? '/admin' : role === 'client' ? '/client' : '/app');

/** The groups of settings a role may open. Anything not returned here does not exist for that role. */
export const settingsGroupsFor = (role: UserRole | undefined) =>
  [
    { title: 'Me', items: ME_ITEMS },
    { title: 'Admin', items: ADMIN_ITEMS }
  ]
    .map((g) => ({ ...g, items: g.items.filter((i) => !!role && i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);

/** Where a person's profile view lives (the same page for every role). */
export const profilePath = (viewerRole: UserRole | undefined, userId: string): string => `${basePath(viewerRole)}/people/${userId}`;
