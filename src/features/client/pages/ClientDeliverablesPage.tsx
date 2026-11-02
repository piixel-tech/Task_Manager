import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Hourglass, Layers } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ItemsDrawer } from '../../../components/ui/ItemsDrawer';
import { StatCard } from '../../../components/ui/StatCard';
import { FilterBar, FilterDate } from '../../../components/ui/FilterBar';
import { DetailCard, MasterDetail, MasterRow, useMasterSelection } from '../../../components/ui/MasterDetail';
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
  const rows = (groups ?? []).map((g) => ({ ...g, id: g.subfolder.id }));
  const { selected, open, select, back } = useMasterSelection(rows);
  const [drawer, setDrawer] = useState<'done' | 'remaining' | 'folders' | null>(null);
  const done = rows.reduce((n, g) => n + g.deliverables.done, 0);
  const remaining = rows.reduce((n, g) => n + g.deliverables.remaining, 0);

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard onClick={() => setDrawer('done')} label="Done" value={done} icon={<CheckCircle2 className="h-5 w-5" />} tone="ok" hint="Posted this month" progress={done + remaining ? Math.round((100 * done) / (done + remaining)) : 0} />
        <StatCard onClick={() => setDrawer('remaining')} label="Remaining" value={remaining} icon={<Hourglass className="h-5 w-5" />} tone="warn" hint="Still in progress" trend={rows.map((g) => g.deliverables.remaining)} />
        <StatCard onClick={() => setDrawer('folders')} label="Folders" value={rows.length} icon={<Layers className="h-5 w-5" />} tone="primary" hint="With work planned" />
      </div>
      <FilterBar>
        <FilterDate label="Month" type="month" value={month} active={month !== currentMonth()} onChange={(v) => v && setMonth(v)} />
      </FilterBar>
      {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}
      {!groups ? (
        error ? null : <SkeletonGrid count={2} />
      ) : groups.length === 0 ? (
        <EmptyState icon={<Layers className="h-6 w-6 text-[var(--tm-primary-dark)]" />} title="Nothing planned for this month" description="Pick another month, or check back when the team has set this month's work." />
      ) : (
        <MasterDetail
          detailOpen={open}
          onBack={back}
          list={rows.map((g) => (
            <MasterRow
              key={g.id}
              selected={g.id === selected?.id}
              onSelect={() => select(g.id)}
              avatar={
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--tm-bg-sunken)] text-[var(--tm-primary-light)]">
                  <Layers className="h-5 w-5" />
                </span>
              }
              title={g.subfolder.name}
              subtitle={g.project.name}
              chip={
                <span className="rounded-full bg-[var(--tm-primary-soft)] px-2.5 py-1 text-[11px] font-bold tabular-nums text-[var(--tm-primary-dark)]">
                  {g.deliverables.done}/{g.deliverables.total}
                </span>
              }
            />
          ))}
          detail={
            selected && (
              <DetailCard
                title={selected.subfolder.name}
                subtitle={selected.project.name}
                badges={
                  <span className="rounded-full bg-white/20 px-3 py-1 text-[12px] font-bold">
                    {selected.deliverables.done} done / {selected.deliverables.remaining} remaining
                  </span>
                }
              >
                <DeliverablesView title={`${selected.project.name} › ${selected.subfolder.name}`} data={selected.deliverables} />
              </DetailCard>
            )
          }
        />
      )}
      <ItemsDrawer
        isOpen={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer === 'done' ? 'Done this month' : drawer === 'remaining' ? 'Still in progress' : 'Folders with work planned'}
        sections={[
          {
            items: rows
              .filter((g) => (drawer === 'done' ? g.deliverables.done > 0 : drawer === 'remaining' ? g.deliverables.remaining > 0 : true))
              .map((g) => ({
                id: g.id,
                label: g.subfolder.name,
                sub: g.project.name,
                trailing:
                  drawer === 'done'
                    ? `${g.deliverables.done} done`
                    : drawer === 'remaining'
                      ? `${g.deliverables.remaining} left`
                      : `${g.deliverables.done}/${g.deliverables.done + g.deliverables.remaining}`
              }))
          }
        ]}
      />
    </>
  );
};
