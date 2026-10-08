import type { IChatService } from '../interfaces';
import type { ChatRoom, Message, AttachedFile, Project, User, ClientInvite } from '../../types';

export class SupabaseChatService implements IChatService {
  async getChatRooms(_userId: string): Promise<ChatRoom[]> {
    throw new Error('Supabase integration not configured.');
  }
  async getMessages(_roomId: string): Promise<Message[]> {
    throw new Error('Supabase integration not configured.');
  }
  async sendMessage(
    _roomId: string,
    _senderId: string,
    _content: string,
    _replyToId?: string,
    _attachments?: AttachedFile[],
    _mentions?: string[]
  ): Promise<Message> {
    throw new Error('Supabase integration not configured.');
  }
  async createChatRoom(
    _name: string,
    _type: 'direct' | 'group' | 'project' | 'client',
    _participantIds: string[],
    _projectId?: string
  ): Promise<ChatRoom> {
    throw new Error('Supabase integration not configured.');
  }
  subscribe(_roomId: string, _callback: () => void): () => void {
    return () => {};
  }
  async markMessagesSeen(_roomId: string, _userId: string): Promise<void> {
    throw new Error('Supabase integration not configured.');
  }
  async syncProjectRooms(_projects: Project[]): Promise<void> {
    throw new Error('Supabase integration not configured.');
  }
  async addClientRoom(
    _projectId: string,
    _clientName: string,
    _company: string,
    _phone: string
  ): Promise<{ room: ChatRoom; inviteCode: string }> {
    throw new Error('Supabase integration not configured.');
  }
  async getInviteByCode(_code: string): Promise<{ invite: ClientInvite; project: Project } | null> {
    throw new Error('Supabase integration not configured.');
  }
  async verifyClientOTP(_code: string, _phone: string, _otp: string): Promise<{ user: User; room: ChatRoom }> {
    throw new Error('Supabase integration not configured.');
  }
  async revokeClientAccess(_roomId: string): Promise<void> {
    throw new Error('Supabase integration not configured.');
  }
}

export const supabaseChatService = new SupabaseChatService();
