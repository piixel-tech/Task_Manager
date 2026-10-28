import React, { useCallback, useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Input } from '../../../components/ui/Input';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { socket } from '../../../services/socket';
import { currentMonth } from '../../../services/http/deliverableApi';
import { portalApi, type PortalDeliverables } from '../../../services/http/portalApi';
import { DeliverablesView } from '../components/DeliverablesView';

/** Read-only tracker for the client's projects, one month at a time. */
export const ClientDeliverablesPage: React.FC = () => {
  const [month, setMonth] = useState(currentMonth());
  const [groups, setGroups] = useState<PortalDeliverables[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    portalApi
      .deliverables(month)
      .then((g) => {
        setGroups(g);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the deliverables'));
  }, [month]);

  useEffect(() => {
    setGroups(null);
    load();
  }, [load]);

  // The team moving an item along arrives live.
  useEffect(() => socket.on('notification', (n: { type?: string }) => n?.type === 'deliverables_updated' && load()), [load]);

  return (
    <>
      <PageHeader title="Deliverables" description="Where each piece of work is, from writing to posted." />
      <div className="w-full sm:w-56">
        <Input label="Month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
      {!groups ? (
        error ? null : <SkeletonGrid count={2} />
      ) : groups.length === 0 ? (
        <EmptyState icon={<Layers className="h-6 w-6 text-[var(--tm-primary)]" />} title="Nothing planned for this month" description="Pick another month, or check back when the team has set this month's work." />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <DeliverablesView key={g.subfolder.id} title={`${g.project.name} › ${g.subfolder.name}`} data={g.deliverables} />
          ))}
        </div>
      )}
    </>
  );
};
