import React from 'react';
import { NavLink } from 'react-router-dom';
import { Briefcase, Calendar, CheckSquare, ClipboardList, Layers, LayoutDashboard, MessageSquare, ShieldQuestion, Users } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNavCounts } from '../../hooks/useNavCounts';
import { CountBadge } from '../ui/CountBadge';

export const BottomTabBar: React.FC = () => {
  const { user } = useAuthStore();
  const counts = useNavCounts();

  const isAdmin = user?.role === 'admin';
  const isClient = user?.role === 'client';
  const prefix = isAdmin ? '/admin' : '/app';

  const navItems = isClient
    ? [
        { label: 'Home', icon: LayoutDashboard, path: '/client/home' },
        { label: 'Chats', icon: MessageSquare, path: '/client/chats', count: counts.unreadChats },
        { label: 'Approvals', icon: ShieldQuestion, path: '/client/approvals' },
        { label: 'Deliverables', icon: Layers, path: '/client/deliverables' },
        { label: 'Requirements', icon: ClipboardList, path: '/client/requirements' }
      ]
    : isAdmin
    ? [
        { label: 'Dashboard', icon: LayoutDashboard, path: `${prefix}/dashboard` },
        { label: 'Calendar', icon: Calendar, path: `${prefix}/calendar` },
        { label: 'Team', icon: Users, path: `${prefix}/users` },
        { label: 'Tasks', icon: CheckSquare, path: `${prefix}/tasks`, count: counts.tasksUnseen },
        { label: 'Chat', icon: MessageSquare, path: `${prefix}/chat`, count: counts.unreadChats }
      ]
    : [
        { label: 'Dashboard', icon: LayoutDashboard, path: `${prefix}/dashboard` },
        { label: 'Tasks', icon: CheckSquare, path: `${prefix}/tasks`, count: counts.tasksUnseen },
        { label: 'Projects', icon: Briefcase, path: `${prefix}/projects`, count: counts.projects },
        { label: 'Calendar', icon: Calendar, path: `${prefix}/calendar` },
        { label: 'Chat', icon: MessageSquare, path: `${prefix}/chat`, count: counts.unreadChats }
      ];

  return (
    <div className="tm-sidebar fixed bottom-3 left-3 right-3 z-50 flex h-16 items-center justify-around rounded-full px-2 lg:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center gap-1 rounded-full px-3 py-1.5 transition-colors ${
                isActive
                  ? 'text-[var(--tm-solid)] font-bold'
                  : 'text-[var(--tm-ink-muted)] hover:text-[var(--tm-ink)]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative">
                  <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                  <CountBadge count={item.count} className="absolute -right-2.5 -top-2" />
                </div>
                <span className="text-[10px] tracking-tight">{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </div>
  );
};
