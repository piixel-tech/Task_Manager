import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { useChatStore } from '../../../store/useChatStore';
import { chatApi, type ChatGroup, type SearchHit } from '../../../services/http/chatApi';
import { listTime, previewOf } from '../chatUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Search only inside this group (the search box in a conversation). Leave out to search all of mine. */
  group?: ChatGroup;
  /** Start with "only messages that mention me" ticked. */
  mentionsOnly?: boolean;
  /** A result was chosen: open that message. */
  onOpen: (groupId: string, messageId: string) => void;
}

const SNIPPET = 160;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The text around the first match, with each searched word in bold. */
function Snippet({ text, q }: { text: string; q: string }) {
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 0) return <>{text.slice(0, SNIPPET)}</>;
  const re = new RegExp(`(${words.map(escapeRe).join('|')})`, 'gi');
  const first = text.search(re);
  const start = Math.max(0, first - 40);
  const slice = (start > 0 ? '…' : '') + text.slice(start, start + SNIPPET);
  return (
    <>
      {slice.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-[var(--tm-warning-bg)] px-0.5 font-bold text-[var(--tm-ink)]">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}

/** Search my chats (or one chat): words, who sent it, a date range, or messages that mention me. */
export const ChatSearchModal: React.FC<Props> = ({ isOpen, onClose, group, mentionsOnly = false, onOpen }) => {
  const groups = useChatStore((s) => s.groups);
  const [q, setQ] = useState('');
  const [groupId, setGroupId] = useState('');
  const [senderId, setSenderId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [mentions, setMentions] = useState(mentionsOnly);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scope = group?.id ?? groupId;
  const people = useMemo(() => {
    const seen = new Map<string, string>();
    for (const g of group ? [group] : groups) for (const m of g.members) seen.set(m.id, m.name);
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [group, groups]);

  // Start fresh each time it opens.
  useEffect(() => {
    if (isOpen) {
      setQ('');
      setGroupId('');
      setSenderId('');
      setFrom('');
      setTo('');
      setMentions(mentionsOnly);
      setHits(null);
    }
  }, [isOpen, mentionsOnly, group?.id]);

  const params = useMemo(
    () => ({ q: q.trim() || undefined, group_id: scope || undefined, sender_id: senderId || undefined, date_from: from || undefined, date_to: to || undefined, mentions_me: mentions || undefined }),
    [q, scope, senderId, from, to, mentions]
  );
  const anyFilter = Object.values(params).some(Boolean);

  // Search as they type, after a short pause.
  useEffect(() => {
    if (!isOpen) return;
    if (!anyFilter) {
      setHits(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      chatApi
        .search(params)
        .then((page) => {
          if (cancelled) return;
          setHits(page.items);
          setMore(page.has_more);
          setError(null);
        })
        .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Search failed'))
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isOpen, params, anyFilter]);

  const loadMore = async () => {
    if (!hits?.length) return;
    setLoading(true);
    try {
      const page = await chatApi.search({ ...params, before: hits[hits.length - 1].message.id });
      setHits([...hits, ...page.items]);
      setMore(page.has_more);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={group ? `Search “${group.name}”` : 'Search messages'} description={group ? undefined : 'Across all the chats you are in.'} maxWidth="2xl">
      <div className="space-y-4">
        <Input pill autoFocus placeholder="Words to look for" value={q} onChange={(e) => setQ(e.target.value)} leftIcon={<Search className="h-4 w-4" />} aria-label="Search words" />

        <div className="grid gap-3 sm:grid-cols-2">
          {!group && <Select label="Chat" value={groupId} onChange={(e) => setGroupId(e.target.value)} options={[{ value: '', label: 'All my chats' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />}
          <Select label="Sent by" value={senderId} onChange={(e) => setSenderId(e.target.value)} options={[{ value: '', label: 'Anyone' }, ...people]} />
          <Input label="From" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-[var(--tm-ink)]">
          <input type="checkbox" checked={mentions} onChange={(e) => setMentions(e.target.checked)} className="h-4 w-4 accent-[var(--tm-primary)]" />
          Only messages that mention me
        </label>

        {error && <p className="tm-error px-4 py-3 text-xs font-semibold">{error}</p>}

        <div aria-live="polite">
          {!anyFilter ? (
            <p className="py-6 text-center text-[13px] text-[var(--tm-ink-muted)]">Type something, or pick a person, a date or “mentions me”.</p>
          ) : hits === null ? (
            <p className="py-6 text-center text-[13px] text-[var(--tm-ink-muted)]">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[var(--tm-ink-muted)]">Nothing found.</p>
          ) : (
            <ul className="max-h-[40vh] divide-y divide-[var(--tm-border)] overflow-y-auto rounded-[var(--tm-radius-md)] border border-[var(--tm-border)]">
              {hits.map((h) => (
                <li key={h.message.id}>
                  <button type="button" onClick={() => onOpen(h.group_id, h.message.id)} className="block w-full px-3.5 py-2.5 text-left hover:bg-[var(--tm-card-muted)]">
                    <span className="flex items-baseline justify-between gap-2 text-[11.5px] text-[var(--tm-ink-muted)]">
                      <span className="truncate font-bold text-[var(--tm-primary-dark)]">
                        {h.message.sender?.name ?? 'Former member'}
                        {!group && <span className="font-medium text-[var(--tm-ink-muted)]"> · {h.group_name}</span>}
                      </span>
                      <span className="shrink-0">
                        {new Date(h.message.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} {listTime(h.message.created_at)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[13.5px] text-[var(--tm-ink)]">
                      <Snippet text={h.message.text || previewOf(h.message)} q={q} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {more && (
            <div className="mt-3 flex justify-center">
              <Button size="sm" variant="outline" isLoading={loading} onClick={loadMore}>
                Show more
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
