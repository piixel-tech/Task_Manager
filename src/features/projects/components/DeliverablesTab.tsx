import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Layers, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { ProgressBar } from '../../../components/ui/ProgressRing';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { useConfirm } from '../../../hooks/useConfirm';
import { toast } from '../../../store/useToastStore';
import { socket } from '../../../services/socket';
import {
  currentMonth,
  deliverableApi,
  STAGE_LABEL,
  type DeliverableItem,
  type Deliverables,
  type Stage
} from '../../../services/http/deliverableApi';
import { formatDate } from '../../../utils/time';

/** Where an item is along the stages: done stages get a green tick, the current one is highlighted, the rest are grey. */
export const StageStepper: React.FC<{ stages: Stage[]; stage: Stage }> = ({ stages, stage }) => {
  const current = stages.indexOf(stage);
  const finished = current === stages.length - 1; // the last stage is the finish line: tick it too
  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-[520px] items-start" aria-label={`Stage: ${STAGE_LABEL[stage]}`}>
        {stages.map((s, idx) => {
          const state = idx < current || (idx === current && finished) ? 'done' : idx === current ? 'current' : 'todo';
          return (
            <li key={s} className="relative flex flex-1 flex-col items-center gap-1.5" aria-current={state === 'current' ? 'step' : undefined}>
              {idx > 0 && (
                <span
                  aria-hidden
                  className={`absolute right-1/2 top-[11px] h-0.5 w-full ${idx <= current ? 'bg-[var(--tm-success)]' : 'bg-[var(--tm-border)]'}`}
                />
              )}
              <span
                className={`relative z-10 grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${
                  state === 'done'
                    ? 'bg-[var(--tm-success)] text-white'
                    : state === 'current'
                      ? 'bg-[var(--tm-primary)] text-[var(--tm-on-primary)] ring-4 ring-[var(--tm-primary-soft)]'
                      : 'bg-[var(--tm-bg-sunken)] text-[var(--tm-ink-muted)]'
                }`}
              >
                {state === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : idx + 1}
                <span className="sr-only">{state === 'done' ? ' (done)' : state === 'current' ? ' (current)' : ''}</span>
              </span>
              <span
                className={`text-center text-[10.5px] leading-tight ${
                  state === 'current'
                    ? 'font-extrabold text-[var(--tm-primary)]'
                    : state === 'done'
                      ? 'font-semibold text-[var(--tm-ink-soft)]'
                      : 'text-[var(--tm-ink-muted)]'
                }`}
              >
                {STAGE_LABEL[s]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

/** Per-subfolder deliverables for one month: heads manage items, any member moves them along the stages. */
export const DeliverablesTab: React.FC<{ subfolderId: string }> = ({ subfolderId }) => {
  const confirm = useConfirm();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<Deliverables | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setting, setSetting] = useState(false);
  /** null = closed; '' = pick a type; otherwise the type to add more to. */
  const [adding, setAdding] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await deliverableApi.get(subfolderId, month));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load deliverables');
    }
  }, [subfolderId, month]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  // Teammates' changes arrive live.
  useEffect(
    () =>
      socket.on(
        'notification',
        (n: { type?: string; link?: string }) => n?.type === 'deliverables_updated' && n.link?.includes(subfolderId) && load()
      ),
    [subfolderId, load]
  );

  const move = async (itemId: string, stage: Stage) => {
    setBusyId(itemId);
    try {
      setData(await deliverableApi.setStage(subfolderId, month, itemId, stage));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the stage');
      load();
    } finally {
      setBusyId(null);
    }
  };

  const removeItem = (item: DeliverableItem) =>
    confirm({
      title: `Delete ${item.title}?`,
      message: 'Only this item is deleted. The others keep their numbers, and the team is notified.',
      confirmLabel: 'Delete item',
      danger: true,
      action: async () => {
        setData(await deliverableApi.removeItem(subfolderId, month, item.id));
      },
      successTitle: 'Item deleted'
    });

  const removeType = (type: string, count: number) =>
    confirm({
      title: `Remove all ${type}?`,
      message: `${count} ${count === 1 ? 'item' : 'items'} and their progress for ${month} are deleted, and the team is notified.`,
      confirmLabel: 'Remove type',
      danger: true,
      action: async () => {
        setData(await deliverableApi.removeType(subfolderId, month, type));
      },
      successTitle: 'Type removed'
    });

  const groups = useMemo(() => {
    const map = new Map<string, DeliverableItem[]>();
    data?.items.forEach((i) => map.set(i.type, [...(map.get(i.type) ?? []), i]));
    return [...map.entries()];
  }, [data]);

  const donePct = data && data.total ? Math.round((100 * data.done) / data.total) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-56">
          <Input label="Month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </div>
        {data?.can_set_counts && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSetting(true)} leftIcon={<SlidersHorizontal className="h-4 w-4" />}>
              Set counts
            </Button>
            <Button onClick={() => setAdding('')} leftIcon={<Plus className="h-4 w-4" />}>
              Add items
            </Button>
          </div>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}

      {!data ? (
        error ? null : <SkeletonGrid count={2} />
      ) : data.total === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6 text-[var(--tm-primary)]" />}
          title="No deliverables this month"
          description={
            data.can_set_counts
              ? 'Set how many of each type (for example 12 Reels, 8 Creatives) to start tracking them.'
              : 'A head of this subfolder sets the monthly counts.'
          }
          actionLabel={data.can_set_counts ? 'Set counts' : undefined}
          onAction={data.can_set_counts ? () => setSetting(true) : undefined}
        />
      ) : (
        <>
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-base font-extrabold text-[var(--tm-ink)]">
                  All types · {data.done} done / {data.remaining} remaining
                </p>
                <span className="text-2xl font-black tabular-nums text-[var(--tm-ink)]">{donePct}%</span>
              </div>
              <ProgressBar value={donePct} tone={data.remaining === 0 ? 'ok' : 'primary'} height={12} />
              <p className="text-[12px] text-[var(--tm-ink-muted)]">An item is done once it is posted.</p>
            </CardContent>
          </Card>

          {groups.map(([type, items]) => {
            const summary = data.types.find((t) => t.type === type);
            return (
              <Card key={type}>
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-base font-extrabold">
                      {type}{' '}
                      <span className="font-semibold text-[var(--tm-ink-muted)]">
                        · {summary?.done ?? 0} done / {summary?.remaining ?? items.length} remaining
                      </span>
                    </CardTitle>
                    {data.can_set_counts && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setAdding(type)} leftIcon={<Plus className="h-4 w-4" />}>
                          Add more
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove all ${type}`}
                          onClick={() => removeType(type, items.length)}
                          leftIcon={<Trash2 className="h-4 w-4 text-[var(--tm-danger)]" />}
                        >
                          <span className="text-[var(--tm-danger)]">Remove type</span>
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <ProgressBar
                        value={summary ? Math.round((100 * summary.done) / Math.max(summary.total, 1)) : 0}
                        tone={summary && summary.remaining === 0 ? 'ok' : 'primary'}
                        height={8}
                      />
                    </div>
                    <span className="w-24 text-right text-[12px] font-semibold tabular-nums text-[var(--tm-ink-soft)]">
                      {summary?.done ?? 0} of {summary?.total ?? items.length} done
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {items.map((i) => (
                      <li key={i.id} className="space-y-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[13.5px] font-bold text-[var(--tm-ink)]">{i.title}</span>
                            <p className="text-[11px] text-[var(--tm-ink-muted)]">
                              {i.updated_by ? `${i.updated_by.name} · ` : ''}
                              {formatDate(i.updated_at, 'MMM d, h:mm a')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {data.can_set_stage && (
                              <div className="w-44">
                                <Select
                                  aria-label={`Stage of ${i.title}`}
                                  value={i.stage}
                                  disabled={busyId === i.id}
                                  onChange={(e) => move(i.id, e.target.value as Stage)}
                                  options={data.stages.map((s) => ({ value: s, label: STAGE_LABEL[s] }))}
                                />
                              </div>
                            )}
                            {data.can_set_counts && (
                              <Button variant="ghost" size="sm" aria-label={`Delete ${i.title}`} onClick={() => removeItem(i)}>
                                <Trash2 className="h-4 w-4 text-[var(--tm-danger)]" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <StageStepper stages={data.stages} stage={i.stage} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}

      {data && <CountsModal isOpen={setting} onClose={() => setSetting(false)} subfolderId={subfolderId} month={month} data={data} onSaved={setData} />}
      {data && (
        <AddItemsModal
          type={adding}
          onClose={() => setAdding(null)}
          subfolderId={subfolderId}
          month={month}
          existingTypes={data.types.map((t) => t.type)}
          onSaved={setData}
        />
      )}
    </div>
  );
};

/** Heads and admins: add more items to a type, or start a new one. Numbering carries on from the highest. */
const AddItemsModal: React.FC<{
  type: string | null;
  onClose: () => void;
  subfolderId: string;
  month: string;
  existingTypes: string[];
  onSaved: (d: Deliverables) => void;
}> = ({ type, onClose, subfolderId, month, existingTypes, onSaved }) => {
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [count, setCount] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const isOpen = type !== null;

  useEffect(() => {
    if (type === null) return;
    setName(type);
    setCount('1');
    setError(null);
  }, [type]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = name.trim();
    const n = Number(count);
    if (!label) return setError('Give the type a name.');
    if (!Number.isInteger(n) || n < 1 || n > 200) return setError('Enter a whole number from 1 to 200.');
    setError(null);

    const ok = await confirm({
      title: `Add ${n} ${label}?`,
      message: `They are numbered after the existing ones, start in Writing, and the team is notified.`,
      confirmLabel: 'Add items',
      action: async () => {
        onSaved(await deliverableApi.addItems(subfolderId, month, label, n));
      },
      successTitle: 'Items added'
    });
    if (ok) onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Add deliverables for ${month}`} maxWidth="md">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Input
            label="Type"
            placeholder="e.g. Reels"
            list="deliverable-types"
            value={name}
            maxLength={40}
            readOnly={!!type}
            onChange={(e) => setName(e.target.value)}
          />
          <Input label="How many" type="number" min={1} max={200} value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
        <datalist id="deliverable-types">
          {existingTypes.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Add items</Button>
        </div>
      </form>
    </Modal>
  );
};

interface Row {
  type: string;
  count: string;
  existing: boolean;
}

/** Heads and admins: how many of each type for the month. Raising a count adds the next numbers. */
const CountsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  subfolderId: string;
  month: string;
  data: Deliverables;
  onSaved: (d: Deliverables) => void;
}> = ({ isOpen, onClose, subfolderId, month, data, onSaved }) => {
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setRows(
      data.types.length
        ? data.types.map((t) => ({ type: t.type, count: String(t.total), existing: true }))
        : [
            { type: 'Reels', count: '', existing: false },
            { type: 'Creatives', count: '', existing: false }
          ]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const update = (idx: number, patch: Partial<Row>) => setRows((r) => r.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const name = r.type.trim();
      if (!name && r.count === '') continue;
      if (!name) return setError('Every row needs a type name.');
      const n = Number(r.count);
      if (r.count === '' || !Number.isInteger(n) || n < 0 || n > 200) return setError(`“${name}”: enter a whole number from 0 to 200.`);
      if (Object.keys(counts).some((k) => k.toLowerCase() === name.toLowerCase())) return setError(`“${name}” is listed twice.`);
      counts[name] = n;
    }
    if (Object.keys(counts).length === 0) return setError('Add at least one type.');
    setError(null);

    const ok = await confirm({
      title: `Save ${month} counts?`,
      message: `${Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(', ')}. Items are numbered automatically and the team is notified.`,
      confirmLabel: 'Save counts',
      action: async () => {
        onSaved(await deliverableApi.setCounts(subfolderId, month, counts));
      },
      successTitle: 'Counts saved'
    });
    if (ok) onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Deliverables for ${month}`} maxWidth="lg">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
        <p className="text-[12.5px] text-[var(--tm-ink-muted)]">
          Lowering a count removes the highest numbers, but only ones still in Writing. To delete a single item or a whole type, use the bin
          icons on the tracker.
        </p>
        <div className="space-y-2.5">
          {rows.map((r, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_110px_auto] items-center gap-2.5">
              <Input
                placeholder="Type, e.g. Reels"
                value={r.type}
                readOnly={r.existing}
                maxLength={40}
                onChange={(e) => update(idx, { type: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                max={200}
                placeholder="Count"
                value={r.count}
                onChange={(e) => update(idx, { count: e.target.value })}
              />
              {r.existing ? (
                <span className="w-8" />
              ) : (
                <button
                  type="button"
                  aria-label="Remove row"
                  onClick={() => setRows((x) => x.filter((_, i) => i !== idx))}
                  className="text-[var(--tm-ink-muted)] hover:text-[var(--tm-danger)]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows((r) => [...r, { type: '', count: '', existing: false }])}
          leftIcon={<Plus className="h-4 w-4" />}
        >
          Add type
        </Button>
        <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save counts</Button>
        </div>
      </form>
    </Modal>
  );
};
