import type { IChatService } from '../interfaces';
import type { ChatRoom, Message, AttachedFile, Project, User, ClientInvite } from '../../types';
import { getStoredData, setStoredData, KEYS, delay } from './storage';
import { generateId } from '../../utils/ids';
import { getNowISO } from '../../utils/time';
import { mockNotificationService } from './notificationService';

type ChatCallback = () => void;

export class MockChatService implements IChatService {
  private listeners: Map<string, Set<ChatCallback>> = new Map();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === KEYS.MESSAGES || e.key === KEYS.CHAT_ROOMS) {
          this.notifyAll();
        }
      });
      window.addEventListener('tm_chat_update', () => {
        this.notifyAll();
      });
    }
  }

  subscribe(roomId: string, callback: ChatCallback): () => void {
    if (!this.listeners.has(roomId)) {
      this.listeners.set(roomId, new Set());
    }
    const roomSet = this.listeners.get(roomId)!;
    roomSet.add(callback);

    // Also add to global '*' room listener
    if (!this.listeners.has('*')) {
      this.listeners.set('*', new Set());
    }
    this.listeners.get('*')!.add(callback);

    return () => {
      roomSet.delete(callback);
      this.listeners.get('*')?.delete(callback);
    };
  }

  private notifyAll() {
    this.listeners.forEach((set) => {
      set.forEach((cb) => cb());
    });
  }

  async syncProjectRooms(projects: Project[]): Promise<void> {
    const rooms = getStoredData<ChatRoom[]>(KEYS.CHAT_ROOMS);
    let updated = false;

    for (const prj of projects) {
      const existing = rooms.find((r) => r.type === 'project' && r.projectId === prj.id);
      const members = prj.memberIds || prj.assignedUserIds || [];

      if (!existing) {
        const newRoom: ChatRoom = {
          id: `room_prj_${prj.id}`,
          name: `${prj.name} Team`,
          type: 'project',
          projectId: prj.id,
          participantIds: Array.from(new Set(['usr_1', 'usr_ceo', ...members])),
          updatedAt: getNowISO()
        };
        rooms.push(newRoom);
        updated = true;
      } else {
        // Sync members
        const mergedMembers = Array.from(new Set([...existing.participantIds, ...members]));
        if (mergedMembers.length !== existing.participantIds.length) {
          existing.participantIds = mergedMembers;
          updated = true;
        }
      }
    }

    if (updated) {
      setStoredData(KEYS.CHAT_ROOMS, rooms);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('tm_chat_update'));
      }
    }
  }

  async syncEveryoneRoom(): Promise<void> {
    const rooms = getStoredData<ChatRoom[]>(KEYS.CHAT_ROOMS);
    const users = getStoredData<User[]>(KEYS.USERS);
    const activeEmployeeIds = users.filter((u) => u.role !== 'client' && u.active).map((u) => u.id);

    let everyoneRoom = rooms.find((r) => r.id === 'room_everyone' || (r.name && r.name.toLowerCase() === 'everyone'));
    let updated = false;

    if (!everyoneRoom) {
      everyoneRoom = {
        id: 'room_everyone',
        name: 'Everyone',
        type: 'group',
        participantIds: activeEmployeeIds,
        updatedAt: getNowISO(),
        lastMessage: 'Welcome to the Everyone team chat!'
      };
      rooms.unshift(everyoneRoom);
      updated = true;
    } else {
      if (
        everyoneRoom.participantIds.length !== activeEmployeeIds.length ||
        !everyoneRoom.participantIds.every((id) => activeEmployeeIds.includes(id))
      ) {
        everyoneRoom.participantIds = activeEmployeeIds;
        updated = true;
      }
    }

    if (updated) {
      setStoredData(KEYS.CHAT_ROOMS, rooms);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('tm_chat_update'));
      }
    }
  }

  async getChatRooms(userId: string): Promise<ChatRoom[]> {
    await delay(50);
    const projects = getStoredData<Project[]>(KEYS.PROJECTS);
    await this.syncProjectRooms(projects);
    await this.syncEveryoneRoom();

    const rooms = getStoredData<ChatRoom[]>(KEYS.CHAT_ROOMS);
    return rooms.filter((r) => {
      if (r.revoked) return false;
      return r.participantIds.includes(userId);
    }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getMessages(roomId: string): Promise<Message[]> {
    await delay(50);
    const messages = getStoredData<Message[]>(KEYS.MESSAGES);
    return messages.filter((m) => m.roomId === roomId);
  }

  async sendMessage(
    roomId: string,
    senderId: string,
    content: string,
    replyToId?: string,
    attachments?: AttachedFile[],
    mentions?: string[]
  ): Promise<Message> {
    await delay(80);
    const messages = getStoredData<Message[]>(KEYS.MESSAGES);
    const rooms = getStoredData<ChatRoom[]>(KEYS.CHAT_ROOMS);

    const replyMsg = replyToId ? messages.find((m) => m.id === replyToId) : undefined;
    const nowISO = getNowISO();

    const newMessage: Message = {
      id: generateId('msg'),
      roomId,
      senderId,
      content,
      timestamp: nowISO,
      replyToId,
      replyToContent: replyMsg?.content,
      replyToSenderId: replyMsg?.senderId,
      attachments: attachments || [],
      mentions: mentions || [],
      seenBy: [senderId]
    };

    messages.push(newMessage);
    setStoredData(KEYS.MESSAGES, messages);

    const roomIndex = rooms.findIndex((r) => r.id === roomId);
    if (roomIndex !== -1) {
      rooms[roomIndex].lastMessage = content || (attachments?.length ? '[Attachment]' : 'Message');
      rooms[roomIndex].updatedAt = nowISO;
      setStoredData(KEYS.CHAT_ROOMS, rooms);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('tm_chat_update'));
    }

    return newMessage;
  }

  async createChatRoom(
    name: string,
    type: 'direct' | 'group' | 'project' | 'client',
    participantIds: string[],
    projectId?: string,
    createdByUserId?: string
  ): Promise<ChatRoom> {
    await delay(100);
    const rooms = getStoredData<ChatRoom[]>(KEYS.CHAT_ROOMS);

    // If direct chat between 2 users already exists, return it!
    if (type === 'direct' && participantIds.length === 2) {
      const existing = rooms.find(
        (r) => r.type === 'direct' &&
          r.participantIds.length === 2 &&
          r.participantIds.includes(participantIds[0]) &&
          r.participantIds.includes(participantIds[1])
      );
      if (existing) return existing;
    }

    const newRoom: ChatRoom = {
      id: generateId('room'),
      name,
      type,
      participantIds,
      projectId,
      updatedAt: getNowISO()
    };

    rooms.push(newRoom);
    setStoredData(KEYS.CHAT_ROOMS, rooms);

    // Notify everyone who was added to a new group chat (except its creator).
    if (type === 'group') {
      for (const participantId of participantIds) {
        if (participantId === createdByUserId) continue;
        mockNotificationService
          .addNotification(participantId, {
            type: 'group_added',
            title: 'Added to a group chat',
            message: `You were added to ${name}`,
            link: '/app/chat'
          })
          .catch(console.error);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('tm_chat_update'));
    }

    return newRoom;
  }

  async markMessagesSeen(roomId: string, userId: string): Promise<void> {
    await delay(50);
    const messages = getStoredData<Message[]>(KEYS.MESSAGES);
    let updated = false;

    messages.forEach((m) => {
      if (m.roomId === roomId) {
        if (!m.seenBy) m.seenBy = [m.senderId];
        if (!m.seenBy.includes(userId)) {
          m.seenBy.push(userId);
          updated = true;
        }
      }
    });

    if (updated) {
      setStoredData(KEYS.MESSAGES, messages);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('tm_chat_update'));
      }
    }
  }

  async addClientRoom(
    projectId: string,
    clientName: string,
    company: string,
    phone: string
  ): Promise<{ room: ChatRoom; inviteCode: string }> {
    await delay(100);
    const rooms = getStoredData<ChatRoom[]>(KEYS.CHAT_ROOMS);
    const invites = getStoredData<ClientInvite[]>(KEYS.CLIENT_INVITES);
    const projects = getStoredData<Project[]>(KEYS.PROJECTS);

    const project = projects.find((p) => p.id === projectId);
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const newInvite: ClientInvite = {
      code,
      projectId,
      clientName,
      company,
      phone,
      otp: Math.floor(100000 + Math.random() * 900000).toString(),
      createdAt: getNowISO()
    };

    invites.push(newInvite);
    setStoredData(KEYS.CLIENT_INVITES, invites);

    const newRoom: ChatRoom = {
      id: `room_client_${code}`,
      name: `${clientName} (${project?.name || 'Client Portal'})`,
      type: 'client',
      projectId,
      participantIds: ['usr_1', 'usr_ceo'],
      inviteCode: code,
      clientPhone: phone,
      clientName,
      revoked: false,
      updatedAt: getNowISO()
    };

    rooms.push(newRoom);
    setStoredData(KEYS.CHAT_ROOMS, rooms);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('tm_chat_update'));
    }

    return { room: newRoom, inviteCode: code };
  }

  async getInviteByCode(code: string): Promise<{ invite: ClientInvite; project: Project } | null> {
    await delay(50);
    const invites = getStoredData<ClientInvite[]>(KEYS.CLIENT_INVITES);
    const projects = getStoredData<Project[]>(KEYS.PROJECTS);

    const invite = invites.find((i) => i.code === code);
    if (!invite) return null;

    const project = projects.find((p) => p.id === invite.projectId);
    if (!project) return null;

    return { invite, project };
  }

  async verifyClientOTP(code: string, phone: string, _otp: string): Promise<{ user: User; room: ChatRoom }> {
    await delay(100);
    const invites = getStoredData<ClientInvite[]>(KEYS.CLIENT_INVITES);
    const rooms = getStoredData<ChatRoom[]>(KEYS.CHAT_ROOMS);
    const users = getStoredData<User[]>(KEYS.USERS);

    const invite = invites.find((i) => i.code === code);
    if (!invite) throw new Error('Invalid invite link or code.');

    const room = rooms.find((r) => r.inviteCode === code);
    if (!room || room.revoked) throw new Error('Client access has been revoked or room not found.');

    // Find or create client user
    let clientUser = users.find((u) => u.loginId === phone || u.loginId === `client_${invite.phone}`);
    if (!clientUser) {
      clientUser = {
        id: generateId('client'),
        name: invite.clientName,
        jobTitle: 'Client Representative',
        company: (invite.company as any) || 'piixel',
        role: 'client',
        loginId: phone,
        active: true
      };
      users.push(clientUser);
      setStoredData(KEYS.USERS, users);
    }

    // Add client user to room participants
    if (!room.participantIds.includes(clientUser.id)) {
      room.participantIds.push(clientUser.id);
      setStoredData(KEYS.CHAT_ROOMS, rooms);
    }

    // Set current user session
    setStoredData(KEYS.CURRENT_USER, clientUser);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('tm_chat_update'));
    }

    return { user: clientUser, room };
  }

  async revokeClientAccess(roomId: string): Promise<void> {
    await delay(100);
    const rooms = getStoredData<ChatRoom[]>(KEYS.CHAT_ROOMS);
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
      room.revoked = true;
      setStoredData(KEYS.CHAT_ROOMS, rooms);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('tm_chat_update'));
      }
    }
  }
}

export const mockChatService = new MockChatService();
