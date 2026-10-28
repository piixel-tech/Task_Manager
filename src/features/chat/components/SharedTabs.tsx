import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, FileText, Film } from 'lucide-react';
import { AuthImage } from '../../../components/ui/AuthImage';
import { Button } from '../../../components/ui/Button';
import { PillTabs } from '../../../components/ui/PillTabs';
import { assetApi } from '../../../services/http/taskApi';
import { toast } from '../../../store/useToastStore';
import { chatApi, type ChatMessage, type LinkItem } from '../../../services/http/chatApi';

type Kind = 'media' | 'docs' | 'links';

interface Props {
  groupId: string;
  /** Jump to the message a file or link came from. */
  onOpenMessage: (messageId: string) => void;
}

const when = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** Everything shared in a group, WhatsApp-style: photos and videos, documents, and links. */
export const SharedTabs: React.FC<Props> = ({ groupId, onOpenMessage }) => {
  const [kind, setKind] = useState<Kind>('media');
  const [files, setFiles] = useState<ChatMessage[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [more, setMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      try {
        if (kind === 'links') {
          const page = await chatApi.links(groupId, reset ? undefined : (cursor ?? undefined));
          setLinks((cur) => (reset ? page.items : [...cur, ...page.items]));
          setMore(page.has_more);
          setCursor(page.next_before);
        } else {
          const before = reset ? undefined : files[files.length - 1]?.id;
          const page = await chatApi.shared(groupId, kind, before);
          setFiles((cur) => (reset ? page.items : [...cur, ...page.items]));
          setMore(page.has_more);
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load this tab');
      } finally {
        setLoading(false);
      }
    },
    [groupId, kind, cursor, files]
  );

  useEffect(() => {
    setFiles([]);
    setLinks([]);
    setMore(false);
    setCursor(null);
    void load(true);
    // Reload only when the tab or group changes, not whenever `load` is rebuilt from fresh data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, kind]);

  const open = (m: ChatMessage) => m.file && assetApi.open(m.file).catch((err) => toast.error('Could not open the file', err.message));
  const empty = !loading && !error && (kind === 'links' ? links.length === 0 : files.length === 0);

  return (
    <div className="space-y-4">
      <PillTabs
        size="sm"
        activeTab={kind}
        onChange={(id) => setKind(id as Kind)}
        tabs={[
          { id: 'media', label: 'Media' },
          { id: 'docs', label: 'Docs' },
          { id: 'links', label: 'Links' }
        ]}
      />

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}
      {loading && files.length + links.length === 0 && <p className="py-6 text-center text-[13px] text-[var(--tm-ink-muted)]">Loading…</p>}
      {empty && (
        <p className="py-6 text-center text-[13px] text-[var(--tm-ink-muted)]">
          {kind === 'media' ? 'No photos or videos yet.' : kind === 'docs' ? 'No documents yet.' : 'No links yet.'}
        </p>
      )}

      {kind === 'media' && files.length > 0 && (
        <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {files.map((m) => (
            <li key={m.id} className="group/tile relative aspect-square overflow-hidden rounded-xl bg-[var(--tm-bg-sunken)]">
              <button type="button" aria-label={`Show ${m.file?.name ?? 'media'} in the chat`} onClick={() => onOpenMessage(m.id)} className="h-full w-full">
                {m.file?.mime.startsWith('image/') ? (
                  <AuthImage url={m.file.url} alt={m.file.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-[var(--tm-ink-muted)]">
                    <Film className="h-7 w-7" />
                  </span>
                )}
              </button>
              {m.file && !m.file.mime.startsWith('image/') && (
                <button type="button" onClick={() => open(m)} className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-1 text-left text-[10.5px] font-semibold text-white">
                  {m.file.name}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {kind === 'docs' && files.length > 0 && (
        <ul className="divide-y divide-[var(--tm-border)] rounded-xl border border-[var(--tm-border)]">
          {files.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
              <FileText className="h-6 w-6 shrink-0 text-[var(--tm-primary)]" />
              <button type="button" onClick={() => open(m)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[13.5px] font-bold text-[var(--tm-ink)]">{m.file?.name}</span>
                <span className="text-[11.5px] text-[var(--tm-ink-muted)]">
                  {m.file ? kb(m.file.size) : ''} · {m.sender?.name ?? 'Former member'} · {when(m.created_at)}
                </span>
              </button>
              <Button size="sm" variant="ghost" onClick={() => onOpenMessage(m.id)}>
                Show in chat
              </Button>
            </li>
          ))}
        </ul>
      )}

      {kind === 'links' && links.length > 0 && (
        <ul className="divide-y divide-[var(--tm-border)] rounded-xl border border-[var(--tm-border)]">
          {links.map((l) => (
            <li key={`${l.message_id}-${l.url}`} className="flex items-center gap-3 px-3 py-2.5">
              <ExternalLink className="h-5 w-5 shrink-0 text-[var(--tm-primary)]" />
              <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-bold text-[var(--tm-ink)]">{l.title || host(l.url)}</span>
                <span className="block truncate text-[11.5px] text-[var(--tm-primary)]">{l.url}</span>
                <span className="text-[11.5px] text-[var(--tm-ink-muted)]">
                  {l.sender?.name ?? 'Former member'} · {when(l.created_at)}
                </span>
              </a>
              <Button size="sm" variant="ghost" onClick={() => onOpenMessage(l.message_id)}>
                Show in chat
              </Button>
            </li>
          ))}
        </ul>
      )}

      {more && (
        <div className="flex justify-center">
          <Button size="sm" variant="outline" isLoading={loading} onClick={() => void load(false)}>
            Show more
          </Button>
        </div>
      )}
    </div>
  );
};
