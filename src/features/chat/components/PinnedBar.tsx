import React, { useEffect, useState } from 'react';
import { ChevronDown, Pin, PinOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { fadeIn, listItemVariants } from '../../../components/ui/motion';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { chatApi, type ChatGroup, type ChatMessage, type Pin as PinEntry } from '../../../services/http/chatApi';
import { previewOf } from '../chatUtils';

interface Props {
  group: ChatGroup;
  onJump: (messageId: string) => void;
  onToggle: (m: ChatMessage) => Promise<boolean>;
}

/** The newest pinned message sits under the header; the rest open from "All pinned". */
export const PinnedBar: React.FC<Props> = ({ group, onJump, onToggle }) => {
  const [pins, setPins] = useState<PinEntry[]>([]);
  const [open, setOpen] = useState(false);
  const key = group.pinned_ids.join(',');
  const { reduced } = useMotionPrefs();

  useEffect(() => {
    if (group.pinned_ids.length === 0) {
      setPins([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    chatApi
      .pins(group.id)
      .then((p) => !cancelled && setPins(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // The group's pinned ids change whenever someone pins or unpins, so that is the refresh signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id, key]);

  if (pins.length === 0) return null;
  const newest = pins[0];

  return (
    <div className="border-b border-[var(--tm-border)] bg-[var(--tm-card)]">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Pin className="h-4 w-4 shrink-0 text-[var(--tm-primary-dark)]" aria-hidden />
        <motion.div key={newest.message.id} className="min-w-0 flex-1" variants={fadeIn} initial={reduced ? false : 'hidden'} animate="show">
          <button type="button" onClick={() => onJump(newest.message.id)} className="block w-full text-left" aria-label="Go to the pinned message">
            <span className="block text-[11px] font-bold text-[var(--tm-primary-dark)]">{newest.message.sender?.name ?? 'Former member'}</span>
            <span className="block truncate text-[12.5px] text-[var(--tm-ink-soft)]">{previewOf(newest.message)}</span>
          </button>
        </motion.div>
        {pins.length > 1 && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--tm-primary-soft)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--tm-primary-dark)]"
          >
            {pins.length} pinned <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {open && (
        <ul className="max-h-56 divide-y divide-[var(--tm-border)] overflow-y-auto border-t border-[var(--tm-border)]">
          <AnimatePresence initial={false}>
          {pins.map((p) => (
            <motion.li
              key={p.message.id}
              layout={reduced ? false : 'position'}
              variants={listItemVariants}
              initial={reduced ? false : 'hidden'}
              animate="show"
              exit={reduced ? undefined : 'exit'}
              className="flex items-center gap-2 px-3 py-2"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setOpen(false);
                  onJump(p.message.id);
                }}
              >
                <span className="block text-[11px] font-bold text-[var(--tm-ink-muted)]">
                  {p.message.sender?.name ?? 'Former member'} · pinned by {p.pinned_by?.name ?? 'someone'}
                </span>
                <span className="block truncate text-[13px] text-[var(--tm-ink)]">{previewOf(p.message)}</span>
              </button>
              {group.can_pin && (
                <button type="button" aria-label="Unpin" title="Unpin" onClick={() => void onToggle(p.message)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--tm-ink-muted)] hover:bg-[var(--tm-bg-sunken)]">
                  <PinOff className="h-4 w-4" />
                </button>
              )}
            </motion.li>
          ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
};
