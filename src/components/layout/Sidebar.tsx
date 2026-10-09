import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Briefcase,
  Calendar,
  CheckSquare,
  Clock,
  FileText,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Shield,
  Sparkles,
  User,
  Users,
  X
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/useAppStore';
import { useNavCounts } from '../../hooks/useNavCounts';
import { useMotionPrefs } from '../ui/useMotionPrefs';
import { spring } from '../ui/motion';

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  count?: number;
}

export const Sidebar: React.FC = () => {
  const { user } = useAuthStore();
  const { sidebarOpen, closeSidebar, companyFilter, setCompanyFilter } = useAppStore();
  const counts = useNavCounts();
  const { reduced } = useMotionPrefs();

  const isAdmin = user?.role === 'admin';
  const prefix = isAdmin ? '/admin' : '/app';

  const menu: NavItem[] = isAdmin
    ? [
        { label: 'Dashboard', icon: LayoutDashboard, path: `${prefix}/dashboard` },
        { label: 'Attendance', icon: Clock, path: `${prefix}/attendance` },
        { label: 'Daily Updates', icon: FileText, path: `${prefix}/daily-updates` },
        { label: 'Team Members', icon: Users, path: `${prefix}/users` },
        { label: 'Projects', icon: Briefcase, path: `${prefix}/projects`, count: counts.projects },
        { label: 'Task Hub', icon: CheckSquare, path: `${prefix}/tasks`, count: counts.tasks },
        {
          label: 'Submissions',
          icon: Inbox,
          path: `${prefix}/submissions`,
          count: counts.pendingSubmissions
        }
      ]
    : [
        { label: 'Attendance', icon: Clock, path: `${prefix}/attendance` },
        { label: 'My Tasks', icon: CheckSquare, path: `${prefix}/tasks`, count: counts.tasks },
        { label: 'Projects', icon: Briefcase, path: `${prefix}/projects`, count: counts.projects }
      ];

  const general: NavItem[] = isAdmin
    ? [
        { label: 'Calendar', icon: Calendar, path: `${prefix}/calendar` },
        { label: 'Team Chat', icon: MessageSquare, path: `${prefix}/chat` },
        { label: 'Settings', icon: Settings, path: `${prefix}/settings` }
      ]
    : [
        { label: 'Calendar', icon: Calendar, path: `${prefix}/calendar` },
        { label: 'Team Chat', icon: MessageSquare, path: `${prefix}/chat` },
        { label: 'Monthly Wrapped', icon: Sparkles, path: '/wrapped' },
        { label: 'My Profile', icon: User, path: `${prefix}/profile` }
      ];

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <NavLink key={item.path} to={item.path} onClick={closeSidebar} className="block">
        {({ isActive }) => (
          <div
            className={`group relative flex items-center gap-3 rounded-full py-2.5 pl-4 pr-3
              text-[13.5px] font-semibold transition-colors duration-[var(--tm-dur-fast)]
              ${
                isAdmin
                  ? isActive
                    ? 'bg-[#183d2b] text-emerald-400 font-bold'
                    : 'text-slate-200 hover:bg-[#183d2b]/60 hover:text-white'
                  : isActive
                  ? 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]'
                  : 'text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]'
              }`}
          >
            {/* Green indicator bar — slides between active items */}
            {isActive && (
              <motion.span
                layoutId={reduced ? undefined : 'sidebar-indicator'}
                transition={reduced ? { duration: 0 } : spring}
                className="absolute -left-3 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-[var(--tm-primary)]"
              />
            )}

            <Icon
              className={`h-[17px] w-[17px] shrink-0 ${
                isAdmin
                  ? isActive
                    ? 'text-emerald-400'
                    : 'text-slate-400 group-hover:text-white'
                  : isActive
                  ? 'text-[var(--tm-primary)]'
                  : 'text-[var(--tm-ink-muted)]'
              }`}
              strokeWidth={2.1}
            />
            <span className="flex-1 truncate">{item.label}</span>

            {!!item.count && item.count > 0 && (
              item.label === 'My Tasks' || item.label === 'Task Hub' ? (
                <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-red-600 px-1.5 text-[11px] font-extrabold text-white shadow-sm ring-1 ring-red-700/20">
                  {item.count}
                </span>
              ) : (
                <span
                  className={`inline-flex min-w-[22px] items-center justify-center rounded-full
                    px-1.5 py-0.5 text-[11px] font-bold tabular-nums
                    ${
                      isActive
                        ? 'bg-[var(--tm-primary)] text-white'
                        : isAdmin
                        ? 'bg-[#162e22] text-slate-300'
                        : 'bg-[var(--tm-bg-sunken)] text-[var(--tm-ink-soft)]'
                    }`}
                >
                  {item.count}
                </span>
              )
            )}
          </div>
        )}
      </NavLink>
    );
  };

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(22,33,28,0.32)] backdrop-blur-[3px] lg:hidden"
          onClick={closeSidebar}
        />
      )}

      <aside
        className={`fixed bottom-0 left-0 top-0 z-40 flex w-[268px] flex-col
          transition-transform duration-[var(--tm-dur-slow)] ease-[var(--tm-ease)] lg:translate-x-0
          ${
            isAdmin
              ? 'bg-[#0F1F17] lg:border-r lg:border-[#1a382a] text-white'
              : 'bg-[var(--tm-card)] lg:border-r lg:border-[var(--tm-border)]'
          }
          ${sidebarOpen ? 'translate-x-0 shadow-soft-lg' : '-translate-x-full'}`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-6 pb-5 pt-7">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-[14px] bg-[var(--tm-primary)] text-[17px] font-extrabold text-white shadow-soft-sm">
              P
            </div>
            <div className="leading-tight">
              <div
                className={`text-[15.5px] font-extrabold tracking-[-0.02em] ${
                  isAdmin ? 'text-white' : 'text-[var(--tm-ink)]'
                }`}
              >
                Task Manager
              </div>
              <div
                className={`flex items-center gap-1 text-[11.5px] font-bold ${
                  isAdmin ? 'text-emerald-400 mt-0.5' : 'text-[var(--tm-ink-muted)]'
                }`}
              >
                {isAdmin ? (
                  <>
                    <Shield className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Admin</span>
                  </>
                ) : (
                  'Workspace'
                )}
              </div>
            </div>
          </div>
          <button
            onClick={closeSidebar}
            aria-label="Close menu"
            className={`grid h-8 w-8 place-items-center rounded-full lg:hidden ${
              isAdmin
                ? 'text-slate-300 hover:bg-[#1a382a]'
                : 'text-[var(--tm-ink-muted)] hover:bg-[var(--tm-bg-sunken)]'
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Company filter - Admin only */}
        {isAdmin && (
          <div className="px-6 pb-5">
            <div className="flex items-center gap-1 rounded-full bg-[#162e22] p-1 border border-[#1a382a]">
              {(['all', 'piixel', 'unwork'] as const).map((comp) => {
                const active = companyFilter === comp;
                return (
                  <button
                    key={comp}
                    onClick={() => setCompanyFilter(comp)}
                    className={`relative flex-1 rounded-full py-1.5 text-[11.5px] font-bold capitalize
                      transition-colors duration-[var(--tm-dur-fast)]
                      ${active ? 'text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    {active && (
                      <motion.span
                        layoutId={reduced ? undefined : 'company-filter-pill'}
                        transition={reduced ? { duration: 0 } : spring}
                        className="absolute inset-0 rounded-full bg-[var(--tm-primary)]"
                      />
                    )}
                    <span className="relative z-10">{comp}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-6 pb-4">
          <div
            className={`mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] ${
              isAdmin ? 'text-emerald-500/80' : 'text-[var(--tm-ink-muted)]'
            }`}
          >
            Menu
          </div>
          <div className="space-y-1">{menu.map(renderItem)}</div>

          <div
            className={`mb-2.5 mt-7 text-[10.5px] font-bold uppercase tracking-[0.14em] ${
              isAdmin ? 'text-emerald-500/80' : 'text-[var(--tm-ink-muted)]'
            }`}
          >
            General
          </div>
          <div className="space-y-1">{general.map(renderItem)}</div>
        </nav>

        {/* Footer */}
        <div
          className={`mx-6 mb-5 flex items-center justify-between rounded-[var(--tm-radius-md)] px-4 py-3 ${
            isAdmin ? 'bg-[#162e22] text-slate-400' : 'bg-[var(--tm-card-muted)]'
          }`}
        >
          <span
            className={`text-[11px] font-semibold ${
              isAdmin ? 'text-slate-400' : 'text-[var(--tm-ink-muted)]'
            }`}
          >
            v2.5.0
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--tm-success)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--tm-success)]" />
            Connected
          </span>
        </div>
      </aside>
    </>
  );
};

