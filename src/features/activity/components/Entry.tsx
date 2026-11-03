import React, { useState } from 'react';
import { CheckCircle2, ExternalLink, FileText, Link2, MessageSquareReply, SmilePlus, Trash2, UserRound } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { RichText } from '../../../components/editor/RichText';
import type { MentionPerson } from '../../../components/editor/RichEditor';
import { useConfirm } from '../../../hooks/useConfirm';
import { toast } from '../../../store/useToastStore';
import { activityApi, type ActivityEntry, type ActivityInput } from '../../../services/http/activityApi';
import { assetApi } from '../../../services/http/taskApi';
import { formatTimeAgo } from '../../../utils/time';
import { REACTIONS } from '../../chat/chatUtils';
import { EntryComposer } from './EntryComposer';
import { AssetDownloadButton } from '../../../components/ui/AssetDownloadButton';

interface Props {
  entry: ActivityEntry;
  replies: ActivityEntry[];
  meId: string;
  people: MentionPerson[];
  /** Flash this entry (the one a notification linked to). */
  highlight?: boolean;
  /** Something changed on the server: take the new version of an entry. */
  onUpdated: (e: ActivityEntry) => void;
  /** Reload the list (after a delete or a reply). */
  onReload: () => void;
  onReply: (input: ActivityInput) => Promise<void>;
  /** Show a round icon tile on the left (used where entries are listed as cards). */
  icon?: React.ReactNode;
}

const noun = (e: ActivityEntry) => (e.kind === 'change_request' ? 'mid-way change' : 'comment');

/** One mid-way change or comment: text, files, reactions, replies, and the Resolved tick. */
export const Entry: React.FC<Props> = ({ entry: e, replies, meId, people, highlight, onUpdated, onReload, onReply, icon }) => {
  const confirm = useConfirm();
  const [replying, setReplying] = useState(false);
  const [picker, setPicker] = useState(false);

  const react = async (emoji: string) => {
    setPicker(false);
    try {
      onUpdated(await activityApi.react(e.id, emoji));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not react');
    }
  };

  const toggleResolved = async () => {
    const next = !e.resolved;
    await confirm({
      title: next ? `Mark this ${noun(e)} as resolved?` : `Reopen this ${noun(e)}?`,
      message: `${e.author?.name ?? 'The author'} is notified.`,
      confirmLabel: next ? 'Resolve' : 'Reopen',
      action: async () => onUpdated(await activityApi.resolve(e.id, next)),
      successTitle: next ? 'Marked as resolved' : 'Reopened'
    });
  };

  const remove = () =>
    confirm({
      title: `Delete this ${noun(e)}?`,
      message: 'Its replies and files are deleted too. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      action: () => activityApi.remove(e.id),
      successTitle: 'Deleted'
    }).then((ok) => ok && onReload());

  const open = (f: ActivityEntry['files'][number]) => assetApi.open(f).catch((err) => toast.error('Could not open the file', err.message));

  return (
    <article id={`entry-${e.id}`} className={`rounded-[var(--tm-radius-md)] border p-3.5 transition-shadow ${highlight ? 'border-[var(--tm-primary)] shadow-soft-md' : 'border-[var(--tm-border)]'} ${e.resolved ? 'bg-[var(--tm-card-muted)]' : 'bg-[var(--tm-card)]'} ${icon ? 'flex gap-3.5 p-4' : ''}`}>
      {icon && (
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]">
          {icon}
        </span>
      )}
      <div className={icon ? 'min-w-0 flex-1' : ''}>
      <Header entry={e} />

      <div className={e.resolved ? 'opacity-70' : ''}>
        {e.assigned_to && (
          <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-[var(--tm-info-bg)] px-2.5 py-0.5 text-[11.5px] font-bold text-[var(--tm-info)]">
            <UserRound className="h-3 w-3" /> Assigned to {e.assigned_to.id === meId ? 'you' : e.assigned_to.name}
          </p>
        )}
        {e.body && <RichText html={e.body} meId={meId} />}
        {e.files.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {e.files.map((f) => (
              <li key={f.id}>
                {f.kind === 'link' ? (
                  <button type="button" onClick={() => open(f)} className="flex items-center gap-1.5 rounded-full bg-[var(--tm-bg-sunken)] px-3 py-1 text-[12px] font-semibold text-[var(--tm-ink)] hover:bg-[var(--tm-border)]">
                    <Link2 className="h-3.5 w-3.5" />
                    <span className="max-w-[10rem] truncate">{f.name}</span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-full bg-[var(--tm-bg-sunken)] py-1 pl-3 pr-1 text-[12px] font-semibold text-[var(--tm-ink)]">
                    <FileText className="h-3.5 w-3.5" />
                    <span className="max-w-[10rem] truncate">{f.name}</span>
                    <AssetDownloadButton asset={f} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {e.reactions.map((r) => (
          <button
            key={r.emoji}
            type="button"
            aria-pressed={r.user_ids.includes(meId)}
            onClick={() => react(r.emoji)}
            className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[12px] ${r.user_ids.includes(meId) ? 'border-[var(--tm-primary)] bg-[var(--tm-primary-soft)]' : 'border-[var(--tm-border)]'}`}
          >
            {r.emoji}
            {r.user_ids.length > 1 && <span className="tabular-nums">{r.user_ids.length}</span>}
          </button>
        ))}
        <span className="relative">
          <IconButton label="Add a reaction" onClick={() => setPicker((p) => !p)}>
            <SmilePlus className="h-4 w-4" />
          </IconButton>
          {picker && (
            <>
              <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setPicker(false)} />
              <div className="absolute bottom-full left-0 z-40 mb-1 flex gap-1 rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] p-1 shadow-soft-lg">
                {REACTIONS.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => react(emoji)} className="rounded-full p-1 text-lg hover:scale-125">
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}
        </span>
        <IconButton label="Reply" onClick={() => setReplying((r) => !r)}>
          <MessageSquareReply className="h-4 w-4" />
        </IconButton>
        {e.can_delete && (
          <IconButton label="Delete" onClick={remove}>
            <Trash2 className="h-4 w-4 text-[var(--tm-danger)]" />
          </IconButton>
        )}

        {(e.can_resolve || e.resolved) && (
          <label className={`ml-auto flex items-center gap-1.5 text-[12px] font-bold ${e.resolved ? 'text-[var(--tm-success)]' : 'text-[var(--tm-ink-soft)]'}`}>
            <input type="checkbox" checked={e.resolved} disabled={!e.can_resolve} onChange={toggleResolved} className="h-4 w-4 accent-[var(--tm-success)]" />
            Resolved
            {e.resolved && e.resolved_by && <span className="hidden font-medium text-[var(--tm-ink-muted)] sm:inline">by {e.resolved_by.name.split(' ')[0]}</span>}
          </label>
        )}
      </div>

      {replies.length > 0 && (
        <ul className="mt-3 space-y-2.5 border-l-2 border-[var(--tm-border)] pl-3">
          {replies.map((r) => (
            <li key={r.id} id={`entry-${r.id}`}>
              <Header entry={r} small />
              {r.body && <RichText html={r.body} meId={meId} />}
              {r.files.length > 0 && <p className="mt-1 text-[12px] text-[var(--tm-ink-muted)]">{r.files.map((f) => f.name).join(', ')}</p>}
              {r.can_delete && (
                <button
                  type="button"
                  className="mt-1 text-[11.5px] font-semibold text-[var(--tm-danger)] hover:underline"
                  onClick={() =>
                    confirm({
                      title: 'Delete this reply?',
                      message: 'This cannot be undone.',
                      confirmLabel: 'Delete',
                      danger: true,
                      action: () => activityApi.remove(r.id),
                      successTitle: 'Reply deleted'
                    }).then((ok) => ok && onReload())
                  }
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {replying && (
        <div className="mt-3">
          <EntryComposer kind={e.kind as 'change_request' | 'comment'} people={people} parentId={e.id} placeholder="Write a reply" compact onPost={onReply} onCancel={() => setReplying(false)} />
        </div>
      )}
      </div>
    </article>
  );
};

const Header: React.FC<{ entry: ActivityEntry; small?: boolean }> = ({ entry, small }) => (
  <header className="mb-1.5 flex items-center gap-2">
    <PersonLink userId={entry.author?.id} className="flex items-center gap-2">
      <Avatar name={entry.author?.name ?? '?'} src={entry.author?.avatar_url ?? undefined} size="xs" />
      <span className={`font-extrabold text-[var(--tm-ink)] ${small ? 'text-[12px]' : 'text-[13px]'}`}>{entry.author?.name ?? 'Former member'}</span>
    </PersonLink>
    <time dateTime={entry.created_at} className="text-[11px] text-[var(--tm-ink-muted)]">
      {formatTimeAgo(entry.created_at)}
    </time>
    {entry.resolved && <CheckCircle2 className="ml-auto h-4 w-4 text-[var(--tm-success)]" aria-label="Resolved" />}
  </header>
);

const IconButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick} className="grid h-7 w-7 place-items-center rounded-full text-[var(--tm-ink-muted)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]">
    {children}
  </button>
);
