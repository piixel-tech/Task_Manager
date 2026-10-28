import { api, getErrorMessage } from '../api';
import type { UserBrief } from './projectApi';
import type { Asset } from './taskApi';

export type MessageType = 'text' | 'file' | 'image' | 'voice' | 'approval';
export type MessageStatus = 'sent' | 'delivered' | 'seen';

export interface Receipt {
  user_id: string;
  at: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** A question put to the client(s), answered with one of two custom buttons. */
export interface Approval {
  id: string;
  question: string;
  files: Asset[];
  approve_label: string;
  reject_label: string;
  status: ApprovalStatus;
  /** Why it was rejected. */
  reason: string | null;
  answered_by: UserBrief | null;
  answered_at: string | null;
  created_at: string;
  /** Only while pending. */
  next_reminder_at: string | null;
}

export interface ApprovalItem {
  approval: Approval;
  group_id: string;
  group_name: string;
  message_id: string | null;
}

export interface Invite {
  id: string;
  group_id: string;
  token: string;
  expires_at: string;
  created_at: string;
  created_by: UserBrief | null;
  /** How many clients have joined with this link. */
  used_count: number;
}

export interface ChatMessage {
  id: string;
  group_id: string;
  sender: UserBrief | null;
  type: MessageType;
  /** HTML from the rich editor when `html`, otherwise plain text. */
  body: string;
  html: boolean;
  /** Always plain: previews and search hits. */
  text: string;
  /** People @mentioned (only those who could read it). */
  mentions: string[];
  links: string[];
  file: Asset | null;
  /** Voice notes: seconds. */
  duration: number | null;
  reply: { id: string; sender: UserBrief | null; type: MessageType; preview: string; deleted: boolean } | null;
  forwarded_from: UserBrief | null;
  approval: Approval | null;
  /** A repeat of an approval card that is still waiting. */
  reminder: boolean;
  /** A task was created from this message. */
  task: { id: string; title: string } | null;
  reactions: { emoji: string; user_ids: string[] }[];
  delivered_to: Receipt[];
  seen_by: Receipt[];
  status: MessageStatus;
  /** Deleted for everyone. */
  deleted: boolean;
  created_at: string;
}

export interface ChatGroup {
  id: string;
  name: string;
  members: UserBrief[];
  /** User id -> when they joined. */
  joined_at: Record<string, string>;
  created_by: string;
  subfolder: { id: string; name: string; project_id: string } | null;
  last_message: { preview: string; sender: UserBrief | null; at: string; mine: boolean } | null;
  unread_count: number;
  /** The creator: rename, link, remove people, delete. */
  can_manage: boolean;
  /** Admins and heads of the linked subfolder: make client invite links. */
  can_invite: boolean;
  /** Team members: pin and unpin messages. */
  can_pin: boolean;
  /** Newest pin first. */
  pinned_ids: string[];
  created_at: string;
}

export interface MessagePage {
  items: ChatMessage[];
  has_more: boolean;
  /** Newer messages exist beyond this page (after jumping to an old message). */
  has_newer?: boolean;
}

export interface SharedPage {
  items: ChatMessage[];
  has_more: boolean;
}

export interface LinkItem {
  url: string;
  title: string | null;
  message_id: string;
  sender: UserBrief | null;
  created_at: string;
}

export interface LinkPage {
  items: LinkItem[];
  has_more: boolean;
  next_before: string | null;
}

export interface SearchHit {
  group_id: string;
  group_name: string;
  message: ChatMessage;
}

export interface SearchParams {
  q?: string;
  group_id?: string;
  sender_id?: string;
  date_from?: string;
  date_to?: string;
  mentions_me?: boolean;
  before?: string;
}

export interface Pin {
  message: ChatMessage;
  pinned_by: UserBrief | null;
  pinned_at: string;
}

export interface Scheduled {
  id: string;
  group_id: string;
  /** HTML. */
  body: string;
  text: string;
  files: Asset[];
  send_at: string;
  created_at: string;
}

export interface SendInput {
  type?: MessageType;
  body?: string;
  file_id?: string;
  duration?: number;
  reply_to?: string;
  /** `body` is HTML from the rich editor. */
  html?: boolean;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const chatApi = {
  groups: () => call<ChatGroup[]>(() => api.get('/chat/groups'), 'Could not load your chats'),
  group: (id: string) => call<ChatGroup>(() => api.get(`/chat/groups/${id}`), 'Could not load the group'),
  createGroup: (name: string, member_ids: string[], subfolder_id: string | null) =>
    call<ChatGroup>(() => api.post('/chat/groups', { name, member_ids, subfolder_id }), 'Could not create the group'),
  updateGroup: (id: string, patch: { name?: string; subfolder_id?: string | null }) =>
    call<ChatGroup>(() => api.patch(`/chat/groups/${id}`, patch), 'Could not update the group'),
  addMembers: (id: string, user_ids: string[]) =>
    call<ChatGroup>(() => api.post(`/chat/groups/${id}/members`, { user_ids }), 'Could not add people'),
  removeMember: (id: string, userId: string) =>
    call<ChatGroup | null>(() => api.delete(`/chat/groups/${id}/members/${userId}`), 'Could not remove that person'),
  deleteGroup: (id: string) => call<void>(() => api.delete(`/chat/groups/${id}`), 'Could not delete the group'),

  messages: (id: string, opts: { before?: string; after?: string; around?: string } = {}) =>
    call<MessagePage>(() => api.get(`/chat/groups/${id}/messages`, { params: { ...opts, limit: 30 } }), 'Could not load messages'),
  send: (id: string, input: SendInput) =>
    call<ChatMessage>(() => api.post(`/chat/groups/${id}/messages`, input), 'Could not send the message'),
  markRead: (id: string) => call<{ unread_count: number }>(() => api.post(`/chat/groups/${id}/read`), 'Could not mark as read'),
  react: (messageId: string, emoji: string) =>
    call<ChatMessage>(() => api.put(`/chat/messages/${messageId}/reactions`, { emoji }), 'Could not react'),
  deleteMessage: (messageId: string, scope: 'me' | 'everyone') =>
    call<void>(() => api.delete(`/chat/messages/${messageId}`, { params: { scope } }), 'Could not delete the message'),
  forward: (messageId: string, group_ids: string[]) =>
    call<ChatMessage[]>(() => api.post(`/chat/messages/${messageId}/forward`, { group_ids }), 'Could not forward the message'),

  // Search, shared tabs, pins
  search: (params: SearchParams) => call<{ items: SearchHit[]; has_more: boolean }>(() => api.get('/chat/search', { params }), 'Search failed'),
  shared: (id: string, kind: 'media' | 'docs', before?: string) =>
    call<SharedPage>(() => api.get(`/chat/groups/${id}/shared`, { params: { kind, before } }), 'Could not load the files'),
  links: (id: string, before?: string) => call<LinkPage>(() => api.get(`/chat/groups/${id}/links`, { params: { before } }), 'Could not load the links'),
  pins: (id: string) => call<Pin[]>(() => api.get(`/chat/groups/${id}/pins`), 'Could not load pinned messages'),
  pin: (messageId: string) => call<ChatMessage>(() => api.put(`/chat/messages/${messageId}/pin`), 'Could not pin the message'),
  unpin: (messageId: string) => call<void>(() => api.delete(`/chat/messages/${messageId}/pin`), 'Could not unpin the message'),

  // Scheduled messages
  scheduled: (groupId: string) => call<Scheduled[]>(() => api.get(`/chat/groups/${groupId}/scheduled`), 'Could not load scheduled messages'),
  schedule: (groupId: string, input: { body: string; file_ids: string[]; send_at: string }) =>
    call<Scheduled>(() => api.post(`/chat/groups/${groupId}/scheduled`, input), 'Could not schedule the message'),
  editScheduled: (id: string, patch: { body?: string; file_ids?: string[]; send_at?: string }) =>
    call<Scheduled>(() => api.patch(`/chat/scheduled/${id}`, patch), 'Could not update the scheduled message'),
  cancelScheduled: (id: string) => call<void>(() => api.delete(`/chat/scheduled/${id}`), 'Could not cancel the scheduled message'),

  // Client invite links
  invites: (groupId: string) => call<Invite[]>(() => api.get(`/chat/groups/${groupId}/invites`), 'Could not load the invite links'),
  createInvite: (groupId: string) => call<Invite>(() => api.post(`/chat/groups/${groupId}/invites`), 'Could not create the invite link'),
  revokeInvite: (inviteId: string) => call<void>(() => api.delete(`/chat/invites/${inviteId}`), 'Could not revoke the link'),

  // Approvals
  requestApproval: (
    groupId: string,
    input: { question: string; file_ids: string[]; approve_label: string; reject_label: string }
  ) => call<ChatMessage>(() => api.post(`/chat/groups/${groupId}/approvals`, input), 'Could not send the approval request'),
  answerApproval: (approvalId: string, decision: 'approved' | 'rejected', reason?: string) =>
    call<ChatMessage>(() => api.post(`/chat/approvals/${approvalId}/answer`, { decision, reason }), 'Could not send your answer'),
  approvals: (status: 'pending' | 'all' = 'pending') =>
    call<ApprovalItem[]>(() => api.get('/chat/approvals', { params: { status } }), 'Could not load approvals')
};
