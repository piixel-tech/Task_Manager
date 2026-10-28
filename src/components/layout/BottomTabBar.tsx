import React from 'react';
import { NavLink } from 'react-router-dom';
import { Briefcase, Calendar, CheckSquare, LayoutDashboard, MessageSquare, Users } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNavCounts } from '../../hooks/useNavCounts';

export const BottomTabBar: React.FC = () => {
  const { user } = useAuthStore();
  const counts = useNavCounts();

  const isAdmin = user?.role === 'admin';
  const prefix = isAdmin ? '/admin' : '/app';

  const navItems = isAdmin
    ? [
        { label: 'Dashboard', icon: LayoutDashboard, path: `${prefix}/dashboard` },
        { label: 'Calendar', icon: Calendar, path: `${prefix}/calendar` },
        { label: 'Team', icon: Users, path: `${prefix}/users` },
        { label: 'Tasks', icon: CheckSquare, path: `${prefix}/tasks`, count: counts.tasks },
        { label: 'Chat', icon: MessageSquare, path: `${prefix}/chat`, count: counts.unreadChats }
      ]
    : [
        { label: 'Dashboard', icon: LayoutDashboard, path: `${prefix}/dashboard` },
        { label: 'Tasks', icon: CheckSquare, path: `${prefix}/tasks`, count: counts.tasks },
        { label: 'Projects', icon: Briefcase, path: `${prefix}/projects`, count: counts.projects },
        { label: 'Calendar', icon: Calendar, path: `${prefix}/calendar` },
        { label: 'Chat', icon: MessageSquare, path: `${prefix}/chat`, count: counts.unreadChats }
      ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-[var(--tm-border)] bg-[var(--tm-card)] px-2 shadow-soft-lg lg:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-1.5 transition-colors ${
                isActive
                  ? 'text-[var(--tm-primary)] font-bold'
                  : 'text-[var(--tm-ink-muted)] hover:text-[var(--tm-ink)]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative">
                  <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                  {!!item.count && item.count > 0 && (
                    <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--tm-primary)] px-1 text-[9px] font-extrabold text-white">
                      {item.count}
                    </span>
                  )}
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
