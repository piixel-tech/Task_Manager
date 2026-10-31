import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Drawer } from './Drawer';
import { Avatar } from './Avatar';

export interface DrawerItem {
  id: string;
  label: string;
  sub?: string;
  /** Shows an avatar when set (people). */
  avatar?: { name: string; src?: string };
  /** Where the row opens. Without it the row is plain text. */
  to?: string;
  /** Small text on the right (a count, a status). */
  trailing?: string;
}

export interface DrawerSection {
  title?: string;
  items: DrawerItem[];
}

/** Side drawer listing exactly the items behind a stat card's number. */
export const ItemsDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  sections: DrawerSection[];
  empty?: string;
}> = ({ isOpen, onClose, title, description, sections, empty = 'Nothing here right now.' }) => {
  const navigate = useNavigate();
  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={title} description={description}>
      {total === 0 ? (
        <p className="rounded-[var(--tm-radius-sm)] bg-[var(--tm-card-muted)] p-4 text-[13px] font-semibold text-[var(--tm-ink-muted)]">{empty}</p>
      ) : (
        <div className="space-y-5">
          {sections.map((s, i) =>
            s.items.length === 0 ? null : (
              <section key={s.title ?? i}>
                {s.title && (
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--tm-ink-muted)]">
                    {s.title} · {s.items.length}
                  </h3>
                )}
                <ul className="space-y-1.5">
                  {s.items.map((item) => {
                    const body = (
                      <>
                        {item.avatar && <Avatar name={item.avatar.name} src={item.avatar.src} size="sm" />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold text-[var(--tm-ink)]">{item.label}</span>
                          {item.sub && <span className="block truncate text-[12px] text-[var(--tm-ink-muted)]">{item.sub}</span>}
                        </span>
                        {item.trailing && <span className="shrink-0 text-[12px] font-bold text-[var(--tm-ink-soft)]">{item.trailing}</span>}
                        {item.to && <ChevronRight className="h-4 w-4 shrink-0 text-[var(--tm-ink-muted)]" />}
                      </>
                    );
                    const row = 'flex w-full items-center gap-3 rounded-full bg-[var(--tm-card-muted)] px-4 py-2.5 text-left';
                    return (
                      <li key={item.id}>
                        {item.to ? (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              navigate(item.to!);
                            }}
                            className={`${row} transition-colors hover:bg-[var(--tm-bg-sunken)]`}
                          >
                            {body}
                          </button>
                        ) : (
                          <div className={row}>{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )
          )}
        </div>
      )}
    </Drawer>
  );
};
