import React, { useEffect } from 'react';
import { Topbar } from './Topbar';
import { NavDrawer } from './NavDrawer';
import { SideNav } from './SideNav';
import { ProjectsPanel } from './ProjectsPanel';
import { BottomTabBar } from './BottomTabBar';
import { RouteTransition } from './RouteTransition';
import { useAuthStore } from '../../store/authStore';
import { useSidebarStore } from '../../store/useSidebarStore';

interface AppShellProps {
  /** Role-specific overlays and gates that sit beside the shell (status gate, celebrations). */
  extras?: React.ReactNode;
  /** Role-specific banners shown above the page. */
  banner?: React.ReactNode;
}

/** The one layout every role uses: top header, left nav rail, the left nav rail, the projects panel on Projects pages, the routed page and phone tabs. */
export const AppShell: React.FC<AppShellProps> = ({ extras, banner }) => {
  // This person's own tree layout (open nodes, their order) follows them to any device.
  const userId = useAuthStore((s) => s.user?.id);
  useEffect(() => {
    if (!userId) return;
    useSidebarStore.getState().init(useAuthStore.getState().user?.sidebarState);
    return () => useSidebarStore.getState().reset();
  }, [userId]);

  return (
    <div className="min-h-screen bg-[var(--tm-bg)] pb-24 lg:pb-0">
      {extras}
      <Topbar />
      <NavDrawer />
      <SideNav />
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-6 pt-2 sm:px-6 lg:flex-row lg:items-start lg:gap-7 lg:pb-8 lg:pl-[108px] lg:pr-8">
        <ProjectsPanel />
        <main className="min-w-0 flex-1">
          {banner}
          <RouteTransition className="space-y-6 lg:space-y-7" />
        </main>
      </div>
      <BottomTabBar />
    </div>
  );
};
