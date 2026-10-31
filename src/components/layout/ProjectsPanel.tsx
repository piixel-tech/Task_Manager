import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, FolderTree, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { SidebarTree } from '../../features/sidebar/SidebarTree';

const KEY = 'tm-projects-panel';
const noop = () => {};

const readOpen = (): boolean => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved === 'open';
  } catch {
    /* storage can be blocked; fall through to the default */
  }
  // Beside the page on desktop; folded away on a phone where it sits above the page.
  return window.matchMedia('(min-width: 1024px)').matches;
};

/**
 * The project → subfolder tree, as a collapsible charcoal panel on the left of the Projects pages
 * (above the page on a phone). Every tree action (create, rename, move, delete) lives in SidebarTree.
 */
export const ProjectsPanel: React.FC = () => {
  const { user } = useAuthStore();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(readOpen);

  const onProjects = /^\/(admin|app)\/projects(\/|$)/.test(pathname);
  if (!user || user.role === 'client' || !onProjects) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(KEY, next ? 'open' : 'closed');
    } catch {
      /* per-viewer convenience only */
    }
  };

  const prefix = user.role === 'admin' ? '/admin' : '/app';

  return (
    <aside
      aria-label="Projects"
      className={`shrink-0 lg:sticky lg:top-[92px] ${open ? 'lg:w-[288px]' : 'lg:w-[60px]'} transition-[width] duration-[var(--tm-dur)]`}
    >
      {/* Collapsed on desktop: just the reopen button */}
      {!open && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Show projects panel"
          title="Show projects panel"
          className="tm-sidebar hidden h-[60px] w-[60px] place-items-center rounded-full text-[var(--tm-ink)] transition-transform hover:-translate-y-px lg:grid"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>
      )}

      {/* Phone: a bar that folds the tree */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="tm-sidebar flex w-full items-center justify-between rounded-full px-5 py-3 text-[13.5px] font-bold text-[var(--tm-ink)] lg:hidden"
      >
        <span className="flex items-center gap-2.5">
          <FolderTree className="h-4 w-4" /> Projects &amp; folders
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="tm-sidebar relative mt-3 max-h-[70vh] overflow-y-auto rounded-[var(--tm-radius-xl)] px-4 pb-5 pt-3
            lg:mt-0 lg:max-h-[calc(100vh-116px)]"
        >
          <div className="mb-1 hidden items-center justify-between px-1 lg:flex">
            <span className="flex items-center gap-2 text-[13px] font-extrabold text-[var(--tm-ink)]">
              <FolderTree className="h-4 w-4" /> Folders
            </span>
            <button
              type="button"
              onClick={toggle}
              aria-label="Hide projects panel"
              title="Hide projects panel"
              className="grid h-9 w-9 place-items-center rounded-full text-[var(--tm-ink-soft)] transition-colors hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]"
            >
              <PanelLeftClose className="h-4.5 w-4.5" />
            </button>
          </div>
          <SidebarTree isAdmin={user.role === 'admin'} prefix={prefix} onNavigate={noop} />
        </div>
      )}
    </aside>
  );
};
