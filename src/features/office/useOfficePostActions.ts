import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuthStore } from '../../store/authStore';
import { useOfficeStore } from '../../store/useOfficeStore';
import { toast } from '../../store/useToastStore';
import { officeApi, type OfficePost } from '../../services/http/officeApi';

/** What a post card can do (seen, react, resolve), shared by the board page and the dashboard card. */
export function useOfficePostActions(setItems: Dispatch<SetStateAction<OfficePost[]>>, reload: () => void) {
  const confirm = useConfirm();
  const me = useAuthStore((s) => s.user);
  const setUnseen = useOfficeStore((s) => s.setUnseen);

  const replace = (post: OfficePost) => setItems((cur) => cur.map((p) => (p.id === post.id ? post : p)));

  // Posts that have been on screen are reported to the API in one batch.
  const pending = useRef(new Set<string>());
  const flush = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onViewed = useCallback(
    (id: string) => {
      pending.current.add(id);
      clearTimeout(flush.current);
      flush.current = setTimeout(async () => {
        const ids = [...pending.current];
        pending.current.clear();
        try {
          const { unseen_count } = await officeApi.markSeen(ids);
          setUnseen(unseen_count);
          const viewer = me && {
            id: me.id,
            name: me.name,
            avatar_url: me.avatarUrl ?? null,
            role: me.role,
            company_id: me.companyId ?? null
          };
          setItems((cur) =>
            cur.map((p) =>
              ids.includes(p.id) && p.is_new
                ? { ...p, is_new: false, seen_count: p.seen_count + 1, seen_by: viewer ? [...p.seen_by, viewer] : p.seen_by }
                : p
            )
          );
        } catch {
          // Not critical: they will be reported again next time they are viewed.
        }
      }, 500);
    },
    [me, setUnseen, setItems]
  );
  useEffect(() => () => clearTimeout(flush.current), []);

  const react = async (post: OfficePost, emoji: string) => {
    try {
      replace(await officeApi.react(post.id, emoji));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not react');
    }
  };

  const toggleResolved = (post: OfficePost) =>
    confirm({
      title: post.resolved ? 'Reopen this post?' : 'Mark as resolved?',
      message: post.resolved
        ? 'It goes back to the open list and the team is notified.'
        : 'It stays on the board as history and the team is notified.',
      confirmLabel: post.resolved ? 'Reopen' : 'Mark resolved',
      action: async () => {
        replace(await officeApi.setResolved(post.id, !post.resolved));
      },
      successTitle: post.resolved ? 'Post reopened' : 'Marked as resolved'
    }).then((ok) => {
      if (ok) reload(); // it may no longer match the open/resolved tab
    });

  return { onViewed, react, toggleResolved };
}
