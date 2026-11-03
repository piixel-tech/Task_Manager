import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Check, Clock, FolderOpen, HardDrive, LayoutGrid, List, Search, Star, Users } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { useMotionPrefs } from '../../components/ui/useMotionPrefs';
import { toast } from '../../store/useToastStore';
import { isJobCancelled, runJob } from '../../services/jobs';
import {
  googleApi,
  type DriveFilter,
  type DriveItem,
  type DriveView
} from '../../services/http/googleApi';
import type { Asset } from '../../services/http/taskApi';
import { DriveKindIcon } from './DriveKindIcon';
import { isThumbnailUrl, KIND_LABEL, reportGoogleError } from './googleUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Docs or Sheets only (the "Google Doc" / "Google Sheet" entries), or everything. */
  filter?: DriveFilter;
  /** The picked files, already saved as links. */
  onAttached: (files: Asset[]) => void | Promise<void>;
}

const NAV: { id: DriveView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'my', label: 'My Drive', icon: HardDrive },
  { id: 'shared', label: 'Shared with me', icon: Users },
  { id: 'recent', label: 'Recent', icon: Clock },
  { id: 'starred', label: 'Starred', icon: Star }
];

const TITLES: Record<DriveFilter, string> = { any: 'Google Drive', document: 'Google Docs', spreadsheet: 'Google Sheets' };
const LAYOUT_KEY = 'tm-drive-layout';

const readLayout = (): 'grid' | 'list' => {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
};

const when = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const size = (bytes: number) =>
  !bytes ? '' : bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Our own file browser over the person's Drive, in place of Google's Picker: My Drive, Shared with me, Recent and Starred,
 * search, grid or list, folders with breadcrumbs, thumbnails and multi-select. Nothing is stored until they press Add.
 */
export const DriveBrowserModal: React.FC<Props> = ({ isOpen, onClose, filter = 'any', onAttached }) => {
  const { reduced } = useMotionPrefs();
  const [view, setView] = useState<DriveView>('my');
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>(readLayout);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Map<string, DriveItem>>(new Map());
  const [adding, setAdding] = useState(false);
  const latest = useRef(0);

  const parent = path.length ? path[path.length - 1].id : null;

  // A fresh browser each time it opens.
  useEffect(() => {
    if (!isOpen) return;
    setView('my');
    setPath([]);
    setSearch('');
    setQuery('');
    setPicked(new Map());
    setError(null);
  }, [isOpen, filter]);

  // Search as they type, without a request per key.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (pageToken: string | null) => {
      const ticket = ++latest.current;
      setLoading(true);
      try {
        const page = await googleApi.browse({ view, parent, q: query, kind: filter, pageToken });
        if (ticket !== latest.current) return; // they moved on while this was loading
        setItems((cur) => (pageToken ? [...cur, ...page.items] : page.items));
        setNext(page.next_page_token);
        setError(null);
      } catch (err) {
        if (ticket !== latest.current) return;
        setItems([]);
        setNext(null);
        setError(err instanceof Error ? err.message : 'Could not load Google Drive');
        reportGoogleError(err, 'Could not load Google Drive');
      } finally {
        if (ticket === latest.current) setLoading(false);
      }
    },
    [view, parent, query, filter]
  );

  useEffect(() => {
    if (isOpen) void fetchPage(null);
  }, [isOpen, fetchPage]);

  const chooseLayout = (l: 'grid' | 'list') => {
    setLayout(l);
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {
      /* private window: the choice just isn't remembered */
    }
  };

  const goView = (v: DriveView) => {
    setView(v);
    setPath([]);
    setSearch('');
  };

  const open = (item: DriveItem) => {
    setPath((cur) => [...cur, { id: item.id, name: item.name }]);
    setSearch('');
  };

  const toggle = (item: DriveItem) =>
    setPicked((cur) => {
      const copy = new Map(cur);
      if (copy.has(item.id)) copy.delete(item.id);
      else copy.set(item.id, item);
      return copy;
    });

  const add = async () => {
    setAdding(true);
    try {
      const chosen = [...picked.values()];
      const saved: (Asset | undefined)[] = [];
      const files = await runJob({
        title: chosen.length === 1 ? `Adding ${chosen[0].name} from Drive` : `Adding ${chosen.length} files from Drive`,
        items: chosen.map((c) => ({ name: c.name, size: 1 })),
        pausable: true, // pauses between files
        run: async (ctl) => {
          for (let i = 0; i < chosen.length; i++) {
            if (saved[i]) continue;
            await ctl.checkpoint();
            saved[i] = await googleApi.attachDrive(chosen[i].id);
            ctl.finish(i);
          }
          return saved as Asset[];
        }
      });
      await onAttached(files);
      toast.success(
        files.length === 1 ? 'Added from Google Drive' : `${files.length} files added from Google Drive`,
        files.map((f) => f.name).join(', ')
      );
      onClose();
    } catch (err) {
      if (!isJobCancelled(err)) reportGoogleError(err, 'Could not add from Google Drive');
    } finally {
      setAdding(false);
    }
  };

  const rootLabel = NAV.find((n) => n.id === view)?.label ?? 'My Drive';
  const crumbs = useMemo(() => [{ id: '', name: rootLabel }, ...path], [rootLabel, path]);
  const count = picked.size;
  const hover = reduced ? undefined : { y: -2 };
  const tap = reduced ? undefined : { scale: 0.98 };

  const Thumb: React.FC<{ item: DriveItem; big?: boolean }> = ({ item, big }) =>
    item.is_folder ? (
      <FolderOpen className={big ? 'h-10 w-10 text-[var(--tm-primary-dark)]' : 'h-5 w-5 text-[var(--tm-primary-dark)]'} />
    ) : big && isThumbnailUrl(item.thumbnail_url) ? (
      <img
        src={item.thumbnail_url}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        className="h-full w-full object-cover object-top"
        onError={(e) => (e.currentTarget.style.display = 'none')}
      />
    ) : (
      <DriveKindIcon kind={item.kind} className={big ? 'h-10 w-10 text-[var(--tm-primary-dark)]' : 'h-5 w-5 shrink-0 text-[var(--tm-primary-dark)]'} />
    );

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !adding && onClose()}
      title={TITLES[filter]}
      description={filter === 'any' ? 'Choose files from your Google Drive.' : `Showing ${TITLES[filter]} only. Folders are listed so you can find them.`}
      maxWidth="3xl"
      footer={
        <>
          <span className="mr-auto text-[12.5px] font-semibold text-[var(--tm-ink-soft)]">
            {count === 0 ? 'Nothing selected' : `${count} selected`}
          </span>
          <Button type="button" variant="secondary" size="sm" disabled={adding} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={count === 0} isLoading={adding} onClick={add}>
            {count > 1 ? `Add ${count} files` : 'Add file'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[168px_minmax(0,1fr)]">
        <nav aria-label="Drive locations" className="flex gap-1.5 overflow-x-auto sm:flex-col sm:overflow-visible">
          {NAV.map((n) => {
            const active = n.id === view;
            return (
              <button
                key={n.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => goView(n.id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2.5 text-left text-[13px] font-semibold transition-colors ${
                  active
                    ? 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]'
                    : 'text-[var(--tm-ink-soft)] hover:bg-[var(--tm-card-muted)]'
                }`}
              >
                <n.icon className="h-4 w-4 shrink-0" />
                {n.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Input
                pill
                aria-label="Search Drive"
                placeholder={`Search ${rootLabel}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <div className="flex shrink-0 rounded-full bg-[var(--tm-card-muted)] p-1" role="group" aria-label="Layout">
              {(['grid', 'list'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-label={l === 'grid' ? 'Grid view' : 'List view'}
                  aria-pressed={layout === l}
                  onClick={() => chooseLayout(l)}
                  className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${
                    layout === l ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]' : 'text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)]'
                  }`}
                >
                  {l === 'grid' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </div>

          <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-[12.5px]">
            {query ? (
              <span className="font-semibold text-[var(--tm-ink-soft)]">Results for “{query}” in {rootLabel}</span>
            ) : (
              crumbs.map((c, i) => (
                <React.Fragment key={`${c.id}-${i}`}>
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-[var(--tm-ink-muted)]" />}
                  {i === crumbs.length - 1 ? (
                    <span className="font-bold text-[var(--tm-ink)]">{c.name}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPath(path.slice(0, i))}
                      className="rounded-full px-2 py-0.5 font-semibold text-[var(--tm-primary-dark)] hover:bg-[var(--tm-primary-soft)]"
                    >
                      {c.name}
                    </button>
                  )}
                </React.Fragment>
              ))
            )}
          </nav>

          <div className="h-[48vh] overflow-y-auto rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] p-3" aria-busy={loading}>
            {error && <p className="tm-error px-4 py-3 text-xs font-semibold">{error}</p>}
            {!error && loading && items.length === 0 && (
              <div className={layout === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3' : 'space-y-2'}>
                {Array.from({ length: layout === 'grid' ? 6 : 5 }).map((_, i) => (
                  <div key={i} className={`animate-pulse rounded-[var(--tm-radius-md)] bg-[var(--tm-bg-sunken)] ${layout === 'grid' ? 'h-32' : 'h-11'}`} />
                ))}
              </div>
            )}
            {!error && !loading && items.length === 0 && (
              <p className="grid h-full place-items-center text-center text-[13px] text-[var(--tm-ink-muted)]">
                {query ? 'Nothing matches that search.' : filter === 'any' ? 'This place is empty.' : `No ${TITLES[filter]} here. Try another folder.`}
              </p>
            )}

            {items.length > 0 && layout === 'grid' && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {items.map((item) => {
                  const on = picked.has(item.id);
                  return (
                    <li key={item.id}>
                      <motion.button
                        type="button"
                        whileHover={hover}
                        whileTap={tap}
                        aria-pressed={item.is_folder ? undefined : on}
                        onClick={() => (item.is_folder ? open(item) : toggle(item))}
                        className={`relative flex w-full flex-col overflow-hidden rounded-[var(--tm-radius-md)] border bg-[var(--tm-card)] text-left transition-colors ${
                          on ? 'border-[var(--tm-solid)] ring-2 ring-[var(--tm-primary-light)]' : 'border-[var(--tm-border)] hover:border-[var(--tm-solid)]'
                        }`}
                      >
                        <span className="grid h-24 w-full place-items-center overflow-hidden bg-[var(--tm-bg-sunken)]">
                          <Thumb item={item} big />
                        </span>
                        <span className="flex items-center gap-2 px-3 py-2">
                          <Thumb item={item} />
                          <span className="min-w-0 leading-tight">
                            <span className="block truncate text-[12.5px] font-bold text-[var(--tm-ink)]">{item.name}</span>
                            <span className="block truncate text-[11px] text-[var(--tm-ink-muted)]">
                              {item.is_folder ? 'Folder' : KIND_LABEL[item.kind]}
                            </span>
                          </span>
                        </span>
                        {on && (
                          <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </motion.button>
                    </li>
                  );
                })}
              </ul>
            )}

            {items.length > 0 && layout === 'list' && (
              <ul className="space-y-1.5">
                {items.map((item) => {
                  const on = picked.has(item.id);
                  return (
                    <li key={item.id}>
                      <motion.button
                        type="button"
                        whileTap={tap}
                        aria-pressed={item.is_folder ? undefined : on}
                        onClick={() => (item.is_folder ? open(item) : toggle(item))}
                        className={`flex w-full items-center gap-3 rounded-[var(--tm-radius-md)] border px-3 py-2.5 text-left transition-colors ${
                          on ? 'border-[var(--tm-solid)] bg-[var(--tm-primary-soft)]' : 'border-transparent bg-[var(--tm-card)] hover:border-[var(--tm-border)]'
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                            item.is_folder ? 'border-transparent' : on ? 'border-[var(--tm-solid)] bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]' : 'border-[var(--tm-border)]'
                          }`}
                        >
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <Thumb item={item} />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--tm-ink)]">{item.name}</span>
                        <span className="hidden shrink-0 text-[11.5px] text-[var(--tm-ink-muted)] sm:block">{when(item.modified_at)}</span>
                        <span className="hidden w-16 shrink-0 text-right text-[11.5px] text-[var(--tm-ink-muted)] sm:block">{size(item.size)}</span>
                        {item.starred && <Star className="h-3.5 w-3.5 shrink-0 fill-current text-[var(--tm-warning)]" />}
                      </motion.button>
                    </li>
                  );
                })}
              </ul>
            )}

            {next && (
              <div className="mt-3 flex justify-center">
                <Button type="button" variant="outline" size="sm" isLoading={loading} onClick={() => fetchPage(next)}>
                  Load more
                </Button>
              </div>
            )}
          </div>
          <p className="text-[11.5px] text-[var(--tm-ink-muted)]">
            Only a link and the file’s details are saved in Task Manager. The file stays in Google Drive; people still need access in Google to open it.
          </p>
        </div>
      </div>
    </Modal>
  );
};
