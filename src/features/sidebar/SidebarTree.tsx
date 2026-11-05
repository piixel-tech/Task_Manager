import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  CheckSquare,
  ChevronRight,
  ClipboardList,
  Folder,
  FolderOpen,
  FolderPlus,
  ListChecks,
  MessageSquarePlus,
  MoreHorizontal,
  PackageCheck,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react';
import { useConfirm } from '../../hooks/useConfirm';
import { socket } from '../../services/socket';
import { projectApi } from '../../services/http/projectApi';
import type { ProjectNode, SubfolderNode } from '../../services/http/sidebarApi';
import { inOrder, useSidebarStore } from '../../store/useSidebarStore';
import { NodeMenu, type MenuAction } from './NodeMenu';
import { SidebarModals, type SidebarAction } from './SidebarModals';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { VisibilityIcon } from '../projects/components/VisibilityIcon';

interface Props {
  isAdmin: boolean;
  prefix: string;
  /** Called after any navigation (closes the mobile drawer). */
  onNavigate: () => void;
}

/** Notifications that can change the badges or the tree itself. */
const TREE_EVENTS = /^(task_|review_|project_|subfolder_|head_|members_|changes_)/;

const ICON = 'h-4 w-4 shrink-0';

/** The Projects section: project → subfolders, with "+" to create, "⋯" to rename / move / delete, and a badge of my open tasks. */
export const SidebarTree: React.FC<Props> = ({ prefix, onNavigate }) => {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const { tree, error, open, order, load, toggle, move } = useSidebarStore();
  const [action, setAction] = useState<SidebarAction | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; title: string; actions: MenuAction[] } | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    void load();
    // Badges and the tree follow what happens elsewhere: reload (once, after a short pause) when such a notification arrives.
    const off = socket.on('notification', (n: { type?: string }) => {
      if (n?.type && TREE_EVENTS.test(n.type)) {
        clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(() => void load(), 400);
      }
    });
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      off();
      clearTimeout(reloadTimer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const closeMenu = useCallback(() => setMenu(null), []);
  const show = (anchor: HTMLElement, title: string, actions: MenuAction[]) => actions.length && setMenu({ anchor, title, actions });

  // --- What each node's menus offer: only what this person may do there -------------------------------
  const projectPath = (p: ProjectNode) => `${prefix}/projects/${p.id}`;
  const subfolderPath = (p: ProjectNode, s: SubfolderNode) => `${prefix}/projects/${p.id}/subfolders/${s.id}`;
  const go = (path: string) => {
    navigate(path);
    onNavigate();
  };

  const createForProject = (p: ProjectNode): MenuAction[] => [
    ...(p.can_add_subfolder ? [{ label: 'Subfolder', icon: <FolderPlus className={ICON} />, onSelect: () => setAction({ kind: 'subfolder', project: p }) }] : []),
    ...(p.subfolders.some((s) => s.can_add_task) ? [{ label: 'Task', icon: <CheckSquare className={ICON} />, onSelect: () => setAction({ kind: 'task', project: p }) }] : []),
    ...(p.can_add_requirement ? [{ label: 'Requirement', icon: <ClipboardList className={ICON} />, onSelect: () => setAction({ kind: 'requirement', project: p }) }] : []),
    { label: 'Chat group', icon: <MessageSquarePlus className={ICON} />, onSelect: () => setAction({ kind: 'group' }) }
  ];

  const createForSubfolder = (p: ProjectNode, s: SubfolderNode): MenuAction[] => [
    ...(s.can_add_task ? [{ label: 'Task', icon: <CheckSquare className={ICON} />, onSelect: () => setAction({ kind: 'task', project: p, subfolderId: s.id }) }] : []),
    ...(s.can_add_checklist ? [{ label: 'Checklist item', icon: <ListChecks className={ICON} />, onSelect: () => go(`${subfolderPath(p, s)}?tab=checklist`) }] : []),
    ...(s.can_edit_deliverables ? [{ label: 'Deliverables', icon: <PackageCheck className={ICON} />, onSelect: () => go(`${subfolderPath(p, s)}?tab=deliverables`) }] : []),
    ...(p.can_add_requirement ? [{ label: 'Requirement', icon: <ClipboardList className={ICON} />, onSelect: () => setAction({ kind: 'requirement', project: p }) }] : []),
    ...(s.can_chat ? [{ label: 'Chat group', icon: <MessageSquarePlus className={ICON} />, onSelect: () => setAction({ kind: 'group', subfolderId: s.id }) }] : [])
  ];

  const leaveIfOpen = (path: string, fallback: string) => {
    if (location.pathname.startsWith(path)) go(fallback);
  };

  const removeProject = (p: ProjectNode) =>
    confirm({
      title: `Delete “${p.name}”?`,
      message: `Its ${p.subfolders.length} subfolder${p.subfolders.length === 1 ? '' : 's'}, every task, checklist, deliverable and client requirement are deleted for everyone. This cannot be undone.`,
      confirmLabel: 'Delete project',
      danger: true,
      action: () => projectApi.remove(p.id),
      successTitle: 'Project deleted'
    }).then((ok) => {
      if (!ok) return;
      leaveIfOpen(projectPath(p), `${prefix}/projects`);
      void load();
    });

  const removeSubfolder = (p: ProjectNode, s: SubfolderNode) =>
    confirm({
      title: `Delete “${s.name}”?`,
      message: 'Its tasks, checklist, deliverables and mid-way changes are deleted for everyone. Client requirements and chat groups stay, but lose the link. This cannot be undone.',
      confirmLabel: 'Delete subfolder',
      danger: true,
      action: () => projectApi.deleteSubfolder(s.id),
      successTitle: 'Subfolder deleted'
    }).then((ok) => {
      if (!ok) return;
      leaveIfOpen(subfolderPath(p, s), projectPath(p));
      void load();
    });

  const moves = (parentId: string, siblings: string[], id: string): MenuAction[] => {
    const at = siblings.indexOf(id);
    return [
      ...(at > 0 ? [{ label: 'Move up', icon: <ArrowUp className={ICON} />, onSelect: () => move(parentId, siblings, id, -1) }] : []),
      ...(at >= 0 && at < siblings.length - 1 ? [{ label: 'Move down', icon: <ArrowDown className={ICON} />, onSelect: () => move(parentId, siblings, id, 1) }] : [])
    ];
  };

  const manageProject = (p: ProjectNode, siblings: string[]): MenuAction[] => [
    ...(p.can_rename ? [{ label: 'Rename', icon: <Pencil className={ICON} />, onSelect: () => setAction({ kind: 'rename', target: { type: 'project', id: p.id, name: p.name } }) }] : []),
    ...moves('projects', siblings, p.id),
    ...(p.can_delete ? [{ label: 'Delete', icon: <Trash2 className={ICON} />, danger: true, onSelect: () => void removeProject(p) }] : [])
  ];

  const manageSubfolder = (p: ProjectNode, s: SubfolderNode, siblings: string[]): MenuAction[] => [
    ...(s.can_rename ? [{ label: 'Rename', icon: <Pencil className={ICON} />, onSelect: () => setAction({ kind: 'rename', target: { type: 'subfolder', id: s.id, name: s.name } }) }] : []),
    ...moves(`p:${p.id}`, siblings, s.id),
    ...(s.can_delete ? [{ label: 'Delete', icon: <Trash2 className={ICON} />, danger: true, onSelect: () => void removeSubfolder(p, s) }] : [])
  ];

  // --- Look ---------------------------------------------------------------------------------------------
  const muted = 'text-[var(--tm-ink-muted)]';
  const hoverBtn = 'hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]';
  const linkTone = (active: boolean) =>
    active
      ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)] font-bold shadow-soft-xs'
      : 'text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]';

  const badge = (n: number) =>
    n > 0 ? (
      <span className={`ml-1 inline-flex min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums bg-[var(--tm-accent)] text-[var(--tm-accent-ink)]`} aria-label={`${n} open tasks`}>
        {n}
      </span>
    ) : null;

  const iconButton = (label: string, onClick: (el: HTMLElement) => void, children: React.ReactNode) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => onClick(e.currentTarget)}
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full opacity-100 transition-opacity focus-visible:opacity-100 lg:opacity-0 lg:group-focus-within/row:opacity-100 lg:group-hover/row:opacity-100 ${muted} ${hoverBtn}`}
    >
      {children}
    </button>
  );

  const chevron = (id: string, label: string) => (
    <button type="button" aria-label={`${open.includes(id) ? 'Collapse' : 'Expand'} ${label}`} aria-expanded={open.includes(id)} onClick={() => toggle(id)} className={`grid h-6 w-5 shrink-0 place-items-center rounded ${muted} ${hoverBtn}`}>
      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open.includes(id) ? 'rotate-90' : ''}`} />
    </button>
  );

  const projects = tree ? inOrder(tree.projects, order.projects) : [];
  const projectIds = projects.map((p) => p.id);
  const projectsOpen = open.includes('projects');
  const createProject = tree?.can_create_project;

  return (
    <div>
      <div className="group/row flex items-center gap-1">
        <button
          type="button"
          aria-expanded={projectsOpen}
          onClick={() => toggle('projects')}
          className={`flex flex-1 items-center gap-1.5 rounded-full py-1.5 pl-1 pr-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)] hover:text-[var(--tm-ink)]`}
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${projectsOpen ? 'rotate-90' : ''}`} />
          Projects
        </button>
        {createProject && (
          <button
            type="button"
            aria-label="New project"
            title="New project"
            onClick={() => setAction({ kind: 'project' })}
            className={`grid h-6 w-6 place-items-center rounded-full ${muted} ${hoverBtn}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {projectsOpen && (
        <div className="mt-1 space-y-0.5">
          {error && !tree && <p className="px-3 py-2 text-[12px] text-[var(--tm-danger)]">{error}</p>}
          {!tree && !error && <SkeletonRows count={3} />}
          {tree && projects.length === 0 && <p className={`px-3 py-2 text-[12px] ${muted}`}>{createProject ? 'No projects yet. Use + to start one.' : 'You are not on any project yet.'}</p>}

          {projects.map((p) => {
            const expanded = open.includes(`p:${p.id}`);
            const subs = inOrder(p.subfolders, order[`p:${p.id}`]);
            const subIds = subs.map((s) => s.id);
            const projectCreate = createForProject(p);
            const projectManage = manageProject(p, projectIds);
            return (
              <div key={p.id}>
                <div className="group/row flex items-center">
                  {chevron(`p:${p.id}`, p.name)}
                  <NavLink to={projectPath(p)} end onClick={onNavigate} className={({ isActive }) => `flex min-w-0 flex-1 items-center gap-2 rounded-full py-2 pl-2 pr-2 text-[13px] font-semibold ${linkTone(isActive)}`}>
                    {expanded ? <FolderOpen className={ICON} strokeWidth={2.1} /> : <Briefcase className={ICON} strokeWidth={2.1} />}
                    <span className="flex-1 truncate">{p.name}</span>
                    {badge(p.open_tasks)}
                    <span className="inline-flex min-w-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--tm-bg-sunken)] px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-[var(--tm-ink-soft)]" aria-label={`${subs.length} subfolders`}>
                      {subs.length}
                    </span>
                  </NavLink>
                  {projectCreate.length > 0 && iconButton(`Create in ${p.name}`, (el) => show(el, `Create in ${p.name}`, projectCreate), <Plus className="h-4 w-4" />)}
                  {projectManage.length > 0 && iconButton(`${p.name} options`, (el) => show(el, p.name, projectManage), <MoreHorizontal className="h-4 w-4" />)}
                </div>

                {expanded && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-[var(--tm-border)]/60 pl-1.5">
                    {subs.map((s) => {
                      const create = createForSubfolder(p, s);
                      const manage = manageSubfolder(p, s, subIds);
                      return (
                        <div key={s.id} className="group/row relative flex items-center before:absolute before:-left-1.5 before:top-1/2 before:h-px before:w-2.5 before:bg-[var(--tm-border-strong)]">
                          <NavLink to={subfolderPath(p, s)} onClick={onNavigate} className={({ isActive }) => `flex min-w-0 flex-1 items-center gap-2 rounded-full py-1.5 pl-3 pr-2 text-[12.5px] font-semibold ${linkTone(isActive)}`}>
                            <Folder className="h-3.5 w-3.5 shrink-0" strokeWidth={2.1} />
                            <span className="flex-1 truncate">{s.name}</span>
                            <span className={muted}>
                              <VisibilityIcon visibility={s.visibility} className="h-3 w-3" />
                            </span>
                            {badge(s.open_tasks)}
                          </NavLink>
                          {create.length > 0 && iconButton(`Create in ${s.name}`, (el) => show(el, `Create in ${s.name}`, create), <Plus className="h-4 w-4" />)}
                          {manage.length > 0 && iconButton(`${s.name} options`, (el) => show(el, s.name, manage), <MoreHorizontal className="h-4 w-4" />)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {menu && <NodeMenu anchor={menu.anchor} title={menu.title} actions={menu.actions} onClose={closeMenu} />}
      <SidebarModals action={action} onClose={() => setAction(null)} />
    </div>
  );
};
