import { useCallback, useEffect, useMemo, useState } from 'react';
import { socket } from '../../../services/socket';
import { timerApi, type PresenceEvent, type WorkingNow } from '../../../services/http/timerApi';

/**
 * Who has a timer running on a task of this subfolder right now. Loaded once, then kept live by the server's `presence`
 * messages (the same websocket chat uses), and loaded again whenever the socket reconnects so nothing is missed while offline.
 * Only subfolders use this: the server only answers, and only sends, to people who can open the subfolder.
 */
export function useSubfolderPresence(subfolderId: string) {
  const [working, setWorking] = useState<WorkingNow[]>([]);

  const load = useCallback(() => {
    timerApi.working(subfolderId).then(setWorking).catch(() => undefined);
  }, [subfolderId]);

  useEffect(() => {
    setWorking([]);
    load();
    const offPresence = socket.on('presence', (e: PresenceEvent) => {
      if (e.subfolder_id !== subfolderId) return;
      setWorking((list) => {
        // A person runs one timer at a time: whatever they had listed here is replaced or removed.
        const rest = list.filter((w) => w.user.id !== e.user.id);
        return e.running && e.started_at ? [...rest, { task_id: e.task_id, started_at: e.started_at, user: e.user }] : rest;
      });
    });
    const offConnected = socket.on('connected', load);
    return () => {
      offPresence();
      offConnected();
    };
  }, [subfolderId, load]);

  /** The people working on one task. */
  const workersOn = useCallback((taskId: string) => working.filter((w) => w.task_id === taskId).map((w) => w.user), [working]);
  /** Everyone working on anything in this subfolder (for the member list). */
  const activeIds = useMemo(() => new Set(working.map((w) => w.user.id)), [working]);

  return { working, workersOn, activeIds };
}
