/**
 * The help centre's content. One list of articles, each tagged with who it is for:
 *  - admin     the admin panel
 *  - employee  the employee panel
 *  - head      extra topics for people who head a subfolder (they see the employee ones too)
 *  - client    the client portal
 * Every answer is short and step-by-step; "goTo" opens the exact page, "related" links to other answers.
 * Keep this in step with the app: an answer must describe what the app really does today.
 */

export type Audience = 'admin' | 'employee' | 'head' | 'client';

/** What a link needs to know about the viewer: the URL prefix of their part of the app (/admin, /app or /client). */
export interface HelpCtx {
  prefix: string;
}

export interface HelpLink {
  label?: string;
  to: (c: HelpCtx) => string;
}

export interface HelpBody {
  q: string;
  /** One or two sentences before the steps (or the whole answer when there are no steps). */
  text?: string;
  steps?: string[];
  /** "Good to know": a caveat or a small extra. */
  note?: string;
  goTo?: HelpLink;
}

export interface HelpArticle extends HelpBody {
  id: string;
  category: CategoryId;
  for: Audience[];
  /** Other words people might type when they look for this. */
  keywords?: string;
  related?: string[];
  /** What the admin panel shows instead (when it differs from the employee answer). */
  admin?: Partial<HelpBody>;
}

export type CategoryId = 'start' | 'tasks' | 'subfolders' | 'chat' | 'leave';

export interface HelpCategory {
  id: CategoryId;
  label: string;
  blurb: string;
  /** Hidden from everyone but these. */
  only?: Audience[];
}

export const CATEGORIES: HelpCategory[] = [
  { id: 'start', label: 'Getting started', blurb: 'The quick tricks and daily habits.' },
  { id: 'tasks', label: 'Tasks and timer', blurb: 'Tracking time, handing work in, changes along the way.' },
  { id: 'subfolders', label: 'Projects and subfolders', blurb: 'How work is organised and who can see it.' },
  { id: 'chat', label: 'Chat', blurb: 'Scheduled messages and turning chat into work.' },
  { id: 'leave', label: 'Leave and settings', blurb: 'Leave, Google, notifications and undoing things.' }
];

const at =
  (path: string, label?: string): HelpLink => ({ label, to: (c) => `${c.prefix}${path}` });

const TEAM: Audience[] = ['admin', 'employee'];


export const ARTICLES: HelpArticle[] = [
  // ============================================================= Getting started
  {
    id: 'start-search',
    category: 'start',
    for: TEAM,
    q: 'How do I jump to anything quickly?',
    steps: ['Press Ctrl+K (⌘K on a Mac), or click the search in the top bar.', 'Type a few letters. It finds pages, tasks, projects, people and office posts.', 'Press Enter to open it.'],
    related: ['start-tips']
  },
  {
    id: 'start-tips',
    category: 'start',
    for: TEAM,
    q: 'Small things most people never notice',
    keywords: 'tips tricks hidden secret shortcuts',
    steps: [
      'Press ? anywhere (outside a text box) to see all keyboard shortcuts.',
      'While a timer runs, your browser tab shows ▶ and the time.',
      'Hold the red Delete pill for about a second to confirm a delete.',
      'Hover a notification in the bell and press Remind me in 1h to bring it back later.'
    ],
    related: ['start-search', 'chat-schedule']
  },
  {
    id: 'status-set',
    category: 'start',
    for: TEAM,
    q: 'How do I set or change my daily status?',
    steps: [
      'The first time you open the app each day, a box asks “How are you working today?”. Pick one.',
      'Changed your mind? Click the status pill in the top bar and pick another.',
      'Everyone on the team sees it. Only today can be changed.'
    ],
    related: ['leave-request']
  },

  // ============================================================= Tasks and timer
  {
    id: 'tasks-timer-switch',
    category: 'tasks',
    for: TEAM,
    q: 'How do I switch to another task in one click?',
    steps: ['Press the round play button on the other task.', 'Your current timer pauses by itself and the new one starts. A message says “Paused X, started Y”.'],
    note: 'Only one timer runs at a time.',
    goTo: at('/tasks', 'Open my tasks'),
    related: ['tasks-timer-close']
  },
  {
    id: 'tasks-timer-close',
    category: 'tasks',
    for: TEAM,
    q: 'What happens if I close the browser with a timer running?',
    text: 'Nothing stops. The time is kept by the server, not by your browser, so it keeps counting while the tab is closed or your laptop sleeps.',
    steps: ['Open the app again and press pause. The time up to then counts.', 'If a timer is still running after 8 PM, you get one reminder that day.'],
    note: 'Submitting a task for review stops its timer.',
    goTo: at('/tasks', 'Open my tasks'),
    related: ['tasks-timer-switch', 'reviews-submit']
  },
  {
    id: 'tasks-timer-who',
    category: 'tasks',
    for: TEAM,
    q: 'Who can see what I am working on?',
    text: 'Only people who can open the same subfolder as the task, and admins. Clients never see timers.',
    steps: ['On a subfolder’s Tasks tab, a task with a running timer shows the worker’s avatar with a green dot.', 'Admins see every running timer on the dashboard, under Working now.'],
    goTo: at('/tasks', 'Open my tasks'),
    related: ['tasks-timer-close'],
    admin: {
      q: 'How do I see who is working on what?',
      text: 'Admins see every running timer.',
      steps: ['Open the dashboard and look at Working now: who, on which task, in which project.', 'Inside a subfolder, the Tasks tab shows a green dot on tasks being worked on.'],
      goTo: at('/dashboard', 'Open the dashboard')
    }
  },
  {
    id: 'reviews-submit',
    category: 'tasks',
    for: TEAM,
    q: 'How do I submit my work for review?',
    steps: ['Open the task and press Submit for review.', 'Write what you did, attach files if you like, and choose the approver (a head of that subfolder).', 'If changes are asked for, the task moves to Changes requested. Fix it and submit again.'],
    note: 'Your timer stops and progress is locked until the approver decides.',
    goTo: at('/tasks', 'Open my tasks'),
    related: ['tasks-timer-close']
  },
  {
    id: 'reviews-approve',
    category: 'tasks',
    for: ['head', 'admin'],
    q: 'How do I approve work or ask for changes?',
    steps: ['Open Reviews. The Pending tab lists what waits for you.', 'Open one and read the note and files.', 'Approve completes the task. Request changes needs a comment saying what to fix.'],
    goTo: at('/reviews', 'Open Reviews'),
    related: ['reviews-submit']
  },
  {
    id: 'tasks-activity',
    category: 'tasks',
    for: TEAM,
    q: 'How do I ask for changes while work is in progress?',
    steps: [
      'Open the task and use the Mid-way changes tab in its Activity panel.',
      'Write what should change and post it. The assignee and the heads are told.',
      'Whoever acts on it ticks it as resolved.'
    ],
    goTo: at('/tasks', 'Open my tasks')
  },

  // ============================================================= Projects and subfolders
  {
    id: 'sub-structure',
    category: 'subfolders',
    for: TEAM,
    q: 'How are projects and subfolders organised?',
    text: 'A project holds subfolders, usually one per team or stream. Tasks, Essentials, deliverables and mid-way changes live inside subfolders. A head is not a separate role: it is someone appointed to look after one subfolder.',
    goTo: at('/projects', 'Open Projects'),
    related: ['sub-visibility']
  },
  {
    id: 'sub-visibility',
    category: 'subfolders',
    for: TEAM,
    q: 'Why can I (not) see or change a subfolder?',
    text: 'Members and heads can work in a subfolder. Others can only open it if a head or admin shared it, and then they can read but not change (“View only”). The eye icon beside its name shows how it is shared.',
    related: ['sub-visibility-set'],
    admin: { text: 'Admins can open every subfolder. The eye icon beside its name shows how it is shared, and you can change it there.' }
  },
  {
    id: 'sub-visibility-set',
    category: 'subfolders',
    for: ['head', 'admin'],
    q: 'How do I choose who can see a subfolder?',
    steps: [
      'Open the subfolder and click the eye icon beside its name.',
      'Choose Hidden (members only), Visible to everyone, or Visible to selected people.',
      'Everyone you share it with can view, but only members can change.'
    ],
    note: 'Only heads and admins can change this. Everyone affected is notified.',
    related: ['sub-visibility']
  },

  // ============================================================= Chat
  {
    id: 'chat-schedule',
    category: 'chat',
    for: TEAM,
    q: 'How do I send a message later?',
    steps: ['Write your message, then right-click the Send button (or press and hold it).', 'Choose Tomorrow 9:00 AM, Next Monday 9:00 AM or a custom time.', 'To edit or cancel it, open the clock icon in the chat’s top bar.'],
    goTo: at('/chat', 'Open Chats'),
    related: ['tasks-from-chat']
  },
  {
    id: 'tasks-from-chat',
    category: 'chat',
    for: TEAM,
    q: 'How do I turn a chat message into a task?',
    steps: ['Open the ⋯ menu of the message and choose Create task.', 'The task form opens already filled from the message. Pick the assignee and confirm.'],
    note: 'The message then shows a “Task created” chip that opens the task. One message makes one task.',
    goTo: at('/chat', 'Open Chats'),
    related: ['chat-schedule']
  },

  // ============================================================= Leave and settings
  {
    id: 'leave-request',
    category: 'leave',
    for: ['employee'],
    q: 'How do I ask for leave or to work from home?',
    steps: [
      'Open Leave (under More). Click your first day, then your last day on the calendar.',
      'Press Request leave, choose Leave or Work from home, add a reason and pick the admin.',
      'You are notified when it is decided.'
    ],
    note: 'Approving a request does not change your daily status. Set that yourself on the day.',
    goTo: at('/leave-requests', 'Open Leave'),
    related: ['leave-cancel']
  },
  {
    id: 'leave-cancel',
    category: 'leave',
    for: ['employee'],
    q: 'How do I cancel a leave or WFH request?',
    steps: ['Open Leave and find the request under My requests.', 'Press Cancel request and confirm.'],
    note: 'A pending request can be cancelled any time. An approved one only before its start date.',
    goTo: at('/leave-requests', 'Open Leave'),
    related: ['leave-request', 'del-cancel']
  },
  {
    id: 'leave-decide',
    category: 'leave',
    for: ['admin'],
    q: 'How do I approve or reject leave requests?',
    steps: ['Open Leave requests (under More). The badge counts the ones waiting.', 'Approve, or Reject and write the reason. The employee sees it.'],
    note: 'You only see requests sent to you.',
    goTo: at('/leave-requests', 'Open Leave requests')
  },
  {
    id: 'cal-connect',
    category: 'leave',
    for: TEAM,
    q: 'How do I connect Google?',
    steps: ['Open Settings, then Connected apps.', 'Press Connect on Google and allow access.', 'One connection gives you Calendar, Meet, Drive, Docs and Sheets.'],
    note: 'If it says “Google not configured for your company”, ask an admin.',
    goTo: at('/settings/connected-apps', 'Open Connected apps')
  },
  {
    id: 'notif-types',
    category: 'leave',
    for: TEAM,
    q: 'How do I choose which notifications I get?',
    steps: ['Open Settings, then Notifications.', 'Switch off the kinds you do not want. A kind that is off does not pop up and does not appear in your bell.'],
    goTo: at('/settings/notifications', 'Open Notifications settings')
  },
  {
    id: 'del-cancel',
    category: 'leave',
    for: TEAM,
    q: 'How do I undo, cancel or get back something I deleted?',
    steps: [
      'A timer: press pause. A scheduled message: cancel it from the clock icon in the chat.',
      'A booking: press the cancel icon on it in the calendar. A leave request: Cancel request on the Leave page.',
      'Deleted something by mistake? Tasks, subfolders, messages and posts stay in Trash for 30 days. Ask an admin to restore it.'
    ],
    related: ['leave-cancel', 'chat-schedule'],
    admin: {
      steps: [
        'A timer: press pause. A scheduled message: cancel it from the clock icon in the chat.',
        'A booking or leave request: cancel it from the calendar or the Leave page.',
        'Deleted something? Open Settings, then Trash, find it and press Restore (kept for 30 days).'
      ],
      goTo: at('/settings/trash', 'Open Trash')
    }
  },

  // ============================================================= Client portal
  {
    id: 'cl-start',
    category: 'start',
    for: ['client'],
    q: 'How do I get started in the client portal?',
    steps: [
      'Open the invite link from your project team and sign in.',
      'Home gives you the overview. Chats, Approvals, Deliverables and Requirements are in the top bar. Book a meeting is under More.',
      'Your avatar opens your settings: profile, password, notifications and appearance.'
    ],
    goTo: at('/home', 'Go to Home'),
    related: ['cl-approve', 'cl-requirements']
  },
  {
    id: 'cl-approve',
    category: 'subfolders',
    for: ['client'],
    q: 'How do I answer an approval from the team?',
    steps: [
      'Open Approvals. Waiting for you lists the questions that need an answer.',
      'Open one and press the approve or the reject button. Rejecting asks for a reason.',
      'Answered ones move to History.'
    ],
    note: 'You are reminded every 24 hours until you answer. You can also answer from the chat itself.',
    goTo: at('/approvals', 'Open Approvals'),
    related: ['cl-chat']
  },
  {
    id: 'cl-chat',
    category: 'chat',
    for: ['client'],
    q: 'How do I chat with the team?',
    text: 'Open Chats and pick a conversation. You only see the groups you were invited to. You can send messages, files and voice notes, reply and react.',
    goTo: at('/chats', 'Open Chats'),
    related: ['cl-approve']
  },
  {
    id: 'cl-requirements',
    category: 'subfolders',
    for: ['client'],
    q: 'How do I tell the team what I need?',
    steps: [
      'Open Requirements and press New requirement.',
      'Write a title and notes, and attach files or links.',
      'Save. The team’s heads are notified.'
    ],
    note: 'You can edit your own requirements later. Every edit keeps the earlier version, and the team can read the history.',
    goTo: at('/requirements', 'Open Requirements'),
    related: ['cl-deliverables']
  },
  {
    id: 'cl-deliverables',
    category: 'subfolders',
    for: ['client'],
    q: 'How do I see how my deliverables are going?',
    text: 'Open Deliverables. For each month you see every item with the stage it has reached, and how many are done and remaining.',
    goTo: at('/deliverables', 'Open Deliverables'),
    related: ['cl-requirements']
  },
  {
    id: 'cl-meeting',
    category: 'start',
    for: ['client'],
    q: 'How do I book a meeting with the team?',
    steps: ['Open Book a meeting under More.', 'Pick a team member on your project, a day and a free slot.', 'Confirm. The booking is on both calendars, with a Meet link when the host has Google connected.'],
    note: 'Clients cannot invite extra guests.',
    goTo: at('/meetings', 'Open Book a meeting'),
    related: ['cl-chat']
  }
];

/** Which kinds of reader a person counts as. Heads read the employee answers too, plus the head ones. */
export const audiencesFor = (role: 'admin' | 'employee' | 'client' | undefined, isHead: boolean): Audience[] => {
  if (role === 'admin') return ['admin'];
  if (role === 'client') return ['client'];
  return isHead ? ['employee', 'head'] : ['employee'];
};

/** The answer as one reader should see it (the admin panel can word things differently). */
export const bodyFor = (a: HelpArticle, role: 'admin' | 'employee' | 'client' | undefined): HelpBody => {
  const base: HelpBody = { q: a.q, text: a.text, steps: a.steps, note: a.note, goTo: a.goTo };
  return role === 'admin' && a.admin ? { ...base, ...a.admin } : base;
};
