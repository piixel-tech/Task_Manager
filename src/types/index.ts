export type UserRole = 'admin' | 'employee' | 'client';
export type Company = 'piixel' | 'unwork';

export interface User {
  id: string;
  name: string;
  jobTitle: string;
  company: Company;
  role: UserRole;
  loginId: string;
  password?: string;
  mustChangePassword?: boolean;
  active: boolean;
  leftJobDate?: string; // YYYY-MM-DD
  avatarUrl?: string;
  birthday?: string; // MM-DD or YYYY-MM-DD
  joiningDate?: string; // YYYY-MM-DD
  nickname?: string;
}

export type BreakType = 'lunch' | 'tea' | 'personal';

export interface BreakSession {
  id: string;
  breakStart: string;
  breakEnd?: string;
  type: BreakType;
}

export interface PunchSession {
  id: string;
  punchIn: string;
  punchOut?: string;
  breaks: BreakSession[];
}

export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'on_leave';

export interface AttendanceDay {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  punchSessions: PunchSession[];
  totalHours: number;
  /** Set when the employee marks "Done for the day"; cleared on Resume Day. */
  dayEndedAt?: string;
  flagged?: boolean;
  autoClosed?: boolean;
  correctionReason?: string;
}

export type HolidayType = 'national' | 'company' | 'optional';

export interface Holiday {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  type: HolidayType;
}

export type LiveEmployeeStatus =
  | 'Working'
  | 'On break'
  | 'Done for the day'
  | 'Punched out'
  | 'On leave'
  | 'Not marked';

export interface Project {
  id: string;
  name: string;
  clientName?: string;
  description: string;
  company: Company | 'both';
  status: 'planning' | 'in_progress' | 'completed' | 'on_hold' | 'active';
  assignedUserIds: string[];
  memberIds: string[];
  startDate?: string;
  deadline?: string;
  createdAt: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskSession {
  id: string;
  taskId: string;
  userId: string;
  startTime: string;
  endTime?: string;
  durationMinutes?: number;
}

export interface TaskPauseReason {
  id: string;
  taskId: string;
  userId: string;
  reason: string;
  note?: string;
  timestamp: string;
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'needs_changes';

export interface AttachedFile {
  id?: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  dataUrl?: string;
}

export interface Submission {
  id: string;
  taskId: string;
  userId: string;
  notes: string;
  submittedAt: string;
  status: SubmissionStatus;
  adminComment?: string;
  fileUrls?: string[];
  files?: AttachedFile[];
}

/** Review flow: submitted -> (changes requested -> resubmitted)* -> approved */
export type TaskReviewStatus = 'submitted' | 'changes_requested' | 'approved';

export type TaskReviewAction = 'submitted' | 'changes_requested' | 'resubmitted' | 'approved';

export interface TaskReviewEvent {
  id: string;
  action: TaskReviewAction;
  /** Who performed it: the employee for submit/resubmit, the reviewer for changes/approval. */
  byUserId: string;
  at: string;
  /** Only for changes_requested: what needs to change. */
  message?: string;
  submissionId?: string;
}

export interface ChangeRequest {
  message: string;
  requestedAt: string;
  requestedByUserId: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  subHeading?: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedUserId: string;
  assignedByUserId?: string;
  assignmentStatus?: 'pending' | 'accepted' | 'rejected';
  rejectionReason?: string;
  startDate?: string;
  dueDate?: string;
  sessions: TaskSession[];
  submissions: Submission[];
  estimatedHours?: number;
  loggedHours?: number;
  revisions?: number;
  pauseReasons?: TaskPauseReason[];
  createdAt: string;
  completedAt?: string;

  /** --- Review flow --- */
  reviewStatus?: TaskReviewStatus;
  /** Audit trail shown in the task detail view on both sides. */
  reviewHistory?: TaskReviewEvent[];
  /** Latest open change request. Cleared on resubmit. */
  changeRequest?: ChangeRequest;
  approvedAt?: string;
  approvedByUserId?: string;
}

/** Employee notifications (bell menu). */
export type NotificationType =
  | 'holiday'
  | 'task_assigned'
  | 'project_added'
  | 'group_added'
  | 'task_approved'
  | 'changes_requested'
  | 'birthday'
  | 'task_due'
  | 'punch_reminder';

export interface AppNotification {
  id: string;
  /** The employee this notification belongs to. */
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  /** In-app route opened when the notification is clicked. */
  link: string;
  createdAt: string;
  read: boolean;
}

/** Payload accepted by notificationService.addNotification(). */
export interface NotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  link: string;
  createdAt?: string;
  read?: boolean;
}

export interface ChatRoom {
  id: string;
  name: string;
  type: 'direct' | 'group' | 'project' | 'client';
  participantIds: string[];
  projectId?: string;
  lastMessage?: string;
  updatedAt: string;
  inviteCode?: string;
  clientPhone?: string;
  clientName?: string;
  revoked?: boolean;
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  timestamp: string;
  replyToId?: string;
  replyToContent?: string;
  replyToSenderId?: string;
  attachments?: AttachedFile[];
  mentions?: string[];
  seenBy?: string[];
}

export interface ClientInvite {
  code: string;
  projectId: string;
  clientName: string;
  company: string;
  phone: string;
  otp?: string;
  createdAt: string;
}

export type BadgeType = 'fastest_delivery' | 'client_favourite' | 'helped_teammate' | 'zero_revisions';

export interface Badge {
  id: string;
  userId: string;
  badgeType: BadgeType;
  title: string;
  description: string;
  awardedAt: string;
  awardedBy?: string;
  note?: string;
}

export interface Kudos {
  id: string;
  taskId: string;
  fromUserId: string;
  toUserId: string;
  createdAt: string;
}

export interface UserGamification {
  userId: string;
  points: number;
  streak: number;
  level: 'Rookie' | 'Pro' | 'Legend';
  badges: Badge[];
  kudosCount: number;
}

export interface DailyUpdate {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  summary: string;
  createdAt: string;
}

export interface WeeklyReport {
  projectId: string;
  startDate: string;
  endDate: string;
  completedTasksCount: number;
  totalHoursLogged: number;
  revisionsCount: number;
  completedTasks: { id: string; title: string; hours: number; assignedUserId: string }[];
  nextSteps: { id: string; title: string; assignedUserId: string; dueDate?: string }[];
  summaryMarkdown: string;
}

