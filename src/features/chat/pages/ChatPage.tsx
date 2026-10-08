import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Search,
  Plus,
  Send,
  Paperclip,
  Reply,
  CheckCheck,
  ArrowLeft,
  Users,
  Building2,
  CheckSquare,
  X,
  FileCheck,
  MessageSquare
} from 'lucide-react';
import { chatService, userService, projectService, taskService } from '../../../services';
import type { ChatRoom, Message, User, Project, AttachedFile } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { UserName } from '../../../components/ui/UserName';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { EmptyState } from '../../../components/ui/EmptyState';
import { formatTime, getTodayDateString } from '../../../utils/time';

export const ChatPage: React.FC = () => {
  const { user } = useAuthStore();
  const { showToast } = useAppStore();

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState<'all' | 'direct' | 'group' | 'project' | 'client'>('all');
  const [showMobileConversation, setShowMobileConversation] = useState(false);

  // Message Input & Reply state
  const [messageText, setMessageText] = useState('');
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);

  // Mentions autocomplete popup
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  // Modal controls
  const [isNewDirectModalOpen, setIsNewDirectModalOpen] = useState(false);
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<string[]>([]);

  // "Make task from message" modal state
  const [taskFromMsg, setTaskFromMsg] = useState<Message | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskProjectId, setTaskProjectId] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskAssignedUserId, setTaskAssignedUserId] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchInitialData = async () => {
    if (!user) return;
    const [uList, pList] = await Promise.all([
      userService.getUsers(),
      projectService.getProjects()
    ]);
    setAllUsers(uList);
    setProjects(pList);

    const rList = await chatService.getChatRooms(user.id);
    setRooms(rList);
    if (rList.length > 0 && !activeRoomId) {
      setActiveRoomId(rList[0].id);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, [user]);

  // Realtime subscription for current active room & global updates
  useEffect(() => {
    if (!user) return;
    const unsubscribe = chatService.subscribe(activeRoomId || '*', async () => {
      const updatedRooms = await chatService.getChatRooms(user.id);
      setRooms(updatedRooms);
      if (activeRoomId) {
        const msgs = await chatService.getMessages(activeRoomId);
        setMessages(msgs);
        await chatService.markMessagesSeen(activeRoomId, user.id);
      }
    });
    return () => unsubscribe();
  }, [activeRoomId, user]);

  // Fetch messages when active room changes
  useEffect(() => {
    if (activeRoomId && user) {
      chatService.getMessages(activeRoomId).then((msgs) => {
        setMessages(msgs);
        chatService.markMessagesSeen(activeRoomId, user.id);
      });
    }
  }, [activeRoomId, user]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  // Filtered rooms list
  const filteredRooms = rooms.filter((r) => {
    const matchesFilter = roomFilter === 'all' ? true : r.type === roomFilter;
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Handle Text Change & @Mentions Autocomplete
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMessageText(val);

    const lastAtPos = val.lastIndexOf('@');
    if (lastAtPos !== -1 && (lastAtPos === 0 || val[lastAtPos - 1] === ' ')) {
      const q = val.substring(lastAtPos + 1).toLowerCase();
      setMentionQuery(q);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (u: User) => {
    if (mentionQuery === null) return;
    const lastAtPos = messageText.lastIndexOf('@');
    const prefix = messageText.substring(0, lastAtPos);
    setMessageText(`${prefix}@${u.name} `);
    setMentionQuery(null);
  };

  const handleFileAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArr = Array.from(e.target.files);

    filesArr.forEach((file) => {
      const isImage = file.type.startsWith('image/');
      if (isImage) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setAttachments((prev) => [
            ...prev,
            {
              id: Math.random().toString(36).substring(7),
              name: file.name,
              size: file.size,
              type: file.type,
              dataUrl: event.target?.result as string
            }
          ]);
        };
        reader.readAsDataURL(file);
      } else {
        setAttachments((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(7),
            name: file.name,
            size: file.size,
            type: file.type
          }
        ]);
      }
    });

    e.target.value = '';
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoomId || !user) return;
    if (!messageText.trim() && attachments.length === 0) return;

    // Detect mentioned users
    const mentionedUserIds = allUsers
      .filter((u) => messageText.includes(`@${u.name}`))
      .map((u) => u.id);

    try {
      await chatService.sendMessage(
        activeRoomId,
        user.id,
        messageText,
        replyToMessage?.id,
        attachments,
        mentionedUserIds
      );
      setMessageText('');
      setAttachments([]);
      setReplyToMessage(null);
      setMentionQuery(null);

      const msgs = await chatService.getMessages(activeRoomId);
      setMessages(msgs);
    } catch (err: any) {
      showToast(err.message || 'Failed to send message');
    }
  };

  // Create Direct Chat
  const handleStartDirectChat = async (targetUser: User) => {
    if (!user) return;
    try {
      const room = await chatService.createChatRoom(
        targetUser.name,
        'direct',
        [user.id, targetUser.id]
      );
      setIsNewDirectModalOpen(false);
      const rList = await chatService.getChatRooms(user.id);
      setRooms(rList);
      setActiveRoomId(room.id);
      setShowMobileConversation(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to start direct chat');
    }
  };

  // Create Group Chat
  const handleCreateGroupChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newGroupName.trim()) return;

    try {
      const memberIds = Array.from(new Set([user.id, ...selectedGroupMemberIds]));
      const room = await chatService.createChatRoom(
        newGroupName,
        'group',
        memberIds
      );
      setIsNewGroupModalOpen(false);
      setNewGroupName('');
      setSelectedGroupMemberIds([]);

      const rList = await chatService.getChatRooms(user.id);
      setRooms(rList);
      setActiveRoomId(room.id);
      setShowMobileConversation(true);
      showToast('Group chat created!');
    } catch (err: any) {
      showToast(err.message || 'Failed to create group');
    }
  };

  // "Make task from this" message handler
  const handleOpenMakeTaskModal = (msg: Message) => {
    setTaskFromMsg(msg);
    setTaskTitle(msg.content.slice(0, 80));
    setTaskDescription(msg.content);
    if (activeRoom?.projectId) {
      setTaskProjectId(activeRoom.projectId);
    } else if (projects.length > 0) {
      setTaskProjectId(projects[0].id);
    }
    setTaskAssignedUserId(user?.id || '');
  };

  const handleCreateTaskFromMsg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskProjectId || !taskTitle) return;

    try {
      await taskService.createTask({
        projectId: taskProjectId,
        title: taskTitle,
        description: taskDescription,
        status: 'todo',
        priority: taskPriority,
        startDate: getTodayDateString(),
        assignedUserId: taskAssignedUserId || user?.id || 'usr_1',
        assignedByUserId: user?.id,
        estimatedHours: 8
      });
      showToast('Task created from message!');
      setTaskFromMsg(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to create task');
    }
  };

  const activeProject = projects.find((p) => p.id === taskProjectId);
  const activeProjectMembers = allUsers.filter((u) => activeProject?.memberIds.includes(u.id));
  const mentionCandidates = mentionQuery !== null
    ? allUsers.filter((u) => u.name.toLowerCase().includes(mentionQuery))
    : [];

  return (
    <div className="h-[calc(100vh-8.5rem)] rounded-[var(--tm-radius-xl)] border border-[var(--tm-border)] bg-[var(--tm-card)] shadow-soft flex overflow-hidden">
      {/* LEFT PANEL: Room List */}
      <div
        className={`w-full lg:w-80 border-r border-[var(--tm-border)] flex flex-col bg-[var(--tm-card-muted)] ${
          showMobileConversation ? 'hidden lg:flex' : 'flex'
        }`}
      >
        {/* Left Header & Actions */}
        <div className="p-4 border-b border-[var(--tm-border)] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-[var(--tm-ink)] text-base">Team Chat</h2>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsNewDirectModalOpen(true)}
                title="New Direct Message"
              >
                + DM
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsNewGroupModalOpen(true)}
                title="New Group Chat"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Group
              </Button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--tm-ink-muted)] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search chats or members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-[var(--tm-border)] rounded-full text-xs text-[var(--tm-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--tm-primary-soft)] focus:border-[var(--tm-primary)]"
            />
          </div>

          {/* Room Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
            {(['all', 'direct', 'group', 'project', 'client'] as const).map((ft) => (
              <button
                key={ft}
                type="button"
                onClick={() => setRoomFilter(ft)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-full capitalize shrink-0 transition-all ${
                  roomFilter === ft
                    ? 'bg-[var(--tm-primary)] text-white'
                    : 'bg-white text-[var(--tm-ink-soft)] border border-[var(--tm-border)] hover:bg-[var(--tm-bg-sunken)]'
                }`}
              >
                {ft}
              </button>
            ))}
          </div>
        </div>

        {/* Room List Scrollable */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--tm-border)]">
          {filteredRooms.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<MessageSquare className="h-5 w-5 text-[var(--tm-primary)]" />}
                title="No conversations"
                description="Start a chat or change room filters."
              />
            </div>
          ) : (
            filteredRooms.map((room) => {
              const isActive = room.id === activeRoomId;
              const isDirect = room.type === 'direct';
              const isProject = room.type === 'project';
              const isClient = room.type === 'client';

              const otherUserId = isDirect
                ? room.participantIds.find((id) => id !== user?.id)
                : undefined;
              const directUser = otherUserId ? allUsers.find((u) => u.id === otherUserId) : undefined;

              return (
                <div
                  key={room.id}
                  onClick={() => {
                    setActiveRoomId(room.id);
                    setShowMobileConversation(true);
                  }}
                  className={`p-3.5 flex items-center gap-3 cursor-pointer transition-colors ${
                    isActive ? 'bg-[var(--tm-primary-softer)] border-l-4 border-[var(--tm-primary)]' : 'hover:bg-[var(--tm-bg-sunken)]'
                  }`}
                >
                  <div className="relative shrink-0">
                    {isDirect && directUser ? (
                      <UserName user={directUser} size="md" showBadge={false} />
                    ) : (
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                          isProject
                            ? 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary)]'
                            : isClient
                            ? 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]'
                            : 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary)]'
                        }`}
                      >
                        {isProject ? <Building2 className="w-5 h-5" /> : isClient ? 'C' : <Users className="w-5 h-5" />}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="font-bold text-[var(--tm-ink)] text-xs truncate">
                        {isDirect && directUser ? directUser.name : room.name}
                      </h4>
                      <span className="text-[10px] text-[var(--tm-ink-muted)] shrink-0">
                        {formatTime(room.updatedAt)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--tm-ink-muted)] truncate mt-0.5">
                      {room.lastMessage || 'No messages yet'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Active Conversation View */}
      <div
        className={`flex-1 flex-col bg-white ${
          showMobileConversation ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {activeRoom ? (
          <>
            {/* Conversation Header */}
            <div className="h-16 px-4 border-b border-[var(--tm-border)] flex items-center justify-between bg-[var(--tm-card-muted)] shrink-0">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowMobileConversation(false)}
                  className="lg:hidden text-[var(--tm-ink-muted)] hover:text-[var(--tm-ink)] p-1"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-[var(--tm-ink)] text-sm">{activeRoom.name}</h3>
                    <Badge variant={activeRoom.type === 'project' ? 'primary' : activeRoom.type === 'client' ? 'success' : 'default'} size="sm">
                      {activeRoom.type.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="text-[10.5px] font-semibold text-[var(--tm-ink-muted)] mt-0.5">
                    {activeRoom.participantIds.length} Participants
                  </div>
                </div>
              </div>
            </div>

            {/* Message Feed Scrollable with Smooth Animation */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[var(--tm-card-muted)]">
              {messages.length === 0 ? (
                <div className="py-12">
                  <EmptyState
                    icon={<MessageSquare className="h-6 w-6 text-[var(--tm-primary)]" />}
                    title="No messages in this chat yet"
                    description="Say hello or share a deliverable update with your team."
                  />
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === user?.id;
                  const sender = allUsers.find((u) => u.id === msg.senderId);

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      className={`flex flex-col group ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <div className="text-[10px] text-[var(--tm-ink-muted)] mb-1 flex items-center gap-1.5 px-1 font-semibold">
                        <span>{isMe ? 'You' : sender?.name || 'Member'}</span>
                        <span>•</span>
                        <span>{formatTime(msg.timestamp)}</span>
                      </div>

                      {/* Message Bubble — Rounded 2xl */}
                      <div
                        className={`relative max-w-lg p-3.5 rounded-2xl text-xs space-y-1.5 shadow-soft-xs ${
                          isMe
                            ? 'bg-[var(--tm-primary)] text-white rounded-br-sm'
                            : 'bg-white text-[var(--tm-ink)] border border-[var(--tm-border)] rounded-bl-sm'
                        }`}
                      >
                        {/* Quoted Reply */}
                        {msg.replyToContent && (
                          <div
                            className={`p-2 rounded-xl border-l-4 text-[11px] mb-1.5 ${
                              isMe
                                ? 'bg-white/15 border-white text-white/90'
                                : 'bg-[var(--tm-bg-sunken)] border-[var(--tm-primary)] text-[var(--tm-ink-soft)]'
                            }`}
                          >
                            <div className="font-bold text-[10px] opacity-85">Replying:</div>
                            <div className="truncate">"{msg.replyToContent}"</div>
                          </div>
                        )}

                        <p className="whitespace-pre-wrap leading-relaxed text-[13px]">{msg.content}</p>

                        {/* Attachments */}
                        {(msg.attachments || []).map((f, i) => (
                          <div
                            key={i}
                            className={`p-2 rounded-xl border text-xs flex items-center gap-2 ${
                              isMe ? 'bg-white/15 border-white/20' : 'bg-[var(--tm-card-muted)] border-[var(--tm-border)]'
                            }`}
                          >
                            {f.dataUrl ? (
                              <img
                                src={f.dataUrl}
                                alt={f.name}
                                className="w-12 h-12 object-cover rounded-lg border border-[var(--tm-border-strong)] shrink-0"
                              />
                            ) : (
                              <Paperclip className="w-4 h-4 shrink-0" />
                            )}
                            <span className="truncate font-semibold">{f.name}</span>
                          </div>
                        ))}

                        {/* Hover Actions (Reply & Make Task) */}
                        <div
                          className={`opacity-0 group-hover:opacity-100 transition-opacity absolute top-1 ${
                            isMe ? '-left-16' : '-right-16'
                          } flex items-center gap-1 bg-white border border-[var(--tm-border)] p-1 rounded-xl shadow-soft z-10`}
                        >
                          <button
                            type="button"
                            onClick={() => setReplyToMessage(msg)}
                            className="p-1 text-[var(--tm-ink-muted)] hover:text-[var(--tm-primary)] rounded"
                            title="Reply to message"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenMakeTaskModal(msg)}
                            className="p-1 text-[var(--tm-ink-muted)] hover:text-[var(--tm-success)] rounded"
                            title="Make task from this message"
                          >
                            <CheckSquare className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Seen Receipt Status */}
                        {isMe && (
                          <div className="flex justify-end pt-0.5">
                            <CheckCheck className="w-3.5 h-3.5 text-white/80" />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Preview Header */}
            {replyToMessage && (
              <div className="px-4 py-2 bg-[var(--tm-primary-softer)] border-t border-[var(--tm-primary-soft)] flex items-center justify-between text-xs text-[var(--tm-primary-dark)]">
                <div className="flex items-center gap-2 overflow-hidden">
                  <Reply className="w-4 h-4 text-[var(--tm-primary)] shrink-0" />
                  <span className="truncate">
                    Replying: <strong>"{replyToMessage.content}"</strong>
                  </span>
                </div>
                <button type="button" onClick={() => setReplyToMessage(null)} className="text-[var(--tm-ink-muted)] hover:text-[var(--tm-ink-soft)]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Mentions Autocomplete Popup */}
            {mentionCandidates.length > 0 && (
              <div className="px-4 py-2 bg-white border-t border-[var(--tm-border)] shadow-md flex flex-wrap gap-1.5 z-20">
                <div className="text-[10px] font-bold text-[var(--tm-ink-muted)] w-full uppercase">Mention Employee:</div>
                {mentionCandidates.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => insertMention(u)}
                    className="px-2.5 py-1 bg-[var(--tm-primary-softer)] hover:bg-[var(--tm-primary-soft)] text-[var(--tm-primary)] font-semibold rounded-full text-xs transition-colors"
                  >
                    @{u.name}
                  </button>
                ))}
              </div>
            )}

            {/* Input Bar */}
            <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-[var(--tm-border)] space-y-2">
              {attachments.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {attachments.map((f, i) => (
                    <span
                      key={i}
                      className="text-[11px] bg-[var(--tm-primary-softer)] text-[var(--tm-primary)] px-2.5 py-1 rounded-full border border-[var(--tm-primary-soft)] font-semibold"
                    >
                      {f.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <label className="p-2 text-[var(--tm-ink-muted)] hover:text-[var(--tm-primary)] cursor-pointer rounded-full hover:bg-[var(--tm-card-muted)] transition-colors">
                  <Paperclip className="w-5 h-5" />
                  <input type="file" multiple onChange={handleFileAttachment} className="hidden" />
                </label>

                <input
                  type="text"
                  placeholder="Type a message... (use @ to mention)"
                  value={messageText}
                  onChange={handleInputChange}
                  className="flex-1 text-xs border border-[var(--tm-border)] rounded-full px-4 py-2.5 text-[var(--tm-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--tm-primary-soft)] focus:border-[var(--tm-primary)]"
                />

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  leftIcon={<Send className="w-4 h-4" />}
                >
                  Send
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <EmptyState
              icon={<MessageSquare className="h-6 w-6 text-[var(--tm-primary)]" />}
              title="Select a conversation"
              description="Choose a chat from the left panel to start messaging."
            />
          </div>
        )}
      </div>

      {/* New Direct Chat Modal */}
      <Modal
        isOpen={isNewDirectModalOpen}
        onClose={() => setIsNewDirectModalOpen(false)}
        title="Start Direct Message"
      >
        <div className="space-y-3">
          <p className="text-xs text-[var(--tm-ink-muted)]">Select an active team member to chat 1-on-1:</p>
          <div className="divide-y divide-[var(--tm-border)] max-h-60 overflow-y-auto">
            {allUsers.filter((u) => u.id !== user?.id).map((u) => (
              <div
                key={u.id}
                onClick={() => handleStartDirectChat(u)}
                className="p-3 hover:bg-[var(--tm-card-muted)] flex items-center justify-between cursor-pointer rounded-xl transition-colors"
              >
                <UserName user={u} size="sm" showBadge={true} />
                <Button variant="secondary" size="sm">Chat</Button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* New Group Chat Modal */}
      <Modal
        isOpen={isNewGroupModalOpen}
        onClose={() => setIsNewGroupModalOpen(false)}
        title="Create Group Chat"
      >
        <form onSubmit={handleCreateGroupChat} className="space-y-4">
          <Input
            label="Group Chat Name"
            placeholder="e.g. Frontend Development Team"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            required
          />

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[var(--tm-ink-soft)] uppercase tracking-wider">
              Select Group Members
            </label>
            <div className="max-h-48 overflow-y-auto border border-[var(--tm-border)] rounded-xl p-3 space-y-2 bg-[var(--tm-card-muted)]">
              {allUsers.filter((u) => u.id !== user?.id).map((u) => {
                const isSelected = selectedGroupMemberIds.includes(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex items-center justify-between p-2 hover:bg-white rounded-lg cursor-pointer text-xs transition-colors"
                  >
                    <UserName user={u} size="sm" showBadge={false} />
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        if (isSelected) {
                          setSelectedGroupMemberIds((prev) => prev.filter((id) => id !== u.id));
                        } else {
                          setSelectedGroupMemberIds((prev) => [...prev, u.id]);
                        }
                      }}
                      className="w-4 h-4 text-[var(--tm-primary)] rounded"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--tm-border)]">
            <Button variant="outline" type="button" onClick={() => setIsNewGroupModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Create Group
            </Button>
          </div>
        </form>
      </Modal>

      {/* "Make task from message" Modal */}
      <Modal
        isOpen={!!taskFromMsg}
        onClose={() => setTaskFromMsg(null)}
        title="Make Task from Chat Message"
      >
        <form onSubmit={handleCreateTaskFromMsg} className="space-y-4">
          <Select
            label="Target Project"
            value={taskProjectId}
            onChange={(e) => setTaskProjectId(e.target.value)}
            options={projects.map((p) => ({
              value: p.id,
              label: `${p.name} (${p.company})`
            }))}
            required
          />

          <Input
            label="Task Name"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            required
          />

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[var(--tm-ink-soft)] uppercase tracking-wider">
              Description (Pre-filled from Message)
            </label>
            <textarea
              className="w-full text-sm rounded-lg border border-[var(--tm-border-strong)] p-3 text-[var(--tm-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--tm-primary-soft)] focus:border-[var(--tm-primary)]"
              rows={3}
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Priority"
              value={taskPriority}
              onChange={(e) => setTaskPriority(e.target.value as any)}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Mid' },
                { value: 'high', label: 'High' }
              ]}
            />

            <Select
              label="Assign To"
              value={taskAssignedUserId}
              onChange={(e) => setTaskAssignedUserId(e.target.value)}
              options={activeProjectMembers.map((m) => ({
                value: m.id,
                label: m.id === user?.id ? `${m.name} (Self)` : m.name
              }))}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--tm-border)]">
            <Button variant="outline" type="button" onClick={() => setTaskFromMsg(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" leftIcon={<FileCheck className="w-4 h-4" />}>
              Create Task
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
