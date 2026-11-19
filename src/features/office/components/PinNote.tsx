import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { AuthImage } from '../../../components/ui/AuthImage';
import { AvatarStack } from '../../../components/ui/AvatarStack';
import { assetApi } from '../../../services/http/taskApi';
import { PersonLink } from '../../../components/ui/PersonLink';
import { useAuthStore } from '../../../store/authStore';
import type { OfficePost } from '../../../services/http/officeApi';
import { REACTIONS } from '../officeMeta';
import { PeoplePopover } from './PeoplePopover';

/** Soft note colours (lavender, pink, cream) and the pin that goes with each; they rotate by post. */
export const NOTE_TINTS = [
  { bg: 'var(--tm-primary-soft)', pin: 'var(--tm-primary-dark)' },
  { bg: 'color-mix(in srgb, var(--tm-danger) 12%, var(--tm-card))', pin: 'var(--tm-danger)' },
  { bg: 'color-mix(in srgb, var(--tm-warning) 16%, var(--tm-card))', pin: 'var(--tm-warning)' }
] as const;
/** A slight tilt per note, in degrees. */
export const TILTS = [-1, 0.8, -0.6, 1, -0.8, 0.6] as const;

const noHover = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none)').matches;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Whole days a post has been open (or took to solve). */
export const daysBetween = (from: string, to: number | string = Date.now()) => Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000));

/** One post as a sticky note on the pinboard. */
export const PinNote: React.FC<{
  post: OfficePost;
  index: number;
  onViewed: (id: string) => void;
  onReact: (post: OfficePost, emoji: string) => void;
  onToggleResolved: (post: OfficePost) => void;
  /** Delete the post (shown when the viewer may: the author or an admin). */
  onDelete?: (post: OfficePost) => void;
}> = ({ post, index, onViewed, onReact, onToggleResolved, onDelete }) => {
  const me = useAuthStore((s) => s.user);
  const ref = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const [popover, setPopover] = useState<string | null>(null); // 'r:<emoji>', 'seen' or 'add'
  const tint = NOTE_TINTS[index % NOTE_TINTS.length];
  const tilt = TILTS[index % TILTS.length];
  const mine = post.author?.id === me?.id;
  const openDays = daysBetween(post.created_at);

  // Mark as seen once at least half the note has been visible for a moment.
  useEffect(() => {
    const el = ref.current;
    if (!post.is_new || !el || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer);
        if (entry.isIntersecting) timer = setTimeout(() => onViewed(post.id), 800);
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [post.id, post.is_new, onViewed]);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (el && !expanded) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [post.text, expanded]);

  const shown = post.reactions.filter((r) => r.count > 0);

  return (
    <article
      ref={ref}
      data-resolved={post.resolved || undefined}
      style={{ background: tint.bg, ['--tilt' as string]: `${tilt}deg` }}
      className={`group relative flex min-h-[250px] max-sm:min-h-0 rotate-[var(--tilt)] flex-col gap-3 max-sm:gap-2 rounded-[18px] p-5 max-sm:p-3 pt-7 max-sm:pt-6 shadow-soft-sm transition-all duration-200 hover:z-20 hover:-translate-y-1.5 hover:rotate-0 hover:shadow-soft focus-within:z-20 ${
        post.resolved ? 'opacity-60 hover:opacity-100' : ''
      }`}
    >
      {/* The pin: a coloured dot, or a green tick once it is solved */}
      <span
        aria-hidden
        className="absolute left-1/2 top-2 grid h-4 w-4 -translate-x-1/2 place-items-center rounded-full text-white shadow-soft-xs"
        style={{ background: post.resolved ? 'var(--tm-success)' : tint.pin }}
      >
        {post.resolved && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
      </span>

      <div className="flex items-center gap-2">
        <PersonLink userId={post.author?.id} className="flex min-w-0 items-center gap-2">
          <Avatar name={post.author?.name ?? 'Someone'} src={post.author?.avatar_url ?? undefined} size="sm" />
          <span className="truncate text-[13px] font-semibold text-[var(--tm-ink)]">{mine ? 'You' : (post.author?.name ?? 'Someone')}</span>
        </PersonLink>
        <span className="shrink-0 text-[11.5px] text-[var(--tm-ink-soft)]" title={new Date(post.created_at).toLocaleString()}>
          · {day(post.created_at)}
        </span>
        {post.is_new && (
          <span className="ml-auto rounded-full bg-[var(--tm-danger)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--tm-on-primary)]">New</span>
        )}
      </div>

      <div>
        <p
          ref={textRef}
          className={`whitespace-pre-wrap break-words text-[22px] max-sm:text-[17px] font-bold leading-tight tracking-[-0.01em] text-[var(--tm-ink)] ${expanded ? '' : 'line-clamp-4'} ${post.resolved ? 'line-through decoration-2' : ''}`}
        >
          {post.text}
        </p>
        {(clamped || expanded) && (
          <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} className="mt-1 text-[12px] font-bold text-[var(--tm-primary-dark)] hover:underline">
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>

      {post.photo && (
        <button type="button" onClick={() => void assetApi.open(post.photo!)} aria-label="Enlarge photo" className="block h-16 w-16 overflow-hidden rounded-[12px] border border-[var(--tm-border)]">
          <AuthImage url={post.photo.url} alt={`Photo for: ${post.text.slice(0, 60)}`} className="h-full w-full object-cover" />
        </button>
      )}

      {post.resolved && post.resolved_by ? (
        <p className="text-[12px] font-medium text-[var(--tm-success)]">
          Resolved by {post.resolved_by.id === me?.id ? 'you' : post.resolved_by.name}
          {post.resolved_at ? ` · ${day(post.resolved_at)}` : ''}
        </p>
      ) : (
        <p className="text-[12px] font-medium text-[var(--tm-ink-soft)]">{openDays === 0 ? 'Open since today' : `Open for ${openDays} ${openDays === 1 ? 'day' : 'days'}`}</p>
      )}

      {/* Reactions with a count, and + to add one */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Reactions">
        {shown.map((r) => {
          const key = `r:${r.emoji}`;
          const open = popover === key && r.users.length > 0;
          return (
            <div
              key={r.emoji}
              className="relative"
              onMouseEnter={() => !noHover() && r.users.length && setPopover(key)}
              onMouseLeave={() => !noHover() && setPopover((p) => (p === key ? null : p))}
            >
              <button
                type="button"
                aria-pressed={r.mine}
                aria-expanded={open}
                onClick={() => (noHover() && r.users.length ? setPopover(open ? null : key) : onReact(post, r.emoji))}
                className={`inline-flex h-7 items-center gap-1 rounded-full bg-[var(--tm-card)]/80 px-2.5 text-[12px] text-[var(--tm-ink)] transition-transform hover:scale-105 ${r.mine ? 'font-bold ring-1 ring-[var(--tm-primary-dark)]' : 'font-semibold'}`}
              >
                <span>{r.emoji}</span>
                <span className="tabular-nums">{r.count}</span>
              </button>
              {open && (
                <>
                  {noHover() && <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setPopover(null)} />}
                  <PeoplePopover title={`${r.emoji} ${r.count} ${r.count === 1 ? 'reaction' : 'reactions'}`} people={r.users} meId={me?.id}>
                    {noHover() && (
                      <button
                        type="button"
                        onClick={() => {
                          setPopover(null);
                          onReact(post, r.emoji);
                        }}
                        className="mt-1.5 w-full rounded-full bg-[var(--tp-chip)] py-1.5 text-[12px] font-bold text-[var(--tp-chip-ink)]"
                      >
                        {r.mine ? 'Remove my reaction' : `React ${r.emoji}`}
                      </button>
                    )}
                  </PeoplePopover>
                </>
              )}
            </div>
          );
        })}
        <div className="relative">
          <button
            type="button"
            aria-label="Add a reaction"
            aria-expanded={popover === 'add'}
            onClick={() => setPopover((p) => (p === 'add' ? null : 'add'))}
            className="grid h-7 w-7 place-items-center rounded-full border border-dashed border-[var(--tm-ink-muted)] text-[var(--tm-ink-soft)] transition-colors hover:bg-[var(--tm-card)]/70"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {popover === 'add' && (
            <>
              <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setPopover(null)} />
              <div role="menu" className="glass-strong absolute bottom-[calc(100%+6px)] left-0 z-40 flex gap-1 rounded-full p-1.5">
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    role="menuitem"
                    aria-label={`React ${emoji}`}
                    onClick={() => {
                      setPopover(null);
                      onReact(post, emoji);
                    }}
                    className="grid h-8 w-8 place-items-center rounded-full text-[17px] transition-transform hover:scale-125"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dashed divider, then seen by + resolve */}
      <div className="mt-auto flex items-center justify-between gap-2 max-sm:flex-wrap border-t border-dashed border-[var(--tm-ink-muted)]/50 pt-3">
        <div className="relative flex min-w-0 items-center text-[11.5px] text-[var(--tm-ink-soft)]">
          {post.seen_by.length > 0 ? (
            <>
              <button type="button" aria-expanded={popover === 'seen'} onClick={() => setPopover((p) => (p === 'seen' ? null : 'seen'))} className="flex min-w-0 items-center gap-2 rounded-full hover:text-[var(--tm-ink)]">
                <AvatarStack size="xs" max={3} spreadOnHover={false} people={post.seen_by.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatar_url ?? undefined }))} />
                <span className="truncate">Seen by {post.seen_count}</span>
              </button>
              {popover === 'seen' && (
                <>
                  <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setPopover(null)} />
                  <PeoplePopover title={`Seen by ${post.seen_count}`} people={post.seen_by} meId={me?.id} />
                </>
              )}
            </>
          ) : (
            <span>Not seen yet</span>
          )}
        </div>
        {post.can_delete && onDelete && (
          <button
            type="button"
            aria-label="Delete post"
            title="Delete post"
            onClick={() => onDelete(post)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--tm-card)] text-[var(--tm-ink-muted)] shadow-soft-xs transition-colors hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-danger)] focus-visible:outline-none focus-visible:shadow-glow"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        {post.can_resolve && (
          <button
            type="button"
            onClick={() => onToggleResolved(post)}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[var(--tm-card)] px-3 text-[12px] font-bold text-[var(--tm-ink)] shadow-soft-xs transition-colors hover:bg-[var(--tm-bg-sunken)] focus-visible:outline-none focus-visible:shadow-glow"
          >
            {post.resolved ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            {post.resolved ? 'Reopen' : 'Resolved'}
          </button>
        )}
      </div>
    </article>
  );
};
