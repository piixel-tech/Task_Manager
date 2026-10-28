import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Input } from '../../../components/ui/Input';
import type { UserBrief } from '../../../services/http/projectApi';

interface Props {
  people: UserBrief[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyText?: string;
}

/** Searchable checklist of people. */
export const PeoplePickerList: React.FC<Props> = ({ people, selected, onChange, emptyText = 'No one to add.' }) => {
  const [q, setQ] = useState('');
  const shown = useMemo(() => people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())), [people, q]);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="space-y-2">
      <Input pill placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} leftIcon={<Search className="h-4 w-4" />} />
      <ul className="max-h-52 divide-y divide-[var(--tm-border)] overflow-y-auto rounded-xl border border-[var(--tm-border)]">
        {shown.length === 0 && <li className="p-3 text-[13px] text-[var(--tm-ink-muted)]">{emptyText}</li>}
        {shown.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-[var(--tm-card-muted)]">
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={() => toggle(p.id)}
                className="h-4 w-4 accent-[var(--tm-primary)]"
              />
              <Avatar name={p.name} src={p.avatar_url ?? undefined} size="xs" />
              <span className="text-[13.5px] font-semibold text-[var(--tm-ink)]">{p.name}</span>
              <span className="ml-auto text-[11px] capitalize text-[var(--tm-ink-muted)]">{p.role}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
};
