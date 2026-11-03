import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, Reorder, useDragControls } from 'motion/react';
import { AlertTriangle, Check, ChevronDown, GripVertical, Layers, ListOrdered, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { ProgressBar } from '../../../components/ui/ProgressRing';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ZigzagTimeline } from '../../../components/ui/ZigzagTimeline';
import { AuthorStamp, ComposerCard, ItemCardSkeletons } from '../../../components/ui/ItemCard';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { EASE_OUT } from '../../../components/ui/motion';
import { HoldToDelete } from '../../../components/ui/HoldToDelete';
import { useConfirm } from '../../../hooks/useConfirm';
import { toast } from '../../../store/useToastStore';
import { socket } from '../../../services/socket';
import {
  currentMonth,
  deliverableApi,
  type DeliverableItem,
  type Deliverables,
  type Stage
} from '../../../services/http/deliverableApi';
import { formatDate } from '../../../utils/time';
import { FadeIn } from '../../../components/ui/FadeIn';

/** Where an item is along the stages: done stages get a green tick, the current one is highlighted, the rest are grey. */
export const StageStepper: React.FC<{ stages: Stage[]; stage: Stage; labels: Record<Stage, string> }> = ({ stages, stage, labels }) => {
  const current = stages.indexOf(stage);
  const finished = current === stages.length - 1; // the last stage is the finish line: tick it too
  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-[520px] items-start" aria-label={`Stage: ${labels[stage]}`}>
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
                    ? 'bg-[var(--tm-success)] text-[var(--tm-on-primary)]'
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
                    ? 'font-extrabold text-[var(--tm-primary-dark)]'
                    : state === 'done'
                      ? 'font-semibold text-[var(--tm-ink-soft)]'
                      : 'text-[var(--tm-ink-muted)]'
                }`}
              >
                {labels[s]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

interface StageRowState {
  /** Local handle for dragging; the stage's own `key` is only known for stages that already exist. */
  uid: string;
  key?: string;
  label: string;
}

let rowCounter = 0;
const newUid = () => `row-${++rowCounter}`;

const StageRow: React.FC<{
  row: StageRowState;
  index: number;
  count: number;
  canDelete: boolean;
  onLabel: (label: string) => void;
  onDelete: () => void;
}> = ({ row, index, count, canDelete, onLabel, onDelete }) => {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={row}
      dragListener={false}
      dragControls={controls}
      className="list-none rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] p-2.5"
      whileDrag={{ scale: 1.02, boxShadow: 'var(--tm-shadow-lg)' }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Drag to reorder ${row.label || 'stage'}`}
          onPointerDown={(e) => controls.start(e)}
          className="grid h-9 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-full text-[var(--tm-ink-muted)] hover:bg-[var(--tm-bg-sunken)] active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--tm-bg-sunken)] text-[11px] font-bold text-[var(--tm-ink-soft)]">{index + 1}</span>
        <input
          aria-label={`Name of stage ${index + 1}`}
          value={row.label}
          maxLength={30}
          placeholder="Stage name"
          onChange={(e) => onLabel(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] px-4 text-[13.5px] font-semibold text-[var(--tm-ink)] outline-none focus:border-[var(--tm-primary)]"
        />
        {canDelete && <HoldToDelete size="sm" onConfirm={onDelete} />}
      </div>
      {count > 0 && canDelete && (
        <p className="mt-2 flex items-start gap-1.5 pl-10 text-[12px] font-semibold text-[var(--tm-warning)]">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          {count} {count === 1 ? 'deliverable is' : 'deliverables are'} on this stage. Deleting it moves {count === 1 ? 'it' : 'them'} to the stage before.
        </p>
      )}
    </Reorder.Item>
  );
};

/** Heads and admins: rename, add, delete (hold) and drag to reorder this subfolder's stages. Applies to every month's deliverables here. */
const StagesModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  subfolderId: string;
  month: string;
  data: Deliverables;
  onSaved: (d: Deliverables) => void;
}> = ({ isOpen, onClose, subfolderId, month, data, onSaved }) => {
  const confirm = useConfirm();
  const [rows, setRows] = useState<StageRowState[]>([]);
  const [removed, setRemoved] = useState<{ row: StageRowState; at: number }[]>([]);
  const [usage, setUsage] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setRemoved([]);
    setUsage(null);
    setRows(data.stages.map((key) => ({ uid: newUid(), key, label: data.stage_labels[key] ?? key })));
    deliverableApi
      .stagesUsage(subfolderId)
      .then(setUsage)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not check which stages are in use'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const countOf = (r: StageRowState) => (r.key && usage ? (usage[r.key] ?? 0) : 0);
  const moving = removed.reduce((n, x) => n + countOf(x.row), 0);
  const original = data.stages.map((k) => `${k}|${data.stage_labels[k] ?? k}`).join('\n');
  const dirty = rows.map((r) => `${r.key ?? ''}|${r.label.trim()}`).join('\n') !== original;

  const drop = (row: StageRowState) => {
    const at = rows.findIndex((r) => r.uid === row.uid);
    setRows((cur) => cur.filter((r) => r.uid !== row.uid));
    if (row.key) setRemoved((cur) => [...cur, { row, at }]);
  };
  const undo = (item: { row: StageRowState; at: number }) => {
    setRemoved((cur) => cur.filter((x) => x !== item));
    setRows((cur) => [...cur.slice(0, item.at), item.row, ...cur.slice(item.at)]);
  };

  const submit = async () => {
    const labels = rows.map((r) => r.label.trim());
    if (labels.some((l) => !l)) return setError('Every stage needs a name.');
    if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) return setError('Two stages have the same name.');
    if (rows.length < 2) return setError('Keep at least two stages: a start and a finish.');
    if (usage === null) return setError('Still checking which stages are in use. Try again in a moment.');
    setError(null);

    const ok = await confirm({
      title: 'Save stages?',
      message:
        (moving > 0
          ? `${moving} ${moving === 1 ? 'deliverable moves' : 'deliverables move'} to the stage before the one you deleted. `
          : '') + `Applies to every deliverable in this subfolder, in all months. The last stage counts as done. The team is notified.`,
      confirmLabel: 'Save stages',
      action: async () => {
        onSaved(await deliverableApi.setStages(subfolderId, month, rows.map((r) => ({ key: r.key, label: r.label.trim() })), moving > 0));
      },
      successTitle: 'Stages saved'
    });
    if (ok) onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit stages" description="Applies to every deliverable in this subfolder. Drag to reorder; the last stage is the finish line." maxWidth="lg">
      <div className="space-y-4">
        {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}

        <Reorder.Group axis="y" values={rows} onReorder={setRows} className="m-0 space-y-2 p-0" aria-label="Stages">
          {rows.map((row, idx) => (
            <StageRow
              key={row.uid}
              row={row}
              index={idx}
              count={countOf(row)}
              canDelete={rows.length > 2}
              onLabel={(label) => setRows((cur) => cur.map((r) => (r.uid === row.uid ? { ...r, label } : r)))}
              onDelete={() => drop(row)}
            />
          ))}
        </Reorder.Group>

        {removed.length > 0 && (
          <div className="rounded-[var(--tm-radius-md)] bg-[var(--tm-danger-bg)] px-4 py-3 text-[12.5px] text-[var(--tm-danger)]">
            <p className="font-bold">Will be deleted when you save</p>
            <ul className="mt-1.5 flex flex-wrap gap-2">
              {removed.map((x) => (
                <li key={x.row.uid} className="flex items-center gap-1.5 rounded-full bg-[var(--tm-card)] py-1 pl-3 pr-1 text-[12px] font-semibold text-[var(--tm-ink)]">
                  {x.row.label}
                  {countOf(x.row) > 0 && <span className="text-[var(--tm-ink-muted)]">({countOf(x.row)} move)</span>}
                  <button type="button" onClick={() => undo(x)} className="rounded-full px-2 py-0.5 text-[11px] font-bold text-[var(--tm-primary-dark)] hover:bg-[var(--tm-bg-sunken)]">
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length >= 12}
          onClick={() => setRows((cur) => [...cur, { uid: newUid(), label: '' }])}
          leftIcon={<Plus className="h-4 w-4" />}
        >
          Add stage
        </Button>

        <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!dirty}>
            Save stages
          </Button>
        </div>
      </div>
    </Modal>
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
  const [editingStages, setEditingStages] = useState(false);
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
    <div className="space-y-5">
      {/* Composer: month, and (heads and admins) the buttons that add or set items */}
      <ComposerCard>
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
      </ComposerCard>

      {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}

      {!data ? (
        error ? null : <ItemCardSkeletons count={3} />
      ) : data.total === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6 text-[var(--tm-primary-dark)]" />}
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
        <FadeIn className="space-y-5">
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

          {groups.map(([type, items]) => (
            <TypeSection
              key={type}
              type={type}
              items={items}
              summary={data.types.find((t) => t.type === type)}
              data={data}
              busyId={busyId}
              onAdd={() => setAdding(type)}
              onRemoveType={() => removeType(type, items.length)}
              onMove={move}
              onDelete={removeItem}
              onEditStages={() => setEditingStages(true)}
            />
          ))}
        </FadeIn>
      )}


      {data && <StagesModal isOpen={editingStages} onClose={() => setEditingStages(false)} subfolderId={subfolderId} month={month} data={data} onSaved={setData} />}
      {data && <CountsModal isOpen={setting} onClose={() => setSetting(false)} subfolderId={subfolderId} month={month} data={data} onSaved={setData} />}
      {data && (
        <AddItemsModal
          type={adding}
          onClose={() => setAdding(null)}
          subfolderId={subfolderId}
          month={month}
          existingTypes={data.types.map((t) => t.type)}
          items={data.items}
          stages={data.stages}
          labels={data.stage_labels}
          canDelete={data.can_set_counts}
          onRemove={removeItem}
          onSaved={setData}
        />
      )}
    </div>
  );
};

/** One type (Creatives, Reels...) as a dropdown: the header shows the counts and progress, Add more and Remove type stay in it; the items open below. Starts collapsed. */
const TypeSection: React.FC<{
  type: string;
  items: DeliverableItem[];
  summary: Deliverables['types'][number] | undefined;
  data: Deliverables;
  busyId: string | null;
  onAdd: () => void;
  onRemoveType: () => void;
  onMove: (itemId: string, stage: Stage) => void;
  onDelete: (item: DeliverableItem) => void;
  onEditStages: () => void;
}> = ({ type, items, summary, data, busyId, onAdd, onRemoveType, onMove, onDelete, onEditStages }) => {
  const { reduced } = useMotionPrefs();
  const [open, setOpen] = useState(false);
  const done = summary?.done ?? 0;
  const total = summary?.total ?? items.length;
  const remaining = summary?.remaining ?? items.length;
  const panel = `deliverable-type-${type.replace(/\W+/g, '-')}`;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            id={`${panel}-head`}
            aria-expanded={open}
            aria-controls={panel}
            onClick={() => setOpen((o) => !o)}
            className="min-w-0 flex-1 basis-64 rounded-[var(--tm-radius-sm)] text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-primary)]"
          >
            <span className="flex items-center gap-3">
              <span className="min-w-0 flex-1 text-base font-extrabold text-[var(--tm-ink)]">
                {type}{' '}
                <span className="font-semibold text-[var(--tm-ink-muted)]">
                  · {done} done / {remaining} remaining
                </span>
              </span>
              <motion.span
                aria-hidden
                animate={{ rotate: open ? 180 : 0 }}
                transition={{ duration: reduced ? 0 : 0.25, ease: EASE_OUT }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--tm-bg-sunken)] text-[var(--tm-ink-soft)]"
              >
                <ChevronDown className="h-4 w-4" />
              </motion.span>
            </span>
            <span className="mt-3 flex items-center gap-3">
              <span className="flex-1">
                <ProgressBar value={Math.round((100 * done) / Math.max(total, 1))} tone={remaining === 0 ? 'ok' : 'primary'} height={8} />
              </span>
              <span className="w-24 text-right text-[12px] font-semibold tabular-nums text-[var(--tm-ink-soft)]">
                {done} of {total} done
              </span>
            </span>
          </button>
          {data.can_set_counts && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onAdd} leftIcon={<Plus className="h-4 w-4" />}>
                Add more
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove all ${type}`}
                onClick={onRemoveType}
                leftIcon={<Trash2 className="h-4 w-4 text-[var(--tm-danger)]" />}
              >
                <span className="text-[var(--tm-danger)]">Remove type</span>
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="items"
            id={panel}
            role="region"
            aria-labelledby={`${panel}-head`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.3, ease: EASE_OUT }}
            style={{ overflow: 'hidden' }}
          >
            <CardContent>
              <ZigzagTimeline
                label={`${type} deliverables`}
                items={items}
                getKey={(i) => i.id}
                render={(i) => (
                  <DeliverableCard
                    item={i}
                    data={data}
                    busy={busyId === i.id}
                    onMove={(stage) => onMove(i.id, stage)}
                    onDelete={() => onDelete(i)}
                    onEditStages={onEditStages}
                  />
                )}
              />
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};

/** Compact row of ticks along the stages: done stages are ticked, the current one is highlighted. */
const StageTicks: React.FC<{ stages: Stage[]; stage: Stage; labels: Record<Stage, string> }> = ({ stages, stage, labels }) => {
  const current = stages.indexOf(stage);
  const last = stages.length - 1;
  return (
    <ol className="flex items-center" aria-label={`Stage: ${labels[stage]}`}>
      {stages.map((s, idx) => {
        const done = idx < current || (idx === current && current === last);
        const now = idx === current && !done;
        return (
          <li key={s} className={`flex items-center ${idx < last ? 'flex-1' : ''}`} title={labels[s]}>
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                done
                  ? 'bg-[var(--tm-success)] text-[var(--tm-on-primary)]'
                  : now
                    ? 'bg-[var(--tm-primary)] text-[var(--tm-on-primary)] ring-2 ring-[var(--tm-primary-soft)]'
                    : 'bg-[var(--tm-bg-sunken)] text-[var(--tm-ink-muted)]'
              }`}
            >
              {done ? <Check className="h-3 w-3" strokeWidth={3} /> : idx + 1}
              <span className="sr-only">
                {' '}
                {labels[s]}
                {done ? ' (done)' : now ? ' (current)' : ''}
              </span>
            </span>
            {idx < last && <span aria-hidden className={`mx-1 h-0.5 flex-1 rounded ${idx < current ? 'bg-[var(--tm-success)]' : 'bg-[var(--tm-border)]'}`} />}
          </li>
        );
      })}
    </ol>
  );
};

/** A completed card glows in the theme accent. */
const DONE_GLOW =
  'border-[color-mix(in_srgb,var(--tm-accent)_60%,transparent)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--tm-accent)_45%,transparent),0_14px_36px_-10px_color-mix(in_srgb,var(--tm-accent)_75%,transparent)]';

/**
 * One deliverable as a numbered card on the timeline, and its own dropdown. Collapsed it shows the coloured pin, the number, the
 * name, the current stage, a small progress bar and a chevron; opened it shows the stage ticks, who changed it last, the stage
 * picker and, for heads and admins, Edit stages and delete. Every card starts collapsed and several can be open at once.
 */
const DeliverableCard: React.FC<{
  item: DeliverableItem;
  data: Deliverables;
  busy: boolean;
  onMove: (stage: Stage) => void;
  onDelete: () => void;
  onEditStages: () => void;
}> = ({ item: i, data, busy, onMove, onDelete, onEditStages }) => {
  const { reduced } = useMotionPrefs();
  const [open, setOpen] = useState(false);
  const [showStages, setShowStages] = useState(false);
  const labels = data.stage_labels;
  const last = data.stages.length - 1;
  const current = data.stages.indexOf(i.stage);
  const finished = current === last;
  const pct = last > 0 ? Math.round((100 * current) / last) : 0;
  const pin = finished ? 'bg-[var(--tm-success)]' : current > 0 ? 'bg-[var(--tm-primary)]' : 'bg-[var(--tm-ink-muted)]';
  const panel = `deliverable-${i.id}`;
  return (
    <motion.article
      data-done={finished || undefined}
      whileHover={reduced ? undefined : { y: -4 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className={`relative rounded-[var(--tm-radius-md)] border bg-[var(--tm-card)] px-5 pb-4 pt-7 transition-shadow duration-300 ${
        finished ? DONE_GLOW : 'border-[var(--tm-border)] shadow-soft-xs hover:shadow-soft'
      }`}
    >
      <span aria-hidden className={`absolute -top-3 left-1/2 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full ring-4 ring-[var(--tm-bg)] ${pin}`}>
        <span className="h-2 w-2 rounded-full bg-[var(--tm-on-primary)]" />
      </span>

      <button
        type="button"
        id={`${panel}-head`}
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((o) => !o)}
        className="block w-full rounded-[var(--tm-radius-sm)] text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-primary)]"
      >
        <span className="flex items-center gap-3">
          <span className="text-[26px] font-black leading-none tabular-nums text-[var(--tm-ink-muted)] opacity-60">{String(i.number).padStart(2, '0')}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-[var(--tm-ink)]">{i.title}</span>
            <span
              className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                finished ? 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]' : 'bg-[var(--tm-bg-sunken)] text-[var(--tm-ink-soft)]'
              }`}
            >
              {labels[i.stage] ?? i.stage}
            </span>
          </span>
          <motion.span
            aria-hidden
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: reduced ? 0 : 0.25, ease: EASE_OUT }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--tm-bg-sunken)] text-[var(--tm-ink-soft)]"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </span>
        <span className="mt-3 flex items-center gap-2">
          <span className="flex-1">
            <ProgressBar value={pct} tone={finished ? 'ok' : 'primary'} height={6} />
          </span>
          <span className="w-9 text-right text-[11.5px] font-semibold tabular-nums text-[var(--tm-ink-soft)]">{pct}%</span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="details"
            id={panel}
            role="region"
            aria-labelledby={`${panel}-head`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.3, ease: EASE_OUT }}
            style={{ overflow: 'hidden' }}
          >
            <div className="space-y-3 border-t border-[var(--tm-border)] pt-4 mt-4">
              <StageTicks stages={data.stages} stage={i.stage} labels={labels} />
              <p className="text-[12.5px] text-[var(--tm-ink-soft)]">
                {i.type} · {finished ? 'Posted, all done' : `Now in ${labels[i.stage] ?? i.stage}`}
              </p>
              <div>
                {i.updated_by ? (
                  <AuthorStamp person={i.updated_by} date={i.updated_at} />
                ) : (
                  <span className="text-[12px] text-[var(--tm-ink-muted)]">{formatDate(i.updated_at, 'MMM d, h:mm a')}</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {data.can_set_stage && (
                  <div className="w-40">
                    <Select
                      aria-label={`Stage of ${i.title}`}
                      value={i.stage}
                      disabled={busy}
                      onChange={(e) => onMove(e.target.value as Stage)}
                      options={data.stages.map((s) => ({ value: s, label: labels[s] ?? s }))}
                    />
                  </div>
                )}
                <Button variant="ghost" size="sm" aria-expanded={showStages} onClick={() => setShowStages((v) => !v)}>
                  {showStages ? 'Hide stages' : 'Show stages'}
                </Button>
              </div>

              {showStages && (
                <div className="border-t border-[var(--tm-border)] pt-3">
                  <StageStepper stages={data.stages} stage={i.stage} labels={labels} />
                </div>
              )}

              {data.can_set_counts && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--tm-border)] pt-3">
                  <Button variant="outline" size="sm" onClick={onEditStages} leftIcon={<ListOrdered className="h-4 w-4" />}>
                    Edit stages
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={`Delete ${i.title}`} onClick={onDelete}>
                    <Trash2 className="h-4 w-4 text-[var(--tm-danger)]" />
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
};

/** Heads and admins: add more items to a type, or start a new one. Numbering carries on from the highest. */
const AddItemsModal: React.FC<{
  type: string | null;
  onClose: () => void;
  subfolderId: string;
  month: string;
  existingTypes: string[];
  /** Everything already tracked this month, listed in the panel so it can be deleted from there. */
  items: DeliverableItem[];
  stages: Stage[];
  labels: Record<Stage, string>;
  canDelete: boolean;
  onRemove: (item: DeliverableItem) => Promise<boolean>;
  onSaved: (d: Deliverables) => void;
}> = ({ type, onClose, subfolderId, month, existingTypes, items, stages, labels, canDelete, onRemove, onSaved }) => {
  const confirm = useConfirm();
  const { reduced } = useMotionPrefs();
  const [name, setName] = useState('');
  const [count, setCount] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const isOpen = type !== null;
  // "Add more" to one type lists that type; "Add items" lists everything.
  const listed = type ? items.filter((i) => i.type === type) : items;

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
        {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}
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

        <section aria-label="Existing items">
          <h3 className="mb-2 flex items-center gap-2 text-[13px] font-extrabold text-[var(--tm-ink)]">
            Existing items
            <span className="rounded-full bg-[var(--tm-bg-sunken)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--tm-ink-soft)]">{listed.length}</span>
          </h3>
          {listed.length === 0 ? (
            <p className="rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-3 text-[12.5px] text-[var(--tm-ink-muted)]">Nothing here yet for {month}.</p>
          ) : (
            <ul className="max-h-60 overflow-y-auto rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] p-1.5">
              <AnimatePresence initial={false}>
                {listed.map((i) => (
                  <motion.li
                    key={i.id}
                    layout={!reduced}
                    exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-3 rounded-[var(--tm-radius-sm)] px-3 py-2 hover:bg-[var(--tm-card)]">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--tm-ink)]">{i.title}</span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          i.stage === stages[stages.length - 1] ? 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]' : 'bg-[var(--tm-bg-sunken)] text-[var(--tm-ink-soft)]'
                        }`}
                      >
                        {labels[i.stage]}
                      </span>
                      {canDelete && (
                        <button
                          type="button"
                          aria-label={`Delete ${i.title}`}
                          onClick={() => onRemove(i)}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--tm-danger)] transition-colors hover:bg-[var(--tm-danger-bg)]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>

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
        {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}
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
