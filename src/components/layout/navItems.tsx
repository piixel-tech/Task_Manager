import React from 'react';
import {
  Briefcase,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Home,
  Activity,
  Layers,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Settings,
  ShieldQuestion,
  Users
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useNavCounts } from '../../hooks/useNavCounts';
import { usePendingApprovals } from '../../features/client/usePendingApprovals';
import { useLeaveInbox } from '../../store/useLeaveInboxStore';

export interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  count?: number;
}

/** `main` sits in the header pill, `more` in its "More" dropdown (and both in the phone drawer). */
export interface NavModel {
  main: NavItem[];
  more: NavItem[];
}

type Render = (nav: NavModel) => React.ReactNode;

/** The client's places. Its own component so approvals only load for clients. */
const ClientSource: React.FC<{ children: Render }> = ({ children }) => {
  const counts = useNavCounts();
  const { items: pending } = usePendingApprovals();
  return (
    <>
      {children({
        main: [
          { label: 'Home', icon: Home, path: '/client/home' },
          { label: 'Chats', icon: MessagesSquare, path: '/client/chats', count: counts.unreadChats },
          { label: 'Approvals', icon: ShieldQuestion, path: '/client/approvals', count: pending.length },
          { label: 'Deliverables', icon: Layers, path: '/client/deliverables' },
          { label: 'Requirements', icon: ClipboardList, path: '/client/requirements' }
        ],
        more: [{ label: 'Book a meeting', icon: CalendarClock, path: '/client/meetings' }]
      })}
    </>
  );
};

const TeamSource: React.FC<{ children: Render }> = ({ children }) => {
  const { user } = useAuthStore();
  const counts = useNavCounts();
  const unreadNotifications = useNotificationStore((s) => s.unreadCount);
  const isAdmin = user?.role === 'admin';
  const prefix = isAdmin ? '/admin' : '/app';
  // The number of leave requests waiting for this admin (kept live; nothing is loaded for anyone else).
  const leaveInbox = useLeaveInbox(isAdmin);

  const main: NavItem[] = [
    { label: 'Home', icon: LayoutDashboard, path: `${prefix}/dashboard` },
    { label: 'Projects', icon: Briefcase, path: `${prefix}/projects` },
    { label: isAdmin ? 'Task Hub' : 'My Tasks', icon: CheckSquare, path: `${prefix}/tasks`, count: counts.tasksUnseen },
    { label: 'Chats', icon: MessagesSquare, path: `${prefix}/chat`, count: counts.unreadChats },
    { label: 'Office board', icon: Megaphone, path: `${prefix}/office`, count: counts.officeUnseen }
  ];

  const more: NavItem[] = [
    { label: 'Activity', icon: Activity, path: `${prefix}/activity`, count: unreadNotifications },
    { label: 'Calendar', icon: Calendar, path: `${prefix}/calendar` },
    isAdmin
      ? { label: 'Leave requests', icon: CalendarCheck, path: `${prefix}/leave-requests`, count: leaveInbox.pending.length }
      : { label: 'Leave', icon: CalendarOff, path: `${prefix}/leave-requests` },
    { label: 'Reviews', icon: ClipboardCheck, path: `${prefix}/reviews`, count: counts.pendingSubmissions },
    { label: 'Monthly Report', icon: FileText, path: `${prefix}/reports` },
    ...(isAdmin
      ? [
          { label: 'Team Members', icon: Users, path: `${prefix}/users` },
          { label: 'Settings', icon: Settings, path: `${prefix}/settings` }
        ]
      : [
          { label: 'Settings', icon: Settings, path: `${prefix}/settings/profile` }
        ])
  ];

  return <>{children({ main, more })}</>;
};

/** Gives its render-prop the nav for the signed-in role, so the header pill and the phone drawer never drift apart. */
export const WithNavItems: React.FC<{ children: Render }> = ({ children }) => {
  const role = useAuthStore((s) => s.user?.role);
  if (!role) return null;
  return role === 'client' ? <ClientSource>{children}</ClientSource> : <TeamSource>{children}</TeamSource>;
};
