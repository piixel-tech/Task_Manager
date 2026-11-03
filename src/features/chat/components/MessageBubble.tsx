import React, { useState } from 'react';
import { CheckSquare, CornerUpRight, Eye, FileText, Forward, Info, ListPlus, MoreHorizontal, Pin, PinOff, Reply, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { AuthImage } from '../../../components/ui/AuthImage';
import { Modal } from '../../../components/ui/Modal';
import { RichText } from '../../../components/editor/RichText';
import { focusEndLabel, useFocusOf } from '../../../store/useFocusStore';
import { assetApi } from '../../../services/http/taskApi';
import { toast } from '../../../store/useToastStore';
import type { ChatGroup, ChatMessage } from '../../../services/http/chatApi';
import { clock, mmss, REACTIONS, statusOf } from '../chatUtils';
import { AuthAudio } from './AuthAudio';
import { ApprovalCard } from './ApprovalCard';
import { Ticks } from './Ticks';
import { DriveFileViewer } from '../../google/DriveFileViewer';
import { DriveKindIcon } from '../../google/DriveKindIcon';
import { AssetDownloadButton } from '../../../components/ui/AssetDownloadButton';
import { KIND_LABEL } from '../../google/googleUtils';

interface Props {
  message: ChatMessage;
  group: ChatGroup;
  meId: string;
  /** Show the sender's name and avatar (first of a run from someone else). */
  showSender: boolean;
  onReply: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onForward: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage, scope: 'me' | 'everyone') => void;
  onInfo: (m: ChatMessage) => void;
  onPin: (m: ChatMessage) => void;
  /** Team members: turn this message into a task. */
  onCreateTask?: (m: ChatMessage) => void;
  /** Briefly highlighted after a jump to this message. */
  flash?: boolean;
}

/** One message: text, image, file or voice note, with reply quote, forward label, reactions, time and ticks. */
export const MessageBubble: React.FC<Props> = ({ message: m, group, meId, showSender, onReply, onReact, onForward, onDelete, onInfo, onPin, onCreateTask, flash }) => {
  const navigate = useNavigate();
  const area = useAuthStore((s) => (s.user?.role === 'admin' ? '/admin' : '/app'));
  const mine = m.sender?.id === meId;
  const senderFocus = useFocusOf(m.sender);
  const mentionsMe = !m.deleted && m.mentions.includes(meId);
  const pinned = group.pinned_ids.includes(m.id);
  // Only clients answer approvals; everyone else just watches the status change.
  const isClient = group.members.find((u) => u.id === meId)?.role === 'client';
  const [menu, setMenu] = useState(false);
  const [zoom, setZoom] = useState(false);
  const status = statusOf(m, group);
  const nameOf = (id: string) => (id === meId ? 'You' : (group.members.find((u) => u.id === id)?.name ?? 'Former member'));

  const act = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };

  const [previewDrive, setPreviewDrive] = useState(false);
  const open = () => m.file && assetApi.open(m.file).catch((err) => toast.error('Could not open the file', err.message));

  return (
    <div id={`msg-${m.id}`} className={`group/msg flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
      {!mine && (
        <div className="w-8 shrink-0">
          {showSender && (
            <PersonLink userId={m.sender?.id}>
              <Avatar name={m.sender?.name ?? '?'} src={m.sender?.avatar_url ?? undefined} size="sm" focus={senderFocus != null} />
            </PersonLink>
          )}
        </div>
      )}

      <div className={`relative flex max-w-[82%] flex-col sm:max-w-[70%] ${mine ? 'items-end' : 'items-start'}`}>
        <div
          data-own={mine ? 'true' : undefined}
          className={`tm-msg-in relative rounded-[18px] px-3.5 py-2 shadow-soft-xs transition-shadow ${
            flash ? 'ring-2 ring-[var(--tm-primary)]' : mentionsMe ? 'ring-1 ring-[var(--tm-warning)]' : ''
          } ${
            m.deleted
              ? 'border border-dashed border-[var(--tm-border-strong)] bg-transparent'
              : mine
                ? 'rounded-br-[6px] bg-[var(--tc-mine-bg)] text-[var(--tc-mine-ink)] [--tm-ink:var(--tc-mine-ink)] [--tm-ink-soft:color-mix(in_srgb,var(--tc-mine-ink)_90%,var(--tc-mine-bg))] [--tm-ink-muted:color-mix(in_srgb,var(--tc-mine-ink)_65%,var(--tc-mine-bg))] [--tm-primary-dark:var(--tm-accent-fixed)] [--tm-card-muted:color-mix(in_srgb,var(--tc-mine-ink)_12%,transparent)] [--tm-bg-sunken:color-mix(in_srgb,var(--tc-mine-ink)_14%,transparent)]'
                : 'rounded-bl-[6px] border border-[var(--tc-other-border)] bg-[var(--tc-other-bg)] text-[var(--tm-ink)]'
          }`}
        >
          {showSender && !mine && !m.deleted && (
            <p className="mb-0.5 text-[12px] font-extrabold text-[var(--tm-primary-dark)]">
              {m.sender?.name ?? 'Former member'}
              {senderFocus && <span className="ml-2 text-[11px] font-semibold text-[var(--tm-ink-muted)]">🌙 In focus until {focusEndLabel(senderFocus)}</span>}
            </p>
          )}
          {mentionsMe && <p className="mb-0.5 text-[11px] font-bold text-[var(--tm-warning)]">@ You were mentioned</p>}

          {m.deleted ? (
            <p className="text-[13px] italic text-[var(--tm-ink-muted)]">🚫 This message was deleted</p>
          ) : (
            <>
              {m.forwarded_from && (
                <p className="mb-1 flex items-center gap-1 text-[11.5px] italic text-[var(--tm-ink-muted)]">
                  <CornerUpRight className="h-3 w-3" />
                  Forwarded from {m.forwarded_from.id === meId ? 'you' : m.forwarded_from.name}
                </p>
              )}
              {m.reply && (
                <a
                  href={`#msg-${m.reply.id}`}
                  className="mb-1.5 block rounded-[var(--tm-radius-sm)] border-l-4 border-[var(--tm-primary)] bg-[var(--tm-card-muted)] px-3 py-2 text-[12px]"
                >
                  <span className="block font-bold text-[var(--tm-primary-dark)]">{m.reply.sender?.id === meId ? 'You' : (m.reply.sender?.name ?? 'Former member')}</span>
                  <span className={`line-clamp-2 ${m.reply.deleted ? 'italic' : ''} text-[var(--tm-ink-soft)]`}>{m.reply.preview}</span>
                </a>
              )}

              {m.type === 'image' && m.file && (
                <button type="button" onClick={() => setZoom(true)} aria-label="Open photo" className="mb-1 block overflow-hidden rounded-[var(--tm-radius-md)]">
                  <AuthImage url={m.file.url} alt={m.body || 'Photo'} className="max-h-72 w-full max-w-xs object-cover" />
                </button>
              )}
              {m.type === 'voice' && m.file && (
                <div className="py-1">
                  <AuthAudio url={m.file.url} />
                  {m.duration != null && <p className="mt-0.5 text-[11px] text-[var(--tm-ink-muted)]">🎤 {mmss(m.duration)}</p>}
                </div>
              )}
              {m.type === 'file' && m.file && (
                <div className="mb-1 flex w-full max-w-xs items-stretch gap-1.5">
                  {!m.file.drive ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[var(--tm-radius-sm)] bg-[var(--tm-card-muted)] p-3">
                      <FileText className="h-6 w-6 shrink-0 text-[var(--tm-primary-dark)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold">{m.file.name}</span>
                        <span className="text-[11px] text-[var(--tm-ink-muted)]">
                          {(m.file.size / 1024).toFixed(m.file.size > 1024 * 100 ? 0 : 1)} KB
                        </span>
                      </span>
                      <AssetDownloadButton asset={m.file} size="md" />
                    </div>
                  ) : (
                  <button
                    type="button"
                    onClick={open}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[var(--tm-radius-sm)] bg-[var(--tm-card-muted)] p-3 text-left hover:bg-[var(--tm-bg-sunken)]"
                  >
                    {m.file.drive ? (
                      <DriveKindIcon kind={m.file.drive.kind} className="h-6 w-6 shrink-0 text-[var(--tm-primary-dark)]" />
                    ) : (
                      <FileText className="h-6 w-6 shrink-0 text-[var(--tm-primary-dark)]" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-bold">{m.file.name}</span>
                      <span className="text-[11px] text-[var(--tm-ink-muted)]">
                        {m.file.drive
                          ? `${KIND_LABEL[m.file.drive.kind]} · tap to open in Google`
                          : `${(m.file.size / 1024).toFixed(m.file.size > 1024 * 100 ? 0 : 1)} KB · tap to download`}
                      </span>
                    </span>
                  </button>
                  )}
                  {m.file.drive && (
                    <button
                      type="button"
                      aria-label={`Preview ${m.file.name}`}
                      title="Preview here"
                      onClick={() => setPreviewDrive(true)}
                      className="grid w-10 shrink-0 place-items-center rounded-[var(--tm-radius-sm)] bg-[var(--tm-card-muted)] text-[var(--tm-primary-dark)] hover:bg-[var(--tm-bg-sunken)]"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
              {m.type === 'approval' && m.approval && (
                <ApprovalCard reminder={m.reminder} approval={m.approval} canAnswer={isClient && m.approval.status === 'pending'} />
              )}
              {m.body && m.type !== 'approval' && (m.html ? <RichText html={m.body} meId={meId} /> : <p className="whitespace-pre-wrap break-words text-[14px] leading-snug">{m.body}</p>)}
            </>
          )}

          {m.task && !m.deleted && (
            <button
              type="button"
              onClick={() => navigate(`${area}/tasks/${m.task!.id}`)}
              title={m.task.title}
              className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--tm-success-bg)] px-2.5 py-0.5 text-[11.5px] font-bold text-[var(--tm-success)] hover:underline"
            >
              <CheckSquare className="h-3 w-3 shrink-0" />
              <span className="truncate">Task created</span>
            </button>
          )}

          <div className="mt-1 flex items-center justify-end gap-1 text-[10.5px] text-[var(--tm-ink-muted)]">
            {pinned && <Pin className="h-3 w-3" aria-label="Pinned" />}
            {clock(m.created_at)}
            {mine && !m.deleted && (
              <button type="button" onClick={() => onInfo(m)} aria-label="Message info" className="rounded-full hover:bg-[var(--tm-bg-sunken)]">
                <Ticks status={status} />
              </button>
            )}
          </div>

          {!m.deleted && (
            <button
              type="button"
              aria-label="Message actions"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
              className={`absolute top-1 grid h-6 w-6 place-items-center rounded-full bg-[var(--tm-card)] text-[var(--tm-ink-muted)] shadow-soft-xs hover:text-[var(--tm-ink)] ${
                mine ? '-left-7' : '-right-7'
              } opacity-100 sm:opacity-0 sm:group-hover/msg:opacity-100 sm:focus:opacity-100`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
        </div>

        {m.reactions.length > 0 && (
          <div className={`-mt-2 flex flex-wrap gap-1 ${mine ? 'justify-end pr-2' : 'pl-2'}`}>
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReact(m, r.emoji)}
                title={r.user_ids.map(nameOf).join(', ')}
                aria-pressed={r.user_ids.includes(meId)}
                className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[12px] shadow-soft-xs ${
                  r.user_ids.includes(meId) ? 'border-[var(--tm-primary)] bg-[var(--tm-primary-soft)]' : 'border-[var(--tm-border)] bg-[var(--tm-card)]'
                }`}
              >
                {r.emoji}
                {r.user_ids.length > 1 && <span className="tabular-nums">{r.user_ids.length}</span>}
              </button>
            ))}
          </div>
        )}

        {menu && (
          <>
            <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setMenu(false)} />
            <div
              role="menu"
              className={`absolute top-8 z-40 w-56 rounded-[var(--tm-radius-md)] glass-strong p-1.5 ${mine ? 'right-0' : 'left-0'}`}
            >
              <div className="flex justify-between px-1 pb-1.5" role="group" aria-label="React">
                {REACTIONS.map((e) => (
                  <button key={e} type="button" onClick={act(() => onReact(m, e))} className="rounded-full p-1 text-lg hover:scale-125 hover:bg-[var(--tm-bg-sunken)]">
                    {e}
                  </button>
                ))}
              </div>
              <MenuItem icon={<Reply className="h-4 w-4" />} label="Reply" onClick={act(() => onReply(m))} />
              {m.type !== 'approval' && <MenuItem icon={<Forward className="h-4 w-4" />} label="Forward" onClick={act(() => onForward(m))} />}
              {onCreateTask && !m.task && m.type !== 'approval' && (
                <MenuItem icon={<ListPlus className="h-4 w-4" />} label="Create task" onClick={act(() => onCreateTask(m))} />
              )}
              {group.can_pin && (
                <MenuItem icon={pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />} label={pinned ? 'Unpin' : 'Pin to top'} onClick={act(() => onPin(m))} />
              )}
              {mine && <MenuItem icon={<Info className="h-4 w-4" />} label="Message info" onClick={act(() => onInfo(m))} />}
              <MenuItem icon={<Trash2 className="h-4 w-4" />} label="Delete for me" danger onClick={act(() => onDelete(m, 'me'))} />
              {mine && <MenuItem icon={<Trash2 className="h-4 w-4" />} label="Delete for everyone" danger onClick={act(() => onDelete(m, 'everyone'))} />}
            </div>
          </>
        )}
      </div>

      {m.type === 'file' && m.file?.drive && <DriveFileViewer file={previewDrive ? m.file : null} onClose={() => setPreviewDrive(false)} />}

      {m.type === 'image' && m.file && (
        <Modal isOpen={zoom} onClose={() => setZoom(false)} title={m.body || 'Photo'} maxWidth="2xl">
          <AuthImage url={m.file.url} alt={m.body || 'Photo'} className="max-h-[70vh] w-full rounded-[var(--tm-radius-md)] object-contain" />
        </Modal>
      )}
    </div>
  );
};

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }> = ({ icon, label, onClick, danger }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={`flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-[13px] font-semibold hover:bg-[var(--tm-bg-sunken)] ${
      danger ? 'text-[var(--tm-danger)]' : 'text-[var(--tm-ink)]'
    }`}
  >
    {icon}
    {label}
  </button>
);
