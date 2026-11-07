import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import type { UserBrief } from '../../../services/http/projectApi';

interface PeoplePickerProps {
  label: string;
  hint?: string;
  people: UserBrief[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Shown ticked and locked (e.g. heads are always members). */
  lockedIds?: string[];
  error?: string | null;
  /** What the search matches against (default: the name). */
  searchText?: (person: UserBrief) => string;
  /** What to say when the search finds nobody (default: "No one found."). */
  emptyText?: (query: string) => string;
}

/** Searchable checklist of people. */
export const PeoplePicker: React.FC<PeoplePickerProps> = ({
  label,
  hint,
  people,
  value,
  onChange,
  lockedIds = [],
  error,
  searchText = (p) => p.name,
  emptyText = () => 'No one found.'
}) => {
  const [query, setQuery] = useState('');
  const shown = useMemo(
    () => people.filter((p) => searchText(p).toLowerCase().includes(query.trim().toLowerCase())),
    [people, query, searchText]
  );

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold text-[var(--tm-ink-soft)]">{label}</span>
        <span className="text-[11px] text-[var(--tm-ink-muted)]">
          {value.length + lockedIds.length} selected
        </span>
      </div>
      {hint && <p className="text-[11.5px] text-[var(--tm-ink-muted)]">{hint}</p>}

      <div
        className={`rounded-[var(--tm-radius-md)] border bg-[var(--tm-card)] ${
          error ? 'border-[var(--tm-danger)]' : 'border-[var(--tm-border)]'
        }`}
      >
        <div className="flex items-center gap-2 border-b border-[var(--tm-border)] px-3 py-2">
          <Search className="h-3.5 w-3.5 text-[var(--tm-ink-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--tm-ink-muted)]"
          />
        </div>
        <ul className="max-h-44 overflow-y-auto p-1">
          {shown.length === 0 ? (
            <li className="px-3 py-4 text-center text-[12px] text-[var(--tm-ink-muted)]">{emptyText(query.trim())}</li>
          ) : (
            shown.map((p) => {
              const locked = lockedIds.includes(p.id);
              return (
                <li key={p.id}>
                  <label
                    className={`flex items-center gap-3 rounded-[var(--tm-radius-md)] px-3 py-2 ${
                      locked ? 'opacity-60' : 'cursor-pointer hover:bg-[var(--tm-bg-sunken)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={locked || value.includes(p.id)}
                      disabled={locked}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4 accent-[var(--tm-primary)]"
                    />
                    <Avatar name={p.name} src={p.avatar_url ?? undefined} size="xs" />
                    <span className="truncate text-[13px] font-semibold text-[var(--tm-ink)]">{p.name}</span>
                    <span className="ml-auto text-[11px] capitalize text-[var(--tm-ink-muted)]">{p.role}</span>
                  </label>
                </li>
              );
            })
          )}
        </ul>
      </div>
      {error && <p className="text-[12px] font-medium text-[var(--tm-danger)]">{error}</p>}
    </div>
  );
};
