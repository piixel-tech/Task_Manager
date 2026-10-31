import React from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import type { UserBrief } from '../../../services/http/projectApi';

/** A small floating list of people (avatar + name), used for "who reacted" and "seen by". Opens upwards. */
export const PeoplePopover: React.FC<{ title: string; people: UserBrief[]; meId?: string; children?: React.ReactNode }> = ({ title, people, meId, children }) => (
  <div
    role="dialog"
    aria-label={title}
    className="glass-strong absolute bottom-full left-0 z-40 mb-2 w-56 max-w-[calc(100vw-3rem)] rounded-[16px] p-2.5"
  >
    <p className="px-1.5 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--tm-ink-muted)]">{title}</p>
    <ul className="max-h-52 space-y-0.5 overflow-y-auto">
      {people.map((u) => (
        <li key={u.id} className="flex items-center gap-2 rounded-full px-1.5 py-1">
          <Avatar name={u.name} src={u.avatar_url ?? undefined} size="xs" />
          <span className="truncate text-[12.5px] font-semibold text-[var(--tm-ink)]">
            {u.name}
            {u.id === meId && ' (you)'}
          </span>
        </li>
      ))}
    </ul>
    {children}
  </div>
);
