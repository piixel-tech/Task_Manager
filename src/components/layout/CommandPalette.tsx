import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Briefcase,
  CheckSquare,
  CornerDownLeft,
  Search,
  Users as UsersIcon
} from 'lucide-react';
import { projectService, taskService, userService } from '../../services';
import { useAuthStore } from '../../store/authStore';
import { useMotionPrefs } from '../ui/useMotionPrefs';
import { backdropVariants, modalVariants } from '../ui/motion';
import { StatusChip } from '../ui/StatusChip';
import { Avatar } from '../ui/Avatar';

type ResultKind = 'task' | 'project' | 'person';

interface Result {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle?: string;
  status?: string;
  path: string;
  avatarName?: string;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const kindMeta: Record<ResultKind, { label: string; icon: React.ElementType }> = {
  task: { label: 'Tasks', icon: CheckSquare },
  project: { label: 'Projects', icon: Briefcase },
  person: { label: 'People', icon: UsersIcon }
};

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
  const prefix = isAdmin ? '/admin' : '/app';

  // Load the searchable set once the palette opens.
  useEffect(() => {
    if (!isOpen || !user) return;

    let alive = true;
    setLoading(true);

    (async () => {
      try {
        const [tasks, projects, users] = await Promise.all([
          taskService.getTasks(undefined, isAdmin ? undefined : user.id),
          projectService.getProjects(undefined, isAdmin ? undefined : user.id),
          isAdmin ? userService.getUsers() : Promise.resolve([])
        ]);

        if (!alive) return;

        setResults([
          ...tasks.map<Result>((t) => ({
            id: t.id,
            kind: 'task',
            title: t.title,
            subtitle: t.subHeading || undefined,
            status: t.status,
            path: `${prefix}/tasks/${t.id}`
          })),
          ...projects.map<Result>((p) => ({
            id: p.id,
            kind: 'project',
            title: p.name,
            subtitle: p.clientName || p.description?.slice(0, 60),
            status: p.status,
            path: `${prefix}/projects/${p.id}`
          })),
          ...users
            .filter((u) => u.active)
            .map<Result>((u) => ({
              id: u.id,
              kind: 'person',
              title: u.name,
              subtitle: u.jobTitle,
              path: `${prefix}/users`,
              avatarName: u.name
            }))
        ]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isOpen, user, isAdmin, prefix]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setCursor(0);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? results.filter(
          (r) =>
            r.title.toLowerCase().includes(q) || r.subtitle?.toLowerCase().includes(q)
        )
      : results;
    return pool.slice(0, 24);
  }, [query, results]);

  const grouped = useMemo(() => {
    const map = new Map<ResultKind, Result[]>();
    for (const r of filtered) {
      const list = map.get(r.kind) ?? [];
      list.push(r);
      map.set(r.kind, list);
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
            className="absolute inset-0 bg-[rgba(22,33,28,0.34)] backdrop-blur-[4px]"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            variants={modalVariants}
            initial={reduced ? 'show' : 'hidden'}
            animate="show"
            exit={reduced ? 'show' : 'exit'}
            className="relative z-10 flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden
              rounded-[var(--tm-radius-xl)] bg-[var(--tm-card)] shadow-soft-lg"
          >
            <div className="flex items-center gap-3 border-b border-[var(--tm-border)] px-5 py-4">
              <Search className="h-[18px] w-[18px] shrink-0 text-[var(--tm-ink-muted)]" />
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks, projects, people…"
                className="flex-1 bg-transparent text-[15px] text-[var(--tm-ink)] outline-none
                  placeholder:text-[var(--tm-ink-muted)]"
              />
              <kbd className="rounded-md bg-[var(--tm-bg-sunken)] px-2 py-1 text-[10px] font-bold text-[var(--tm-ink-muted)]">
                ESC
              </kbd>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {loading && (
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

              {!loading &&
                [...grouped.entries()].map(([kind, items]) => {
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
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
