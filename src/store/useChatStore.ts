import { create } from 'zustand';
import { chatApi, type ChatGroup, type ChatMessage } from '../services/http/chatApi';
import { useAuthStore } from './authStore';
import { previewOf, statusOf } from '../features/chat/chatUtils';
import { amFocused } from './useFocusStore';
import { toast } from './useToastStore';

export interface Thread {
  items: ChatMessage[]; // oldest first
  hasMore: boolean;
  /** Newer messages exist than the last one loaded (after jumping to an old message). */
  hasNewer: boolean;
  loaded: boolean;
  loadingOlder: boolean;
  loadingNewer: boolean;
}

interface TypingEntry {
  name: string;
  timer: ReturnType<typeof setTimeout>;
}

interface ChatState {
  groups: ChatGroup[];
  groupsLoaded: boolean;
  /** The conversation open on screen, if any. */
  activeId: string | null;
  threads: Record<string, Thread>;
  /** A message to scroll to and flash once its conversation shows it. */
  jump: { groupId: string; messageId: string; nonce: number } | null;
  /** group id -> user id -> who is typing right now. */
  typing: Record<string, Record<string, TypingEntry>>;

  loadGroups: () => Promise<void>;
  setActive: (id: string | null) => void;
  openThread: (id: string) => Promise<void>;
  loadOlder: (id: string) => Promise<void>;
  loadNewer: (id: string) => Promise<void>;
  /** Open a window around a message (search result, pin, mention link). */
  jumpTo: (groupId: string, messageId: string) => Promise<boolean>;
  clearJump: () => void;
  /** Back to the newest messages. */
  showLatest: (id: string) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  upsertMessage: (m: ChatMessage) => void;
  removeMessage: (groupId: string, messageId: string) => void;
  applyReceipts: (e: { group_id: string; user_id: string; kind: 'delivered' | 'seen'; message_ids: string[]; at: string }) => void;
  setTyping: (groupId: string, userId: string, name: string) => void;
  upsertGroup: (g: ChatGroup) => void;
  dropGroup: (id: string) => void;
  reset: () => void;
}

const EMPTY_THREAD: Thread = { items: [], hasMore: false, hasNewer: false, loaded: false, loadingOlder: false, loadingNewer: false };
const TYPING_MS = 4000;

const byActivity = (a: ChatGroup, b: ChatGroup) =>
  new Date(b.last_message?.at ?? b.created_at).getTime() - new Date(a.last_message?.at ?? a.created_at).getTime();

const me = () => useAuthStore.getState().user?.id;

export const useChatStore = create<ChatState>((set, get) => ({
  groups: [],
  groupsLoaded: false,
  activeId: null,
  threads: {},
  jump: null,
  typing: {},

  loadGroups: async () => {
    try {
      const groups = (await chatApi.groups()).sort(byActivity);
      set({ groups, groupsLoaded: true });
    } catch {
      set({ groupsLoaded: true });
    }
  },

  setActive: (id) => {
    set({ activeId: id });
    if (id) void get().openThread(id);
  },

  openThread: async (id) => {
    if (!get().threads[id]?.loaded) {
      try {
        const page = await chatApi.messages(id);
        // A jump to an older message may have opened its own window while this was loading: keep that one.
        if (get().threads[id]?.loaded) return void (get().activeId === id && (await get().markRead(id)));
        set((s) => ({ threads: { ...s.threads, [id]: { ...EMPTY_THREAD, items: page.items, hasMore: page.has_more, loaded: true } } }));
      } catch {
        return;
      }
    }
    if (get().activeId === id) await get().markRead(id);
  },

  loadOlder: async (id) => {
    const t = get().threads[id];
    if (!t || !t.hasMore || t.loadingOlder || t.items.length === 0) return;
    set((s) => ({ threads: { ...s.threads, [id]: { ...t, loadingOlder: true } } }));
    try {
      const page = await chatApi.messages(id, { before: t.items[0].id });
      set((s) => {
        const cur = s.threads[id] ?? t;
        const known = new Set(cur.items.map((m) => m.id));
        return {
          threads: {
            ...s.threads,
            [id]: { ...cur, items: [...page.items.filter((m) => !known.has(m.id)), ...cur.items], hasMore: page.has_more, loadingOlder: false }
          }
        };
      });
    } catch {
      set((s) => ({ threads: { ...s.threads, [id]: { ...(s.threads[id] ?? t), loadingOlder: false } } }));
    }
  },

  loadNewer: async (id) => {
    const t = get().threads[id];
    if (!t || !t.hasNewer || t.loadingNewer || t.items.length === 0) return;
    set((s) => ({ threads: { ...s.threads, [id]: { ...t, loadingNewer: true } } }));
    try {
      const page = await chatApi.messages(id, { after: t.items[t.items.length - 1].id });
      set((s) => {
        const cur = s.threads[id] ?? t;
        const known = new Set(cur.items.map((m) => m.id));
        return {
          threads: { ...s.threads, [id]: { ...cur, items: [...cur.items, ...page.items.filter((m) => !known.has(m.id))], hasNewer: !!page.has_newer, loadingNewer: false } }
        };
      });
      if (!get().threads[id]?.hasNewer && get().activeId === id) await get().markRead(id);
    } catch {
      set((s) => ({ threads: { ...s.threads, [id]: { ...(s.threads[id] ?? t), loadingNewer: false } } }));
    }
  },

  jumpTo: async (groupId, messageId) => {
    const t = get().threads[groupId];
    // Already on screen: just scroll to it.
    if (t?.items.some((m) => m.id === messageId)) {
      set({ jump: { groupId, messageId, nonce: Date.now() } });
      return true;
    }
    try {
      const page = await chatApi.messages(groupId, { around: messageId });
      set((s) => ({
        threads: { ...s.threads, [groupId]: { ...EMPTY_THREAD, items: page.items, hasMore: page.has_more, hasNewer: !!page.has_newer, loaded: true } },
        jump: { groupId, messageId, nonce: Date.now() }
      }));
      return true;
    } catch {
      toast.error('Could not open that message', 'It may have been deleted.');
      return false;
    }
  },

  clearJump: () => set({ jump: null }),

  showLatest: async (id) => {
    set((s) => ({ threads: { ...s.threads, [id]: { ...(s.threads[id] ?? EMPTY_THREAD), loaded: false } } }));
    await get().openThread(id);
  },

  markRead: async (id) => {
    const g = get().groups.find((x) => x.id === id);
    if (g && g.unread_count > 0) set((s) => ({ groups: s.groups.map((x) => (x.id === id ? { ...x, unread_count: 0 } : x)) }));
    try {
      await chatApi.markRead(id);
    } catch {
      // The next open tries again.
    }
  },

  upsertMessage: (m) => {
    const state = get();
    const thread = state.threads[m.group_id];
    const existing = thread?.items.some((x) => x.id === m.id);

    if (thread) {
      // While reading an old stretch, newer messages are fetched when you scroll down, not spliced in here.
      const items = existing ? thread.items.map((x) => (x.id === m.id ? m : x)) : thread.hasNewer ? thread.items : [...thread.items, m];
      set((s) => ({ threads: { ...s.threads, [m.group_id]: { ...thread, items } } }));
    }

    const group = state.groups.find((g) => g.id === m.group_id);
    if (!group) {
      void get().loadGroups(); // a group we haven't heard of yet
      return;
    }
    if (existing) {
      // An edit (reaction, deletion): only the preview can change, and only if this is the newest message.
      const newest = thread && thread.items[thread.items.length - 1]?.id === m.id;
      if (newest && m.deleted) {
        set((s) => ({ groups: s.groups.map((g) => (g.id === m.group_id && g.last_message ? { ...g, last_message: { ...g.last_message, preview: previewOf(m) } } : g)) }));
      }
      return;
    }

    const mine = m.sender?.id === me();
    const watching = state.activeId === m.group_id && document.visibilityState === 'visible';
    const updated: ChatGroup = {
      ...group,
      last_message: { preview: previewOf(m), sender: m.sender, at: m.created_at, mine },
      // In Focus mode badges stay put; they are refreshed when Focus ends.
      unread_count: mine || watching || amFocused() ? group.unread_count : group.unread_count + 1
    };
    set((s) => ({ groups: [updated, ...s.groups.filter((g) => g.id !== m.group_id)].sort(byActivity) }));
    if (!mine && watching && !thread?.hasNewer) void get().markRead(m.group_id);
  },

  removeMessage: (groupId, messageId) =>
    set((s) => {
      const t = s.threads[groupId];
      return t ? { threads: { ...s.threads, [groupId]: { ...t, items: t.items.filter((m) => m.id !== messageId) } } } : s;
    }),

  applyReceipts: ({ group_id, user_id, kind, message_ids, at }) =>
    set((s) => {
      const t = s.threads[group_id];
      if (!t) return s;
      const ids = new Set(message_ids);
      const group = s.groups.find((g) => g.id === group_id);
      const items = t.items.map((m) => {
        if (!ids.has(m.id)) return m;
        const next = { ...m };
        if (kind === 'seen' && !m.seen_by.some((r) => r.user_id === user_id)) next.seen_by = [...m.seen_by, { user_id, at }];
        if (!m.delivered_to.some((r) => r.user_id === user_id)) next.delivered_to = [...m.delivered_to, { user_id, at }];
        next.status = statusOf(next, group);
        return next;
      });
      return { threads: { ...s.threads, [group_id]: { ...t, items } } };
    }),

  setTyping: (groupId, userId, name) => {
    const prev = get().typing[groupId]?.[userId];
    if (prev) clearTimeout(prev.timer);
    const timer = setTimeout(() => {
      set((s) => {
        const { [userId]: _gone, ...rest } = s.typing[groupId] ?? {};
        return { typing: { ...s.typing, [groupId]: rest } };
      });
    }, TYPING_MS);
    set((s) => ({ typing: { ...s.typing, [groupId]: { ...s.typing[groupId], [userId]: { name, timer } } } }));
  },

  upsertGroup: (g) =>
    set((s) => ({ groups: (s.groups.some((x) => x.id === g.id) ? s.groups.map((x) => (x.id === g.id ? g : x)) : [g, ...s.groups]).sort(byActivity) })),

  dropGroup: (id) =>
    set((s) => {
      const { [id]: _t, ...threads } = s.threads;
      return { groups: s.groups.filter((g) => g.id !== id), threads, activeId: s.activeId === id ? null : s.activeId };
    }),

  reset: () => {
    Object.values(get().typing).forEach((m) => Object.values(m).forEach((e) => clearTimeout(e.timer)));
    set({ groups: [], groupsLoaded: false, activeId: null, threads: {}, jump: null, typing: {} });
  }
}));

export { EMPTY_THREAD };
