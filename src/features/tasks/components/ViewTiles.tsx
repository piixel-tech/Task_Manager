import React from 'react';

export interface ViewTileItem {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  count: number;
  /** The count turns red while it is above zero (Pending review). */
  alert?: boolean;
}

export interface ViewTileGroup {
  label: string;
  tiles: ViewTileItem[];
}

/** The task views as tiles in one white card, grouped under small headings. Scrolls sideways on a phone. */
export const ViewTiles: React.FC<{
  groups: ViewTileGroup[];
  active: string;
  onChange: (id: string) => void;
}> = ({ groups, active, onChange }) => (
  <nav
    aria-label="Task views"
    className="flex gap-5 overflow-x-auto rounded-[var(--tm-radius-card)] border border-[var(--tm-border)]/60 bg-[var(--tm-card)] p-3 shadow-soft-xs"
  >
    {groups.map((g, gi) => (
      <div key={g.label} className={`shrink-0 ${gi > 0 ? 'border-l border-[var(--tm-border)]/60 pl-5' : ''}`}>
        <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tm-ink-muted)]">{g.label}</p>
        <div className="flex gap-2">
          {g.tiles.map((t) => {
            const selected = t.id === active;
            const red = t.alert && t.count > 0;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(t.id)}
                className={`flex w-[168px] shrink-0 flex-col gap-1 rounded-2xl px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:shadow-glow ${
                  selected
                    ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]'
                    : 'bg-[var(--tm-card-muted)] text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]'
                }`}
              >
                <span className="flex items-center justify-between">
                  <span className={`[&_svg]:h-4 [&_svg]:w-4 ${selected ? 'opacity-90' : 'text-[var(--tm-ink-soft)]'}`}>{t.icon}</span>
                  <span className={`text-[20px] font-bold leading-none tabular-nums ${red ? 'text-[var(--tp-red)]' : ''}`}>{t.count}</span>
                </span>
                <span className="mt-1 text-[13px] font-semibold leading-tight">{t.label}</span>
                <span className={`truncate text-[11.5px] font-medium ${selected ? 'opacity-70' : 'text-[var(--tm-ink-muted)]'}`}>{t.hint}</span>
              </button>
            );
          })}
        </div>
      </div>
    ))}
  </nav>
);
