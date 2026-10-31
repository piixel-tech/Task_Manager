import React from 'react';
import { Modal } from '../../components/ui/Modal';
import { SHORTCUTS, useShortcutsStore } from './shortcuts';

/** The list itself: shown in a dialog (press ?) and on the Settings page. */
export const ShortcutList: React.FC = () => (
  <ul className="divide-y divide-[var(--tm-border)] rounded-[var(--tm-radius-sm)] border border-[var(--tm-border)]">
    {SHORTCUTS.map((s) => (
      <li key={s.label} className="flex items-center justify-between gap-4 px-4 py-2.5">
        <span className="text-[13.5px] text-[var(--tm-ink)]">{s.label}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {s.keys.map((k, i) => (
            <React.Fragment key={k + i}>
              {i > 0 && s.keys[0] === 'g' && <span className="text-[11px] text-[var(--tm-ink-muted)]">then</span>}
              <kbd className="rounded-[var(--tm-radius-sm)] border border-[var(--tm-border-strong)] bg-[var(--tm-bg-sunken)] px-2 py-0.5 text-[12px] font-bold text-[var(--tm-ink-soft)]">{k}</kbd>
            </React.Fragment>
          ))}
        </span>
      </li>
    ))}
  </ul>
);

export const ShortcutsModal: React.FC = () => {
  const open = useShortcutsStore((s) => s.open);
  const setOpen = useShortcutsStore((s) => s.setOpen);
  return (
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Keyboard shortcuts" maxWidth="lg">
      <ShortcutList />
    </Modal>
  );
};
