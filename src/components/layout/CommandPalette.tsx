import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Briefcase,
  CheckSquare,
  CornerDownLeft,
  Layers,
  Megaphone,
  Search,
  Users as UsersIcon
} from 'lucide-react';
import { projectApi } from '../../services/http/projectApi';
import { taskApi } from '../../services/http/taskApi';
import { officeApi } from '../../services/http/officeApi';
import { profilePath } from '../../features/settings/settingsMenu';
import { capPerKind, searchResults, type Result, type ResultKind } from './paletteSearch';
import { useAuthStore } from '../../store/authStore';
import { useMotionPrefs } from '../ui/useMotionPrefs';
import { backdropVariants, modalVariants } from '../ui/motion';
import { StatusChip } from '../ui/StatusChip';
import { Avatar } from '../ui/Avatar';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Clients search only the portal pages they can open. */
const CLIENT_PAGES: Result[] = [
  { id: 'home', label: 'Home', path: '/client/home' },
  { id: 'chats', label: 'Chats', path: '/client/chats' },
  { id: 'approvals', label: 'Approvals', path: '/client/approvals' },
  { id: 'deliverables', label: 'Deliverables', path: '/client/deliverables' },
  { id: 'requirements', label: 'Requirements', path: '/client/requirements' },
  { id: 'meetings', label: 'Book a meeting', path: '/client/meetings' },
  { id: 'settings', label: 'Settings', path: '/client/settings' }
].map(({ id, label, path }) => ({ id, kind: 'page' as const, title: label, path, haystack: '' }));

const kindMeta: Record<ResultKind, { label: string; icon: React.ElementType }> = {
  task: { label: 'Tasks', icon: CheckSquare },
  project: { label: 'Projects', icon: Briefcase },
  person: { label: 'People', icon: UsersIcon },
  office: { label: 'Office board', icon: Megaphone },
  page: { label: 'Pages', icon: Layers }
};
/** Groups are always listed in this order, whatever matched best. */
const KIND_ORDER: ResultKind[] = ['page', 'task', 'project', 'person', 'office'];

/** Places in the app, with a few words people might type to find them. */
const teamPages = (prefix: string, isAdmin: boolean): Result[] =>
  [
    { id: 'home', label: 'Home', path: `${prefix}/dashboard`, words: 'dashboard overview start' },
    { id: 'projects', label: 'Projects', path: `${prefix}/projects`, words: 'project folders subfolders clients' },
    { id: 'tasks', label: isAdmin ? 'Task Hub' : 'My Tasks', path: `${prefix}/tasks`, words: 'task tasks todo to do assigned overdue deadline' },
    { id: 'chats', label: 'Chats', path: `${prefix}/chat`, words: 'chat message messages groups direct' },
    { id: 'office', label: 'Office board', path: `${prefix}/office`, words: 'office board notice issue pantry pin post' },
    { id: 'activity', label: 'Activity', path: `${prefix}/activity`, words: 'notifications mentions approvals alerts' },
    { id: 'calendar', label: 'Calendar', path: `${prefix}/calendar`, words: 'meeting meetings schedule events holidays' },
    { id: 'leave', label: isAdmin ? 'Leave requests' : 'Leave', path: `${prefix}/leave-requests`, words: 'leave holiday vacation wfh work from home time off' },
    { id: 'reviews', label: 'Reviews', path: `${prefix}/reviews`, words: 'review approve approval submissions to review' },
    { id: 'reports', label: 'Monthly Report', path: `${prefix}/reports`, words: 'report attendance login pdf month' },
    ...(isAdmin ? [{ id: 'users', label: 'Team Members', path: `${prefix}/users`, words: 'people employees users team staff' }] : []),
    { id: 'settings', label: 'Settings', path: isAdmin ? `${prefix}/settings` : `${prefix}/settings/profile`, words: 'profile account appearance theme notifications password preferences' }
  ].map<Result>(({ id, label, path, words }) => ({ id, kind: 'page', title: label, path, haystack: words }));

/**
 * ⌘K search over tasks, projects and teammates. Read-only: it queries the
 * existing services and navigates — it never mutates anything.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { reduced } = useMotionPrefs();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isClient = user?.role === 'client';
  const prefix = isAdmin ? '/admin' : '/app';

  // Load the searchable set once the palette opens.
  useEffect(() => {
    if (!isOpen || !user) return;
    if (isClient) {
      setResults(CLIENT_PAGES);
      return;
    }

    let alive = true;
    setLoading(true);

    // Pages show at once; everything else is fetched, and a source that fails never blocks the others.
    setResults(teamPages(prefix, isAdmin));
    (async () => {
      const [tasks, projects, people, posts] = await Promise.allSettled([
        taskApi.list({}),
        projectApi.list(),
        projectApi.directory(),
        officeApi.list({ status: 'all', category: null, q: '', limit: 100 })
      ]);
      if (!alive) return;
      const ok = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);

      const found: Result[] = [...teamPages(prefix, isAdmin)];
      for (const t of ok(tasks) ?? [])
        found.push({
          id: t.id,
          kind: 'task',
          title: t.title,
          subtitle: `${t.project_name} › ${t.subfolder_name}`,
          status: t.status,
          path: `${prefix}/tasks/${t.id}`,
          haystack: [t.description_text, t.assignee?.name, t.created_by?.name, t.priority, t.due_date, t.status.replace(/_/g, ' ')].filter(Boolean).join(' ')
        });
      for (const p of ok(projects) ?? [])
        found.push({
          id: p.id,
          kind: 'project',
          title: p.name,
          subtitle: p.description?.slice(0, 80) || undefined,
          path: `${prefix}/projects/${p.id}`,
          haystack: p.description ?? ''
        });
      for (const u of ok(people) ?? [])
        found.push({
          id: u.id,
          kind: 'person',
          title: u.name,
          subtitle: u.role,
          path: profilePath(user.role, u.id),
          avatarName: u.name,
          haystack: `${u.email ?? ''} ${u.role}`
        });
      for (const o of ok(posts)?.items ?? [])
        found.push({
          id: o.id,
          kind: 'office',
          title: o.text.length > 90 ? `${o.text.slice(0, 89)}…` : o.text,
          subtitle: `${o.author?.name ?? 'Someone'} · ${o.category_label}${o.resolved ? ' · resolved' : ''}`,
          path: `${prefix}/office`,
          haystack: `${o.text} ${o.author?.name ?? ''} ${o.category_label}`
        });
      setResults(found);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.id, user?.role, isAdmin, isClient, prefix]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setCursor(0);
    }
  }, [isOpen]);

  // Any words, any order, any part of a word, across titles and the details behind them. Several of each kind are shown.
  const filtered = useMemo(() => capPerKind(searchResults(results, query), query.trim() ? 15 : 6), [query, results]);

  const grouped = useMemo(() => {
    const map = new Map<ResultKind, Result[]>();
    for (const kind of KIND_ORDER) {
      const list = filtered.filter((r) => r.kind === kind);
      if (list.length) map.set(kind, list);
    }
    return map;
  }, [filtered]);

  // Flat order matching the rendered order, so arrow keys line up.
  const flat = useMemo(() => [...grouped.values()].flat(), [grouped]);

  const go = (r: Result) => {
    onClose();
    navigate(r.path);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, Math.max(flat.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === 'Enter' && flat[cursor]) {
        e.preventDefault();
        go(flat[cursor]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `go` is defined inline from navigate/onClose, both stable for this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, flat, cursor, onClose, navigate]);

  useEffect(() => setCursor(0), [query]);

  let index = -1;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[12vh]">
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-[var(--tm-scrim)] backdrop-blur-[6px]"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            variants={modalVariants}
            initial={reduced ? 'show' : 'hidden'}
            animate="show"
            exit={reduced ? 'show' : 'exit'}
            className="glass-strong relative z-10 flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden
              rounded-[var(--tm-radius-xl)]"
          >
            <div className="flex items-center gap-3 border-b border-[var(--tm-border)] px-5 py-4">
              <Search className="h-[18px] w-[18px] shrink-0 text-[var(--tm-ink-muted)]" />
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isClient ? 'Search pages…' : 'Search tasks, projects, people, posts, pages…'}
                className="flex-1 bg-transparent text-[15px] text-[var(--tm-ink)] outline-none
                  placeholder:text-[var(--tm-ink-muted)]"
              />
              <kbd className="rounded-[var(--tm-radius-sm)]bg-[var(--tm-bg-sunken)] px-2 py-1 text-[10px] font-bold text-[var(--tm-ink-muted)]">
                ESC
              </kbd>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {loading && flat.length === 0 && (
                <div className="space-y-2 p-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="skeleton h-12 rounded-[var(--tm-radius-md)]" />
                  ))}
                </div>
              )}

              {!loading && flat.length === 0 && (
                <p className="px-3 py-10 text-center text-[13px] text-[var(--tm-ink-muted)]">
                  {query ? `Nothing matches “${query}”.` : 'Nothing to search yet.'}
                </p>
              )}

              {[...grouped.entries()].map(([kind, items]) => {
                  const Icon = kindMeta[kind].icon;
                  return (
                    <div key={kind} className="mb-2">
                      <div className="px-3 pb-1.5 pt-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">
                        {kindMeta[kind].label}
                      </div>
                      {items.map((r) => {
                        index += 1;
                        const active = index === cursor;
                        return (
                          <button
                            key={`${r.kind}-${r.id}`}
                            onClick={() => go(r)}
                            onMouseEnter={() => setCursor(flat.indexOf(r))}
                            className={`flex w-full items-center gap-3 rounded-[var(--tm-radius-md)]
                              px-3 py-2.5 text-left transition-colors
                              ${active ? 'bg-[var(--tm-primary-soft)]' : 'hover:bg-[var(--tm-bg-sunken)]'}`}
                          >
                            {r.avatarName ? (
                              <Avatar name={r.avatarName} size="sm" />
                            ) : (
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--tm-bg-sunken)] text-[var(--tm-ink-soft)]">
                                <Icon className="h-4 w-4" />
                              </span>
                            )}

                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-semibold text-[var(--tm-ink)]">
                                {r.title}
                              </span>
                              {r.subtitle && (
                                <span className="block truncate text-[12px] text-[var(--tm-ink-muted)]">
                                  {r.subtitle}
                                </span>
                              )}
                            </span>

                            {r.status && <StatusChip status={r.status} size="sm" />}
                            {active && (
                              <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[var(--tm-ink-muted)]" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              {loading && flat.length > 0 && <p className="px-3 py-2 text-[12px] text-[var(--tm-ink-muted)]">Still looking…</p>}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
