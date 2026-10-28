import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '../../../components/ui/Card';
import { useAuthStore } from '../../../store/authStore';
import { activityApi, type ActivityInput } from '../../../services/http/activityApi';
import { threads, useActivity, useProjectPeople } from '../useActivity';
import { Entry } from './Entry';
import { EntryComposer } from './EntryComposer';

interface Props {
  subfolderId: string;
  projectId: string;
  /** Tell the page how many are still open (for the tab badge). */
  onCount?: (open: number) => void;
}

/** Mid-way changes for a whole subfolder, for things that are not tied to one task. */
export const ChangesBox: React.FC<Props> = ({ subfolderId, projectId, onCount }) => {
  const me = useAuthStore((s) => s.user)!;
  const [params] = useSearchParams();
  const wanted = params.get('entry');
  const load = useCallback(() => activityApi.subfolder(subfolderId), [subfolderId]);
  const { list, error, reload, update } = useActivity(load, `/subfolders/${subfolderId}`);
  const people = useProjectPeople(projectId).filter((p) => p.id !== me.id);
  const [showResolved, setShowResolved] = useState(true);

  useEffect(() => {
    if (list) onCount?.(list.unresolved);
  }, [list, onCount]);

  useEffect(() => {
    if (!wanted || !list) return;
    const t = setTimeout(() => document.getElementById(`entry-${wanted}`)?.scrollIntoView({ block: 'center' }), 150);
    return () => clearTimeout(t);
  }, [wanted, list]);

  const post = async (input: ActivityInput) => {
    await activityApi.postSubfolder(subfolderId, input);
    reload();
  };

  const all = threads(list?.items ?? [], 'change_request').reverse();
  const shown = showResolved ? all : all.filter((t) => !t.entry.resolved);

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <p className="text-[13px] text-[var(--tm-ink-soft)]">Changes that affect the whole subfolder rather than one task. A head ticks each one off when it is done.</p>
        <EntryComposer kind="change_request" people={people} placeholder="Describe the change" onPost={post} />
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--tm-ink-soft)]">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="h-4 w-4 accent-[var(--tm-primary)]" />
          Show resolved
        </label>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}
        {!list ? null : shown.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-[var(--tm-ink-muted)]">{all.length === 0 ? 'No mid-way changes yet.' : 'Everything is resolved.'}</p>
        ) : (
          <ul className="space-y-3">
            {shown.map((t) => (
              <li key={t.entry.id}>
                <Entry entry={t.entry} replies={t.replies} meId={me.id} people={people} highlight={t.entry.id === wanted} onUpdated={update} onReload={reload} onReply={post} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
