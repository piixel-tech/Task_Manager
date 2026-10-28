import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { AvatarStack } from '../../../components/ui/AvatarStack';
import { AuthImage } from '../../../components/ui/AuthImage';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useAuthStore } from '../../../store/authStore';
import type { OfficePost } from '../../../services/http/officeApi';
import { categoryMeta, REACTIONS, timeAgo, tint } from '../officeMeta';

interface Props {
  post: OfficePost;
  /** Called once when a post you haven't seen has been on screen for a moment. */
  onViewed: (id: string) => void;
  onReact: (post: OfficePost, emoji: string) => void;
  onToggleResolved: (post: OfficePost) => void;
}

/** One notice or issue: category colour and emoji, author, photo, reactions, who has seen it, resolved state. */
export const OfficePostCard: React.FC<Props> = ({ post, onViewed, onReact, onToggleResolved }) => {
  const me = useAuthStore((s) => s.user);
  const meta = categoryMeta(post.category);
  const ref = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(false);

  // Mark as seen once at least half the card has been visible for a moment.
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

  const reactions = new Map(post.reactions.map((r) => [r.emoji, r]));
  const mine = post.author?.id === me?.id;

  return (
    <article
      ref={ref}
      style={tint(meta.accent, post.resolved ? 3 : 9)}
      className={`relative overflow-hidden rounded-[var(--tm-radius-xl)] border p-5 shadow-soft-xs transition-shadow hover:shadow-soft ${
        post.resolved ? 'opacity-80' : ''
      }`}
    >
      {/* Colour strip */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: meta.accent }} />

      <div className="flex items-start gap-3.5 pl-1.5">
        <span
          aria-hidden
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl shadow-soft-xs"
          style={{ background: `color-mix(in srgb, ${meta.accent} 22%, var(--tm-card))` }}
        >
          {post.emoji}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-extrabold uppercase tracking-wide" style={{ color: meta.accent }}>
              {post.category_label}
            </span>
            {post.is_new && (
              <span className="rounded-full bg-[var(--tm-danger)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                New
              </span>
            )}
            {post.resolved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--tm-success-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--tm-success)]">
                <CheckCircle2 className="h-3 w-3" />
                Resolved
              </span>
            )}
            <span className="ml-auto text-[11.5px] text-[var(--tm-ink-muted)]" title={new Date(post.created_at).toLocaleString()}>
              {timeAgo(post.created_at)}
            </span>
          </div>

          <div className="mt-1.5 flex items-center gap-2">
            <PersonLink userId={post.author?.id} className="flex items-center gap-2">
              <Avatar name={post.author?.name ?? 'Someone'} src={post.author?.avatar_url ?? undefined} size="xs" />
              <span className="text-[12.5px] font-semibold text-[var(--tm-ink-soft)]">{mine ? 'You' : (post.author?.name ?? 'Someone')}</span>
            </PersonLink>
          </div>

          <p
            className={`mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed ${
              post.resolved ? 'text-[var(--tm-ink-muted)] line-through decoration-2' : 'font-semibold text-[var(--tm-ink)]'
            }`}
          >
            {post.text}
          </p>

          {post.photo && (
            <button
              type="button"
              onClick={() => setZoom(true)}
              aria-label="Enlarge photo"
              className="mt-3 block overflow-hidden rounded-xl border border-[var(--tm-border)]"
            >
              <AuthImage url={post.photo.url} alt={`Photo for: ${post.text.slice(0, 60)}`} className="h-52 w-full max-w-md object-cover" />
            </button>
          )}

          {post.resolved && post.resolved_by && (
            <p className="mt-2 text-[12px] text-[var(--tm-success)]">
              Resolved by {post.resolved_by.id === me?.id ? 'you' : post.resolved_by.name}
              {post.resolved_at ? ` · ${timeAgo(post.resolved_at)}` : ''}
            </p>
          )}

          {/* Reactions */}
          <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Reactions">
            {REACTIONS.map((emoji) => {
              const r = reactions.get(emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  aria-pressed={!!r?.mine}
                  onClick={() => onReact(post, emoji)}
                  title={r?.users.length ? r.users.map((u) => u.name).join(', ') : `React ${emoji}`}
                  className={`inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[13px] transition-transform hover:scale-110 ${
                    r?.mine
                      ? 'border-[var(--tm-primary)] bg-[var(--tm-primary-soft)] font-bold text-[var(--tm-primary-dark)]'
                      : r
                        ? 'border-[var(--tm-border-strong)] bg-[var(--tm-card)] font-semibold text-[var(--tm-ink)]'
                        : 'border-transparent text-[var(--tm-ink-muted)] opacity-70 hover:opacity-100'
                  }`}
                >
                  <span>{emoji}</span>
                  {r && <span className="tabular-nums">{r.count}</span>}
                </button>
              );
            })}
          </div>

          {/* Footer: seen by + resolve */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--tm-border)] pt-3">
            <div className="flex items-center gap-2 text-[12px] text-[var(--tm-ink-muted)]">
              {post.seen_by.length > 0 ? (
                <>
                  <AvatarStack
                    size="xs"
                    max={5}
                    people={post.seen_by.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatar_url ?? undefined }))}
                  />
                  <span>Seen by {post.seen_count}</span>
                </>
              ) : (
                <span>Not seen yet</span>
              )}
            </div>
            {post.can_resolve && (
              <Button
                size="sm"
                variant={post.resolved ? 'outline' : 'secondary'}
                onClick={() => onToggleResolved(post)}
                leftIcon={post.resolved ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              >
                {post.resolved ? 'Reopen' : 'Mark resolved'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {post.photo && (
        <Modal isOpen={zoom} onClose={() => setZoom(false)} title={`${post.emoji} ${post.category_label}`} maxWidth="lg">
          <AuthImage url={post.photo.url} alt="Full-size photo" className="max-h-[70vh] w-full rounded-lg object-contain" />
        </Modal>
      )}
    </article>
  );
};
