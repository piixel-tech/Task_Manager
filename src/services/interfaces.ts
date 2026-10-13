import type {
  AppNotification,
  NotificationInput,
  User,
  AttendanceDay,
  Holiday,
  Project,
  Task,
  ChatRoom,
  Message,
  Submission,
  AttachedFile,
  ClientInvite,
  UserGamification,
  Badge,
  BadgeType,
  Kudos,
  DailyUpdate,
  TaskPauseReason,
  WeeklyReport
} from '../types';

export interface IAuthService {
  login(loginId: string, password?: string): Promise<User>;
  changePassword(userId: string, newPassword?: string): Promise<User>;
  getCurrentUser(): Promise<User | null>;
  logout(): Promise<void>;
}

export interface IUserService {
  getUsers(): Promise<User[]>;
  getUserById(id: string): Promise<User | null>;
  createUser(user: Omit<User, 'id'>): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  resetPassword(id: string, newPassword?: string): Promise<User>;
  toggleUserActive(id: string): Promise<User>;
}

export interface IAttendanceService {
  getAttendance(userId?: string, date?: string): Promise<AttendanceDay[]>;
  markDayStatus(userId: string, status: 'present' | 'on_leave', date?: string): Promise<AttendanceDay>;
  punchIn(userId: string): Promise<AttendanceDay>;
  punchOut(userId: string): Promise<AttendanceDay>;
  startBreak(userId: string, type: 'lunch' | 'tea' | 'personal'): Promise<AttendanceDay>;
  endBreak(userId: string): Promise<AttendanceDay>;
  endMyDay(userId: string): Promise<AttendanceDay>;
  resumeMyDay(userId: string): Promise<AttendanceDay>;
  correctPunchOutTime(attendanceId: string, correctedTimeISO: string, reason: string): Promise<AttendanceDay>;
}

export interface IHolidayService {
  getHolidays(): Promise<Holiday[]>;
  addHoliday(holiday: Omit<Holiday, 'id'>): Promise<Holiday>;
  deleteHoliday(id: string): Promise<void>;
  getWeekOffs(): Promise<number[]>;
  setWeekOffs(days: number[]): Promise<number[]>;
  /** Shift start as "HH:mm"; drives the "not punched in" reminder. */
  getShiftStart(): Promise<string>;
  setShiftStart(time: string): Promise<string>;
}

/**
 * Employee notifications. Everything the app knows about notifications goes
 * through this interface, so the mock can be swapped for backend push later.
 */
export interface INotificationService {
  addNotification(employeeId: string, input: NotificationInput): Promise<AppNotification | null>;
  /**
   * Same as addNotification but skipped when `dedupeKey` was already used today —
   * used by the date-based checks so nothing is sent twice.
   */
  addNotificationOnceToday(
    employeeId: string,
    dedupeKey: string,
    input: NotificationInput
  ): Promise<AppNotification | null>;
  getNotifications(userId: string): Promise<AppNotification[]>;
  getUnreadCount(userId: string): Promise<number>;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
  /** Fires whenever the list changes, so the bell can refresh. */
  subscribe(callback: () => void): () => void;
}

export interface IProjectService {
  getProjects(company?: string, userId?: string): Promise<Project[]>;
  getProjectById(id: string): Promise<Project | null>;
  createProject(project: Omit<Project, 'id' | 'createdAt'>): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  closeProject(id: string): Promise<Project>;
}

export interface StartTaskResult {
  task: Task;
  needConfirm?: boolean;
  runningTaskName?: string;
}

export interface ITaskService {
  getTasks(projectId?: string, userId?: string): Promise<Task[]>;
  getTaskById(id: string): Promise<Task | null>;
  createTask(task: Omit<Task, 'id' | 'createdAt' | 'sessions' | 'submissions'>): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  startTaskSession(taskId: string, userId: string, force?: boolean): Promise<StartTaskResult>;
  stopTaskSession(taskId: string, userId: string): Promise<Task>;
  submitTaskWork(taskId: string, userId: string, notes: string, files?: AttachedFile[], fileUrls?: string[]): Promise<Task>;
  reviewSubmission(
    taskId: string,
    submissionId: string,
    status: 'approved' | 'needs_changes',
    comment?: string,
    reviewerId?: string
  ): Promise<Task>;
  respondToAssignment(taskId: string, action: 'accept' | 'reject', reason?: string): Promise<Task>;
  getSubmissionsFeed(): Promise<{ submission: Submission; task: Task; user?: User }[]>;
}

export interface IChatService {
  getChatRooms(userId: string): Promise<ChatRoom[]>;
  getMessages(roomId: string): Promise<Message[]>;
  sendMessage(
    roomId: string,
    senderId: string,
    content: string,
    replyToId?: string,
    attachments?: AttachedFile[],
    mentions?: string[]
  ): Promise<Message>;
  createChatRoom(
    name: string,
    type: 'direct' | 'group' | 'project' | 'client',
    participantIds: string[],
    projectId?: string,
    createdByUserId?: string
  ): Promise<ChatRoom>;
  subscribe(roomId: string, callback: () => void): () => void;
  markMessagesSeen(roomId: string, userId: string): Promise<void>;
  syncProjectRooms(projects: Project[]): Promise<void>;
  addClientRoom(
    projectId: string,
    clientName: string,
    company: string,
    phone: string
  ): Promise<{ room: ChatRoom; inviteCode: string }>;
  getInviteByCode(code: string): Promise<{ invite: ClientInvite; project: Project } | null>;
  verifyClientOTP(code: string, phone: string, otp: string): Promise<{ user: User; room: ChatRoom }>;
  revokeClientAccess(roomId: string): Promise<void>;
}

export interface IGamificationService {
  getUserGamification(userId: string): Promise<UserGamification>;
  addPoints(userId: string, points: number): Promise<UserGamification>;
  awardBadge(userId: string, badgeType: BadgeType, awardedBy?: string, note?: string): Promise<Badge>;
  giveKudos(taskId: string, fromUserId: string, toUserId: string): Promise<Kudos>;
  getKudosForUser(userId: string): Promise<Kudos[]>;
  getKudosForTask(taskId: string): Promise<Kudos[]>;
  saveDailyUpdate(userId: string, summary: string): Promise<DailyUpdate>;
  getDailyUpdates(date?: string): Promise<DailyUpdate[]>;
  logTaskPauseReason(taskId: string, userId: string, reason: string, note?: string): Promise<TaskPauseReason>;
  getTaskPauseReasons(taskId: string): Promise<TaskPauseReason[]>;
  getTeamMonthlyGoal(): Promise<{ finished: number; goal: number }>;
  setTeamMonthlyGoal(goal: number): Promise<{ finished: number; goal: number }>;
  generateWeeklyReport(projectId: string, startDate: string, endDate: string): Promise<WeeklyReport>;
}
