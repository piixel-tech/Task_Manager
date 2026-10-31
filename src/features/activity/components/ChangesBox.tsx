import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquareDiff } from 'lucide-react';
import { EmptyState } from '../../../components/ui/EmptyState';
import { FilterBar } from '../../../components/ui/FilterBar';
import { ComposerCard, ItemCardSkeletons } from '../../../components/ui/ItemCard';
import { PillTabs } from '../../../components/ui/PillTabs';
import { Stagger, StaggerItem } from '../../../components/ui/Stagger';
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
    <div className="space-y-5">
      {/* Composer first, so posting is the obvious thing to do */}
      <ComposerCard>
        <p className="text-[13px] text-[var(--tm-ink-soft)]">
          Changes that affect the whole subfolder rather than one task. A head ticks each one off when it is done.
        </p>
        <EntryComposer kind="change_request" people={people} placeholder="Describe the change" onPost={post} />
      </ComposerCard>

      {all.length > 0 && (
        <FilterBar>
          <PillTabs
            size="sm"
            activeTab={showResolved ? 'all' : 'open'}
            onChange={(id) => setShowResolved(id === 'all')}
            tabs={[
              { id: 'all', label: 'All', count: all.length },
              { id: 'open', label: 'Open', count: all.filter((t) => !t.entry.resolved).length }
            ]}
          />
        </FilterBar>
      )}

      {error && <p className="tm-error px-4 py-3 text-xs font-semibold">{error}</p>}

      {!list ? (
        error ? null : <ItemCardSkeletons count={3} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<MessageSquareDiff className="h-6 w-6 text-[var(--tm-primary-dark)]" />}
          title={all.length === 0 ? 'No mid-way changes yet' : 'Everything is resolved'}
          description={all.length === 0 ? 'Post a change above when something shifts for the whole subfolder.' : 'Switch to All to see the resolved ones.'}
        />
      ) : (
        <Stagger key={showResolved ? 'all' : 'open'} className="space-y-3" role="list">
          {shown.map((t) => (
            <StaggerItem key={t.entry.id} role="listitem">
              <Entry
                entry={t.entry}
                replies={t.replies}
                meId={me.id}
                people={people}
                highlight={t.entry.id === wanted}
                onUpdated={update}
                onReload={reload}
                onReply={post}
                icon={<MessageSquareDiff className="h-[18px] w-[18px]" />}
              />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
};
