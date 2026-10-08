import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  Paperclip,
  CheckSquare,
  Send,
  Upload,
  Calendar,
  ExternalLink,
  ShieldAlert,
  Users
} from 'lucide-react';
import { chatService, projectService, taskService, userService } from '../../../services';
import type { ChatRoom, Message, Project, Task, AttachedFile, User } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { formatDate, formatTime } from '../../../utils/time';

export const ClientPortalPage: React.FC = () => {
  const { user } = useAuthStore();
  const { showToast } = useAppStore();

  const [activeTab, setActiveTab] = useState<'chat' | 'files' | 'progress'>('chat');
  const [clientRoom, setClientRoom] = useState<ChatRoom | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  const [messageInput, setMessageInput] = useState('');
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);

  const fetchClientData = async () => {
    if (!user) return;
    const [rooms, prjList, tskList, uList] = await Promise.all([
      chatService.getChatRooms(user.id),
      projectService.getProjects(),
      taskService.getTasks(),
      userService.getUsers()
    ]);

    setAllUsers(uList);
    const room = rooms.find((r) => r.type === 'client' && r.participantIds.includes(user.id));
    if (room) {
      setClientRoom(room);
      const prj = prjList.find((p) => p.id === room.projectId);
      setProject(prj || null);

      if (room.projectId) {
        const prjTasks = tskList.filter((t) => t.projectId === room.projectId);
        setTasks(prjTasks);
      }

      const msgList = await chatService.getMessages(room.id);
      setMessages(msgList);
    }
  };

  useEffect(() => {
    fetchClientData();
  }, [user]);

  // Realtime subscription for chat messages
  useEffect(() => {
    if (!clientRoom) return;
    const unsubscribe = chatService.subscribe(clientRoom.id, async () => {
      const updatedMsgs = await chatService.getMessages(clientRoom.id);
      setMessages(updatedMsgs);
    });
    return () => unsubscribe();
  }, [clientRoom?.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientRoom || !user) return;
    if (!messageInput.trim() && attachments.length === 0) return;

    try {
      await chatService.sendMessage(
        clientRoom.id,
        user.id,
        messageInput,
        undefined,
        attachments
      );
      setMessageInput('');
      setAttachments([]);
      const msgs = await chatService.getMessages(clientRoom.id);
      setMessages(msgs);
    } catch (err: any) {
      showToast(err.message || 'Failed to send message');
    }
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

  if (!clientRoom) {
    return (
      <div className="p-12 text-center text-[var(--tm-ink-muted)] bg-white rounded-2xl border border-[var(--tm-border)]">
        <ShieldAlert className="w-8 h-8 text-[var(--tm-warning)] mx-auto mb-2" />
        <h3 className="text-base font-bold text-[var(--tm-ink)]">No Active Client Room Found</h3>
        <p className="text-[14px] leading-relaxed text-[var(--tm-ink-muted)] mt-1.5">Please ask your project administrator for a valid join invite code.</p>
      </div>
    );
  }

  // Calculate Shared Deliverable Files from Chat & Submissions
  const sharedFiles: { name: string; size: number; url?: string; dataUrl?: string; source: string; date: string }[] = [];
  messages.forEach((m) => {
    (m.attachments || []).forEach((att) => {
      sharedFiles.push({
        name: att.name,
        size: att.size,
        dataUrl: att.dataUrl,
        url: att.url,
        source: 'Chat Attachment',
        date: m.timestamp
      });
    });
  });

  tasks.forEach((t) => {
    t.submissions.forEach((sub) => {
      (sub.files || []).forEach((f) => {
        sharedFiles.push({
          name: f.name,
          size: f.size,
          dataUrl: f.dataUrl,
          url: f.url,
          source: `Deliverable: ${t.title}`,
          date: sub.submittedAt
        });
      });
    });
  });

  // Calculate Progress Metrics
  const completedTasksCount = tasks.filter((t) => t.status === 'completed').length;
  const progressPercent = tasks.length > 0 ? Math.round((completedTasksCount / tasks.length) * 100) : 0;
  const upcomingDeadlines = tasks
    .filter((t) => t.status !== 'completed' && t.dueDate)
    .sort((a, b) => (a.dueDate! > b.dueDate! ? 1 : -1));
  const nextDueDate = upcomingDeadlines[0]?.dueDate;

  return (
    <div className="space-y-6">
      {/* Client Header Overview */}
      <div className="bg-white p-6 rounded-2xl border border-[var(--tm-border)] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {project && (
              <Badge variant={project.company === 'piixel' ? 'piixel' : 'unwork'}>
                {project.company}
              </Badge>
            )}
            <Badge variant="success">CLIENT PORTAL ACTIVE</Badge>
          </div>
          <h1 className="text-2xl font-bold text-[var(--tm-ink)]">{clientRoom.name}</h1>
          <p className="text-[14px] leading-relaxed text-[var(--tm-ink-muted)] mt-1.5 max-w-xl">{project?.description}</p>
        </div>

        {/* Portal Tabs */}
        <div className="flex items-center gap-1.5 bg-[var(--tm-bg-sunken)] p-1.5 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'chat'
                ? 'bg-white text-[var(--tm-primary)] shadow-xs'
                : 'text-[var(--tm-ink-soft)] hover:text-[var(--tm-ink)]'
            }`}
          >
            <MessageSquare className="w-4 h-4" /> Team Chat
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'files'
                ? 'bg-white text-[var(--tm-primary)] shadow-xs'
                : 'text-[var(--tm-ink-soft)] hover:text-[var(--tm-ink)]'
            }`}
          >
            <Paperclip className="w-4 h-4" /> Shared Files ({sharedFiles.length})
          </button>
          <button
            onClick={() => setActiveTab('progress')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'progress'
                ? 'bg-white text-[var(--tm-primary)] shadow-xs'
                : 'text-[var(--tm-ink-soft)] hover:text-[var(--tm-ink)]'
            }`}
          >
            <CheckSquare className="w-4 h-4" /> Project Progress
          </button>
        </div>
      </div>

      {/* TAB 1: Chat Panel */}
      {activeTab === 'chat' && (
        <Card className="h-[600px] flex flex-col overflow-hidden">
          <CardHeader className="p-4 border-b border-[var(--tm-border)] bg-[var(--tm-card-muted)] flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--tm-primary-soft)] text-[var(--tm-primary)] flex items-center justify-center font-bold">
                C
              </div>
              <div>
                <CardTitle className="text-sm font-bold">{clientRoom.name}</CardTitle>
                <div className="text-[10px] text-[var(--tm-ink-muted)]">
                  {clientRoom.participantIds.length} Team Members connected
                </div>
              </div>
            </div>
          </CardHeader>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[var(--tm-card-muted)]">
            {messages.length === 0 ? (
              <div className="text-center text-[var(--tm-ink-muted)] text-xs py-12">
                No messages yet. Send a greeting to connect with the project team!
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.senderId === user?.id;
                const sender = allUsers.find((u) => u.id === msg.senderId);

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div className="text-[10px] text-[var(--tm-ink-muted)] mb-1 flex items-center gap-1.5 px-1">
                      <span>{isMe ? 'You' : sender?.name || 'Team Member'}</span>
                      <span>•</span>
                      <span>{formatTime(msg.timestamp)}</span>
                    </div>

                    <div
                      className={`max-w-md p-3.5 rounded-2xl text-xs space-y-2 shadow-2xs ${
                        isMe
                          ? 'bg-[var(--tm-primary)] text-white rounded-br-xs'
                          : 'bg-white text-[var(--tm-ink)] border border-[var(--tm-border)] rounded-bl-xs'
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                      {/* Attachments */}
                      {(msg.attachments || []).map((f, i) => (
                        <div
                          key={i}
                          className={`p-2 rounded-lg border text-xs flex items-center gap-2 ${
                            isMe ? 'bg-[var(--tm-primary)] border-[var(--tm-primary)]' : 'bg-[var(--tm-card-muted)] border-[var(--tm-border)]'
                          }`}
                        >
                          {f.dataUrl ? (
                            <img
                              src={f.dataUrl}
                              alt={f.name}
                              className="w-12 h-12 object-cover rounded border border-[var(--tm-border-strong)]"
                            />
                          ) : (
                            <Paperclip className="w-4 h-4 shrink-0" />
                          )}
                          <span className="truncate font-semibold">{f.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Message Input Bar */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 bg-white border-t border-[var(--tm-border)] flex flex-col gap-2"
          >
            {attachments.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap pb-1">
                {attachments.map((f, i) => (
                  <span
                    key={i}
                    className="text-[11px] bg-[var(--tm-primary-softer)] text-[var(--tm-primary)] px-2 py-0.5 rounded-md border border-[var(--tm-primary-soft)]"
                  >
                    {f.name}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="p-2 text-[var(--tm-ink-muted)] hover:text-[var(--tm-primary)] cursor-pointer rounded-lg hover:bg-[var(--tm-card-muted)]">
                <Upload className="w-5 h-5" />
                <input type="file" multiple onChange={handleFileAttachment} className="hidden" />
              </label>

              <Input
                placeholder="Type a message to project team..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                className="flex-1"
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
        </Card>
      )}

      {/* TAB 2: Shared Files List */}
      {activeTab === 'files' && (
        <Card>
          <CardHeader>
            <CardTitle>Project Deliverables & Shared Documents</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[var(--tm-border)]">
              {sharedFiles.length === 0 ? (
                <div className="p-12 text-center text-[var(--tm-ink-muted)] text-xs">
                  No shared files recorded for this project yet.
                </div>
              ) : (
                sharedFiles.map((file, i) => (
                  <div key={i} className="p-4 flex items-center justify-between hover:bg-[var(--tm-card-muted)]">
                    <div className="flex items-center gap-3">
                      {file.dataUrl ? (
                        <img
                          src={file.dataUrl}
                          alt={file.name}
                          className="w-10 h-10 object-cover rounded-lg border border-[var(--tm-border)]"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[var(--tm-primary-softer)] text-[var(--tm-primary)] flex items-center justify-center">
                          <Paperclip className="w-5 h-5" />
                        </div>
                      )}

                      <div>
                        <div className="font-bold text-[var(--tm-ink)] text-sm">{file.name}</div>
                        <div className="text-[10px] text-[var(--tm-ink-muted)]">
                          {(file.size / 1024).toFixed(1)} KB • {file.source}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-[var(--tm-ink-muted)]">{formatDate(file.date)}</div>
                      {file.url && (
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-[var(--tm-primary)] hover:underline flex items-center gap-1 mt-0.5 justify-end"
                        >
                          <ExternalLink className="w-3 h-3" /> View Link
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 3: Simple Progress View */}
      {activeTab === 'progress' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[var(--tm-primary-soft)] text-[var(--tm-primary)] flex items-center justify-center">
                  <CheckSquare className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs text-[var(--tm-ink-muted)] font-semibold uppercase">Overall Completion</div>
                  <div className="text-2xl font-bold text-[var(--tm-ink)] mt-0.5">{progressPercent}%</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[var(--tm-success-bg)] text-[var(--tm-success)] flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs text-[var(--tm-ink-muted)] font-semibold uppercase">Task Status</div>
                  <div className="text-xl font-bold text-[var(--tm-ink)] mt-0.5">
                    {completedTasksCount} / {tasks.length} Completed
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[var(--tm-warning-bg)] text-[var(--tm-warning)] flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs text-[var(--tm-ink-muted)] font-semibold uppercase">Next Target Due</div>
                  <div className="text-xl font-bold text-[var(--tm-ink)] mt-0.5">
                    {nextDueDate ? formatDate(nextDueDate) : 'On Schedule'}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Project Milestones & Task Progress</CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-[var(--tm-border)]">
              {tasks.length === 0 ? (
                <div className="p-8 text-center text-[var(--tm-ink-muted)] text-xs">No tasks listed yet.</div>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className="p-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={task.status === 'completed' ? 'success' : 'primary'} size="sm">
                          {task.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                      <h4 className="text-sm font-semibold text-[var(--tm-ink)]">{task.title}</h4>
                    </div>

                    <div className="text-right text-xs">
                      {task.dueDate && (
                        <div className="text-[var(--tm-ink-muted)] font-medium">Due: {formatDate(task.dueDate)}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
