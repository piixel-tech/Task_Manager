import { useCallback, useEffect, useState } from 'react';
import type { MentionPerson } from '../../components/editor/RichEditor';
import { socket } from '../../services/socket';
import { projectApi } from '../../services/http/projectApi';
import type { ActivityEntry, ActivityList } from '../../services/http/activityApi';

/**
 * Loads an activity list and keeps it fresh: it reloads when a notification about this place arrives
 * (`linkPart` is a piece of the notification's link) and when the tab becomes visible again.
 */
export function useActivity(load: () => Promise<ActivityList>, linkPart: string) {
  const [list, setList] = useState<ActivityList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    load()
      .then((l) => {
        setList(l);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the activity'));
  }, [load]);

  useEffect(() => {
    reload();
    const off = socket.on('notification', (n: { link?: string }) => n?.link?.includes(linkPart) && reload());
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      off();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload, linkPart]);

  /** Swap in a changed entry without a round trip, and keep the unresolved count honest. */
  const update = useCallback((e: ActivityEntry) => {
    setList((cur) => {
      if (!cur) return cur;
      const items = cur.items.map((x) => (x.id === e.id ? e : x));
      const unresolved = items.filter((x) => x.kind === 'change_request' && !x.parent_id && !x.resolved).length;
      return { items, unresolved };
    });
  }, []);

  return { list, error, reload, update };
}

/** People who can see a project's work: its members, plus admins. Offered for @mentions and assigning. */
export function useProjectPeople(projectId: string | undefined, extraIds: (string | undefined)[] = []): MentionPerson[] {
  const [people, setPeople] = useState<MentionPerson[]>([]);
  const extraKey = extraIds.filter(Boolean).join(',');

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    Promise.all([projectApi.get(projectId), projectApi.directory()])
      .then(([project, directory]) => {
        if (cancelled) return;
        const inProject = new Set(project.subfolders.flatMap((s) => s.members.map((m) => m.id)));
        extraKey.split(',').filter(Boolean).forEach((id) => inProject.add(id));
        setPeople(directory.filter((p) => p.role === 'admin' || inProject.has(p.id)).map((p) => ({ id: p.id, name: p.name, role: p.role })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, extraKey]);

  return people;
}

/** Splits a flat list into top-level entries (oldest first) with their replies. */
export function threads(items: ActivityEntry[], kind: ActivityEntry['kind']) {
  const tops = items.filter((e) => e.kind === kind && !e.parent_id);
  return tops.map((e) => ({ entry: e, replies: items.filter((r) => r.parent_id === e.id) }));
}
