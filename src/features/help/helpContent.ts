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

export type CategoryId =
  | 'start'
  | 'status'
  | 'tasks'
  | 'subfolders'
  | 'reviews'
  | 'chat'
  | 'approvals'
  | 'calendar'
  | 'notifications'
  | 'leave'
  | 'office'
  | 'report'
  | 'settings'
  | 'deleting'
  | 'admin';

export interface HelpCategory {
  id: CategoryId;
  label: string;
  blurb: string;
  /** Hidden from everyone but these. */
  only?: Audience[];
}

export const CATEGORIES: HelpCategory[] = [
  { id: 'start', label: 'Getting started', blurb: 'Signing in, finding your way, the quick tricks.' },
  { id: 'status', label: 'Daily status', blurb: 'Telling the team how you are working today.' },
  { id: 'tasks', label: 'Tasks and timer', blurb: 'Creating work, tracking time, staying on top of due dates.' },
  { id: 'subfolders', label: 'Projects, subfolders and heads', blurb: 'How work is organised and who can see it.' },
  { id: 'reviews', label: 'Submissions and approvals', blurb: 'Handing work in and getting it approved.' },
  { id: 'chat', label: 'Chat', blurb: 'Groups, mentions, files, scheduled messages.' },
  { id: 'approvals', label: 'Client approvals', blurb: 'Yes-or-no questions for clients.' },
  { id: 'calendar', label: 'Calendar and Google', blurb: 'Meetings, bookings, Drive files, Meet.' },
  { id: 'notifications', label: 'Notifications', blurb: 'The bell, your Inbox, sounds, Focus mode.' },
  { id: 'leave', label: 'Leave and work from home', blurb: 'Asking, cancelling and approving.' },
  { id: 'office', label: 'Office board', blurb: 'Notices and issues for the whole office.' },
  { id: 'report', label: 'Monthly report', blurb: 'Your month in numbers.' },
  { id: 'settings', label: 'Settings and shortcuts', blurb: 'Your profile, look and keyboard tricks.' },
  { id: 'deleting', label: 'Deleting and cancelling', blurb: 'What can be undone, and by whom.' },
  { id: 'admin', label: 'Admin tools', blurb: 'People, companies, workspace, trash and more.', only: ['admin'] }
];

const at =
  (path: string, label?: string): HelpLink => ({ label, to: (c) => `${c.prefix}${path}` });

const TEAM: Audience[] = ['admin', 'employee'];
const ALL: Audience[] = ['admin', 'employee', 'client'];

export const ARTICLES: HelpArticle[] = [
  // ============================================================= Getting started
  {
    id: 'start-signin',
    category: 'start',
    for: TEAM,
    q: 'How do I sign in for the first time?',
    steps: [
      'Open the app and sign in with your email and the temporary password your admin gave you.',
      'You are asked to choose a password of your own. Pick one only you know.',
      'You land on Home. From now on sign in with your own password.'
    ],
    goTo: at('/settings/password', 'Change my password'),
    related: ['start-forgot', 'start-navigate'],
    admin: { steps: ['Sign in with the email and password you were given.', 'If you were given a temporary password, you are asked to choose your own.', 'You land on the dashboard.'] }
  },
  {
    id: 'start-forgot',
    category: 'start',
    for: TEAM,
    q: 'I forgot my password. What now?',
    text: 'Ask an admin to reset it. They give you a temporary password, and you choose a new one when you sign in with it.',
    goTo: at('/settings/password', 'Change my password'),
    related: ['start-signin', 'admin-people'],
    admin: { text: 'You can reset anyone’s password from Team Members. For your own, change it in Settings.', goTo: at('/settings/password', 'Change my password') }
  },
  {
    id: 'start-navigate',
    category: 'start',
    for: ['employee'],
    q: 'How do I find my way around?',
    steps: [
      'The bar at the top has Home, Projects, My Tasks, Chats and Office board. Everything else is under More: Inbox, Calendar, Leave, Reviews, Monthly Report and Settings.',
      'On the left, the Folders panel lists your projects and their subfolders. Use the small + there to create things.',
      'The status pill, the search, the bell and your avatar are on the right of the top bar. Your avatar opens your account menu.'
    ],
    goTo: at('/dashboard', 'Go to Home'),
    related: ['start-search', 'start-home', 'start-tips']
  },
  {
    id: 'start-navigate-admin',
    category: 'start',
    for: ['admin'],
    q: 'How do I find my way around?',
    steps: [
      'The bar at the top has Home, Projects, Task Hub, Chats and Office board. Under More you find Inbox, Calendar, Leave requests, Reviews, Monthly Report, Team Members and Settings.',
      'On the left, the Folders panel lists every project and subfolder. Use the small + there to create things.',
      'The status pill, the search, the bell and your avatar are on the right of the top bar.'
    ],
    goTo: at('/dashboard', 'Go to Home'),
    related: ['start-search', 'start-home', 'start-tips']
  },
  {
    id: 'start-home',
    category: 'start',
    for: ['employee'],
    q: 'What is on my Home page?',
    text: 'Home is your day at a glance.',
    steps: [
      'The top shows what is due today, what is overdue and what is in review. Click a number to open exactly those tasks.',
      'Cards below show My tasks, My submissions, Today’s schedule and what is Unread. If you approve other people’s work, a Review queue card appears too.',
      'The Today overview shows how everyone is working today.'
    ],
    goTo: at('/dashboard', 'Go to Home'),
    related: ['status-set', 'tasks-find']
  },
  {
    id: 'start-home-admin',
    category: 'start',
    for: ['admin'],
    q: 'What is on my dashboard?',
    text: 'The dashboard is the whole company at a glance.',
    steps: [
      'Number cards show overdue, due today, in review and open tasks. Click one to see those tasks.',
      'Client approvals waiting, Today’s meetings, Project health and Team workload sit below.',
      'Working now shows who has a timer running and on which task. The Today overview shows everyone’s status.'
    ],
    goTo: at('/dashboard', 'Go to the dashboard'),
    related: ['tasks-timer-who', 'status-who']
  },
  {
    id: 'start-search',
    category: 'start',
    for: TEAM,
    q: 'How do I jump to anything quickly?',
    steps: [
      'Press Ctrl+K (⌘K on a Mac), or click the search in the top bar.',
      'Type a few letters. It finds pages, tasks, projects, people and office posts.',
      'Press Enter, or click a result, to open it.'
    ],
    note: 'It only looks things up. It never changes anything.',
    related: ['settings-shortcuts', 'start-tips']
  },
  {
    id: 'start-tips',
    category: 'start',
    for: TEAM,
    q: 'Small things most people never notice',
    keywords: 'tips tricks hidden secret',
    steps: [
      'Press ? anywhere (outside a text box) to see all keyboard shortcuts. Press g and then a letter to jump somewhere, for example g then t for Tasks.',
      'While a timer runs, your browser tab shows ▶ and the time, so you can see it from another tab.',
      'Right-click or press and hold the Send button in a chat to send a message later.',
      'Hold the red Delete pill for about a second to confirm a delete.',
      'Hover a notification in the bell and press Remind me in 1h to bring it back later.',
      'In the Tasks list, Completed is folded away. Click it to open it.',
      'In a message box, Ctrl+K (⌘K) adds a link, and Ctrl+B, Ctrl+I and Ctrl+U format the selected text.'
    ],
    related: ['settings-shortcuts', 'chat-schedule', 'notif-snooze', 'tasks-timer-rail']
  },

  // ============================================================= Daily status
  {
    id: 'status-set',
    category: 'status',
    for: TEAM,
    q: 'How do I set my daily status?',
    steps: [
      'The first time you open the app each day, a box asks “How are you working today?”.',
      'Pick Present, Work from home, Half day or On leave.',
      'Changed your mind? Click the status pill in the top bar (“Change today’s status”) and pick another one.'
    ],
    note: 'Only today can be changed. Past and future days cannot be edited.',
    related: ['status-who', 'status-leave', 'status-off-days']
  },
  {
    id: 'status-who',
    category: 'status',
    for: TEAM,
    q: 'Who can see my status?',
    text: 'Everyone on the team. It shows in the Today overview on Home, on your profile and on calendars.',
    goTo: at('/calendar', 'Open the calendar'),
    related: ['status-set', 'cal-open']
  },
  {
    id: 'status-leave',
    category: 'status',
    for: TEAM,
    q: 'Status or leave request: what is the difference?',
    text: 'Your status says how you are working today, and everyone sees it. A leave request asks an admin to approve days in advance. Approving a request does not change your status, so set it yourself on the day.',
    goTo: at('/leave-requests', 'Open Leave'),
    related: ['status-set', 'leave-request'],
    admin: { goTo: at('/leave-requests', 'Open Leave requests') }
  },
  {
    id: 'status-off-days',
    category: 'status',
    for: TEAM,
    q: 'Why was I not asked for a status today?',
    text: 'Weekly off days set by your admin do not ask for a status, and holidays show as closed days on every calendar. Ask an admin if you think a day is set wrongly.',
    related: ['status-set', 'admin-workspace']
  },

  // ============================================================= Tasks and timer
  {
    id: 'tasks-find',
    category: 'tasks',
    for: TEAM,
    q: 'Where are my tasks?',
    steps: [
      'Open My Tasks in the top bar.',
      'Pick a view at the top: My tasks (made by you, for you), Assigned to me, Assigned by me, Pending review, or All tasks (everything you are allowed to see).',
      'Click a task to see it on the right, or open it for the full page.'
    ],
    note: 'Tasks also live inside their subfolder, on its Tasks tab.',
    goTo: at('/tasks', 'Open My Tasks'),
    related: ['tasks-groups', 'tasks-filter', 'tasks-create'],
    admin: {
      q: 'Where are all the tasks?',
      steps: ['Open Task Hub in the top bar.', 'The views are My tasks, Assigned to me, Assigned by me, Pending review and All tasks (everyone, every project).', 'Click a task to see it on the right, or open it for the full page.'],
      goTo: at('/tasks', 'Open Task Hub')
    }
  },
  {
    id: 'tasks-create',
    category: 'tasks',
    for: TEAM,
    q: 'How do I create a task?',
    steps: [
      'Click New task on the Tasks page, or use the + next to a project or subfolder in the Folders panel.',
      'Choose the project and then the subfolder.',
      'Write a title and a description (the description is required), then pick who it is for, the dates and the priority.',
      'Attach files or links if you have them, and confirm.'
    ],
    note: 'Employees can only assign a task to themselves. Heads can assign to the members and heads of their subfolder. Admins can assign to anyone. The person you assign it to is notified.',
    goTo: at('/tasks', 'Open the Tasks page'),
    related: ['tasks-assets', 'tasks-from-chat', 'sub-assign']
  },
  {
    id: 'tasks-groups',
    category: 'tasks',
    for: TEAM,
    q: 'What do the groups in my task list mean?',
    text: 'Tasks sort themselves into groups by what is happening to them, and move on their own when the status changes.',
    steps: [
      'Changes requested: a reviewer sent it back to you.',
      'Overdue: past its due date and not finished, whether or not you have started it.',
      'In progress: you have started it (its timer was started) and it is not overdue.',
      'Upcoming: not started yet and not overdue, in order of due date.',
      'Submitted: waiting for a reviewer.',
      'Completed: approved. It is folded away, so click “Completed” to open it.'
    ],
    goTo: at('/tasks'),
    related: ['tasks-filter', 'reviews-submit']
  },
  {
    id: 'tasks-filter',
    category: 'tasks',
    for: TEAM,
    q: 'How do I search, filter or sort my tasks?',
    steps: [
      'Type in the search box above the list.',
      'Open Filters to narrow by project, subfolder, status, priority or due date.',
      'Use Sort to order by due date, newest, priority or title.',
      'The number cards at the top (Tasks, In progress, Submitted, Overdue) are also filters. Click one.'
    ],
    note: 'Cards on Home link here already filtered, for example Overdue.',
    goTo: at('/tasks'),
    related: ['tasks-groups']
  },
  {
    id: 'tasks-progress',
    category: 'tasks',
    for: TEAM,
    q: 'How is a task’s progress worked out?',
    text: 'Progress is automatic. You do not set it, it follows the task’s status.',
    steps: [
      'To do: 0%.',
      'In progress: 50%. A task moves here when you start its timer.',
      'Submitted for review: 75%.',
      'Changes requested: back to 50% until you resubmit.',
      'Approved: 100%.'
    ],
    note: 'Every status change is written to the task’s activity log.',
    goTo: at('/tasks'),
    related: ['reviews-submit', 'tasks-activity', 'tasks-timer-start']
  },
  {
    id: 'tasks-timer-start',
    category: 'tasks',
    for: TEAM,
    q: 'How do I track time on a task?',
    steps: [
      'Press the round play button on your task. It is on task cards, list rows and the task page.',
      'The button turns green and the time counts up. Press it again to pause.',
      'Your total time shows on the task, and in your monthly report.'
    ],
    note: 'The button only appears on tasks that are assigned to you and still open.',
    goTo: at('/tasks'),
    related: ['tasks-timer-switch', 'tasks-timer-close', 'tasks-timer-rail', 'tasks-timer-nobutton']
  },
  {
    id: 'tasks-timer-switch',
    category: 'tasks',
    for: TEAM,
    q: 'How do I switch to another task in one click?',
    steps: [
      'Press play on the other task.',
      'The timer on your current task pauses by itself and the new one starts. A message tells you “Paused X, started Y”.'
    ],
    note: 'You can only have one timer running at a time.',
    related: ['tasks-timer-start', 'tasks-timer-rail']
  },
  {
    id: 'tasks-timer-close',
    category: 'tasks',
    for: TEAM,
    q: 'What happens if I close the browser with a timer running?',
    text: 'Nothing stops. The time is kept by the server, not by your browser, so it keeps counting while the tab is closed, your laptop sleeps or you sign out. Open the app again and it shows the real running time. Pause it when you are back.',
    steps: [
      'Forgot to stop it? Open the app and press pause. The time up to then counts.',
      'If a timer is still running after 8 PM, you get one reminder that day: “Your timer is still running”.'
    ],
    note: 'Submitting a task for review stops its timer.',
    goTo: at('/tasks', 'Open my tasks'),
    related: ['tasks-timer-start', 'tasks-timer-rail', 'reviews-submit']
  },
  {
    id: 'tasks-timer-rail',
    category: 'tasks',
    for: TEAM,
    q: 'Where can I see or pause my running timer?',
    steps: [
      'At the bottom of the left rail there is a round timer. It shows a ring that fills with the task’s progress while a timer runs.',
      'Hover it to see the task and the live time. Click it to Pause, Resume or Open task.',
      'Your browser tab title also shows ▶ and the time, so you can see it from another tab.'
    ],
    note: 'The same timer shows on every tab and device you are signed in on.',
    related: ['tasks-timer-start', 'tasks-timer-switch']
  },
  {
    id: 'tasks-timer-who',
    category: 'tasks',
    for: TEAM,
    q: 'Who can see what I am working on?',
    text: 'Only people who can open the same subfolder as the task, and admins.',
    steps: [
      'On a subfolder’s Tasks tab, a task with a running timer shows the avatar of the person working on it, with a pulsing green dot. The Heads and Members cards mark who is working now.',
      'Admins also see every running timer on their dashboard, under Working now.',
      'The list of your timer sessions on a task is visible to you, the subfolder’s heads and admins.',
      'Outside subfolders (My Tasks, chat, Home) other people’s timers are not shown. Clients never see them.'
    ],
    related: ['tasks-timer-start', 'sub-tabs'],
    admin: {
      q: 'How do I see who is working on what?',
      text: 'Admins see every running timer.',
      steps: ['Open the dashboard and look at Working now: who, on which task, in which project.', 'Inside a subfolder, the Tasks tab shows avatars with a pulsing green dot on the tasks being worked on.', 'To see a person’s timer sessions on a task, open the task and look at its time log.'],
      goTo: at('/dashboard', 'Open the dashboard')
    }
  },
  {
    id: 'tasks-timer-nobutton',
    category: 'tasks',
    for: TEAM,
    q: 'Why is there no play button on a task?',
    text: 'The timer is for the person doing the work. The button only shows when the task is assigned to you and still open (not already submitted or approved), and when the subfolder lets you work in it. Other people’s tasks show their time but have no button.',
    related: ['tasks-timer-start', 'sub-visibility']
  },
  {
    id: 'tasks-assets',
    category: 'tasks',
    for: TEAM,
    q: 'How do I attach files or links to a task?',
    steps: [
      'Open the Attach menu (on the new task form, or in Assets on a task).',
      'Upload picks a file from your computer. Paste link saves a web address, with an optional title.',
      'Google Drive file, Google Doc and Google Sheet pick from your Google Drive. + New Google Doc and + New Google Sheet create one for you.'
    ],
    note: 'Files can be up to 25 MB each, and programs (executables) are blocked. The Google choices need Google connected in Settings.',
    related: ['cal-connect', 'cal-drive']
  },
  {
    id: 'tasks-activity',
    category: 'tasks',
    for: TEAM,
    q: 'How do I ask for changes while work is in progress?',
    steps: [
      'Open the task and use the Mid-way changes tab in its Activity panel.',
      'Write what should change, attach files if needed and post it. The assignee and the subfolder’s heads are told.',
      'Whoever acts on it ticks it as resolved.',
      'For something that affects a whole subfolder, use the subfolder’s Mid-way changes tab instead. There, Undone lists what is still open.'
    ],
    note: 'You can delete your own entries (admins can delete any).',
    goTo: at('/tasks'),
    related: ['tasks-comments', 'del-who']
  },
  {
    id: 'tasks-comments',
    category: 'tasks',
    for: TEAM,
    q: 'Can I comment, @mention and see a history on a task?',
    steps: [
      'The Activity panel on a task has Comments, Mid-way changes and a log.',
      'Comments support @mentions, replies and emoji reactions. A comment can be assigned to a person, who can resolve it.',
      'The log writes itself: created, assigned, due date changed, progress changed, submitted, approved or sent back, asset added.'
    ],
    related: ['tasks-activity', 'chat-mention']
  },
  {
    id: 'tasks-reminders',
    category: 'tasks',
    for: TEAM,
    q: 'When am I reminded about a due task?',
    text: 'Starting two days before the due date, and every day after it until you submit, you get one reminder at 9:00. At 9:30 a “Your day” notice sums up what is due today, reviews waiting for you and who is on leave. If there is nothing to say, you get nothing.',
    related: ['notif-types', 'notif-focus']
  },
  {
    id: 'tasks-from-chat',
    category: 'tasks',
    for: TEAM,
    q: 'How do I turn a chat message into a task?',
    steps: [
      'Open the ⋯ menu of the message and choose Create task.',
      'The normal task form opens already filled: the first line as the title, the message text as the description, and the message’s file attached as a copy. The project and subfolder come from the chat’s linked subfolder if it has one.',
      'Check it, pick the assignee and confirm.'
    ],
    note: 'The message then shows a “Task created” chip that opens the task, and the task links back to the message. One message makes one task.',
    goTo: at('/chat', 'Open Chats'),
    related: ['tasks-create', 'chat-menu']
  },
  {
    id: 'tasks-delete',
    category: 'tasks',
    for: TEAM,
    q: 'Can I delete a task?',
    text: 'The person who made it, the subfolder’s heads and admins can. Open the task, choose Delete and confirm. It is not gone for good: an admin can restore it from Trash for 30 days.',
    related: ['del-undo', 'del-who']
  },

  // ============================================================= Projects, subfolders and heads
  {
    id: 'sub-structure',
    category: 'subfolders',
    for: TEAM,
    q: 'How are projects and subfolders organised?',
    text: 'A project is a client or a piece of work. It holds subfolders, usually one per team or stream (for example Design or Video). Tasks, Essentials, deliverables and mid-way changes live inside subfolders. Admins create projects and the first subfolder and choose its heads. A head is not a separate role: it is someone appointed to look after one subfolder.',
    goTo: at('/projects', 'Open Projects'),
    related: ['sub-tabs', 'sub-members', 'sub-visibility']
  },
  {
    id: 'sub-tabs',
    category: 'subfolders',
    for: TEAM,
    q: 'What is inside a subfolder?',
    steps: [
      'Overview: its heads, members and the other subfolders in the project.',
      'Tasks: every task in it, with who is working now.',
      'Essentials: the links and files the team keeps coming back to.',
      'Deliverables: the month’s counts and where each item stands.',
      'Mid-way changes: change requests for the whole subfolder.'
    ],
    note: 'A project page has two tabs: Subfolders, and Requirements (what the client asked for).',
    goTo: at('/projects', 'Open Projects'),
    related: ['sub-essentials', 'sub-deliverables', 'sub-requirements']
  },
  {
    id: 'sub-essentials',
    category: 'subfolders',
    for: TEAM,
    q: 'What is Essentials and how do I use it?',
    text: 'Essentials is the team’s shelf: briefs, brand kits, login pages and other things people keep asking for.',
    steps: [
      'Open the subfolder’s Essentials tab and press New item. Give it a name and add files or links in the same step.',
      'Open an item (it unfolds like a folder) to add more with + File or + Link, or drag files onto it.',
      'Pin an item to show it as a tile in Quick access at the top, one click away.',
      'Rename or delete your own items. Heads and admins can delete anyone’s.'
    ],
    note: 'Files up to 25 MB each; programs are blocked.',
    related: ['sub-tabs', 'tasks-assets']
  },
  {
    id: 'sub-deliverables',
    category: 'subfolders',
    for: TEAM,
    q: 'What are deliverables?',
    text: 'Deliverables count what a subfolder must produce each month (for example 12 reels and 8 creatives) and track every item through its stages.',
    steps: [
      'Open the subfolder’s Deliverables tab and pick the month.',
      'Heads set the counts per type, add more, or remove one. Any member moves an item along its stages.',
      'The last stage is the finish line. The tab shows done and remaining per type.'
    ],
    note: 'Clients see the tracker in their portal. Heads can rename and reorder the stages.',
    related: ['sub-tabs', 'cl-deliverables']
  },
  {
    id: 'sub-requirements',
    category: 'subfolders',
    for: TEAM,
    q: 'Where do I see what the client asked for?',
    steps: [
      'Open the project and choose its Requirements tab.',
      'The list on the left is grouped From client and From team. Pick one to read it on the right: notes, files and links.',
      'Search, or filter by All, Files, Links, Notes or subfolder.',
      'Make task turns a requirement into a task, with its title, notes and files filled in.'
    ],
    note: 'Whoever wrote a requirement can edit it, and every edit keeps the earlier version (History). Add to it with + File, + Link or + Note.',
    goTo: at('/projects', 'Open Projects'),
    related: ['tasks-create', 'del-who']
  },
  {
    id: 'sub-mute',
    category: 'subfolders',
    for: TEAM,
    q: 'How do I mute a subfolder?',
    steps: ['Open the subfolder.', 'Use the mute button at the top right and pick 8 hours, 1 week or always.'],
    note: 'Muted subfolders still appear in your bell, but no popup or sound. @mentions still reach you.',
    related: ['chat-mute', 'notif-focus']
  },
  {
    id: 'sub-visibility',
    category: 'subfolders',
    for: TEAM,
    q: 'Why can I (not) see or change a subfolder?',
    text: 'Members and heads can work in a subfolder. Other people can only open it if a head or admin shared it. The little eye icon beside its name says how it is shared. Someone who can see a subfolder but is not a member can read it but not change anything, and sees a “View only” badge.',
    related: ['sub-visibility-set', 'sub-structure'],
    admin: { text: 'Admins can open every subfolder. The eye icon beside a subfolder’s name shows how it is shared, and you can change it there.' }
  },
  {
    id: 'sub-visibility-set',
    category: 'subfolders',
    for: ['head', 'admin'],
    q: 'How do I choose who can see a subfolder?',
    steps: [
      'Open the subfolder and click the eye icon beside its name.',
      'Hidden: only its members and heads (and admins) can see it.',
      'Visible to everyone: everyone in the company can view it, but only members can make changes.',
      'Visible to selected people: pick extra people. Members always show ticked with a Member tag. Everyone you tick can view, not change.'
    ],
    note: 'Only the subfolder’s heads and admins can change this. Everyone affected is notified.',
    related: ['sub-visibility', 'sub-members']
  },
  {
    id: 'sub-members',
    category: 'subfolders',
    for: ['head', 'admin'],
    q: 'How do I add members or change the heads?',
    steps: ['Open the subfolder and press Edit subfolder.', 'Change its name, members and heads, then save and confirm.'],
    note: 'Every head is also a member. Only that subfolder’s heads and admins can do this.',
    related: ['sub-visibility-set', 'sub-new']
  },
  {
    id: 'sub-new',
    category: 'subfolders',
    for: ['head', 'admin'],
    q: 'Can I add another subfolder to a project?',
    text: 'Yes, if you are an admin or a head of any subfolder in that project. Open the project and press New subfolder. Only admins create projects.',
    goTo: at('/projects', 'Open Projects'),
    related: ['sub-members', 'sub-structure']
  },
  {
    id: 'sub-assign',
    category: 'subfolders',
    for: ['head', 'admin'],
    q: 'How do I give work to my team?',
    steps: ['Create a task and choose your subfolder.', 'Pick the assignee: members and other heads of your subfolder (admins can pick anyone).', 'They are notified. You can see their progress on the Tasks tab.'],
    related: ['tasks-create', 'reviews-approve']
  },
  {
    id: 'sub-invite',
    category: 'subfolders',
    for: ['head', 'admin'],
    q: 'How do I invite a client into a chat?',
    steps: [
      'Open the chat group (link it to the subfolder first if it is not).',
      'Open Group info and find the invite links.',
      'Create a link, copy it and send it to the client. You can share it on WhatsApp or revoke it.',
      'The client opens the link and joins that chat.'
    ],
    note: 'Admins and the heads of the group’s linked subfolder can make invite links.',
    goTo: at('/chat', 'Open Chats'),
    related: ['chat-start', 'approvals-request']
  },
  {
    id: 'sub-delete',
    category: 'subfolders',
    for: ['admin'],
    q: 'How do I delete a project or a subfolder?',
    steps: [
      'Open the ⋯ or + menu next to it in the Folders panel (or press Delete on the project page).',
      'The box lists what is inside (subfolders, tasks, files…) and asks you to type its name.',
      'Hold the Delete pill to confirm.'
    ],
    note: 'Only admins can delete. A project always keeps at least one subfolder. Everything goes to Trash and can be restored for 30 days. Members are notified.',
    goTo: at('/projects', 'Open Projects'),
    related: ['del-undo', 'admin-trash']
  },

  // ============================================================= Submissions and approvals
  {
    id: 'reviews-submit',
    category: 'reviews',
    for: TEAM,
    q: 'How do I submit my work for review?',
    steps: [
      'Open the task and press Submit for review.',
      'Write a note: what you did and what the reviewer should look at. Attach files if you want.',
      'Choose the approver (the heads of that subfolder) and submit.'
    ],
    note: 'Your timer stops and progress is locked until the approver decides.',
    goTo: at('/tasks', 'Open my tasks'),
    related: ['reviews-changes', 'reviews-track']
  },
  {
    id: 'reviews-changes',
    category: 'reviews',
    for: TEAM,
    q: 'What if the reviewer asks for changes?',
    steps: [
      'The task moves to Changes requested in your list, and you are notified.',
      'Open it to read the comments. All earlier rounds are listed too.',
      'Make the changes and submit again.'
    ],
    goTo: at('/tasks', 'Open my tasks'),
    related: ['reviews-submit', 'reviews-track']
  },
  {
    id: 'reviews-track',
    category: 'reviews',
    for: ['employee'],
    q: 'Where do I see how my submissions are doing?',
    text: 'Open Reviews under More. Your submissions are listed as Open (waiting or sent back) and Approved. The My submissions card on Home counts them as well.',
    goTo: at('/reviews', 'Open Reviews'),
    related: ['reviews-submit', 'reviews-changes']
  },
  {
    id: 'reviews-approve',
    category: 'reviews',
    for: ['head', 'admin'],
    q: 'How do I approve work or ask for changes?',
    steps: [
      'Open Reviews. The Pending tab lists the submissions waiting for you.',
      'Open one and read the note and files.',
      'Approve marks the task complete at 100% and tells the assignee. Request changes needs comments saying what to fix.'
    ],
    note: 'You see the submissions where you were picked as approver. Admins see all. Decided ones are on the Decided tab.',
    goTo: at('/reviews', 'Open Reviews'),
    related: ['reviews-who']
  },
  {
    id: 'reviews-who',
    category: 'reviews',
    for: TEAM,
    q: 'Who can approve my work?',
    text: 'The heads of the task’s subfolder. You choose one in the Approver list when you submit. Admins can see all submissions.',
    related: ['reviews-submit']
  },

  // ============================================================= Chat
  {
    id: 'chat-start',
    category: 'chat',
    for: TEAM,
    q: 'How do I start a chat or a group?',
    steps: [
      'Open Chats and press the new-chat button above the list.',
      'Give the group a name, add people and, if you want, link it to a subfolder.',
      'You are added automatically.'
    ],
    note: 'Anyone on the team can create groups. The person who created a group can rename it, link a subfolder, remove people and delete it.',
    goTo: at('/chat', 'Open Chats'),
    related: ['chat-find', 'sub-invite']
  },
  {
    id: 'chat-format',
    category: 'chat',
    for: TEAM,
    q: 'Can I format a message?',
    steps: [
      'The bar above the message box has bold, italic, underline, strikethrough, link, lists, quote, code, code block and emoji.',
      'Select text and press a button, or press a button first and type.',
      'Ctrl+B, Ctrl+I, Ctrl+U and Ctrl+K work as shortcuts (⌘ on a Mac).'
    ],
    note: 'Enter sends. Shift+Enter starts a new line. The Aa button hides or shows the bar.',
    goTo: at('/chat', 'Open Chats'),
    related: ['chat-mention', 'chat-schedule']
  },
  {
    id: 'chat-mention',
    category: 'chat',
    for: TEAM,
    q: 'How do I mention someone, and see where I was mentioned?',
    steps: [
      'Type @ and pick the person.',
      'They get a notification, even in a muted chat, and the message is highlighted for them.',
      'To see your own mentions, press the @ icon above the chat list.'
    ],
    related: ['notif-types', 'notif-focus']
  },
  {
    id: 'chat-schedule',
    category: 'chat',
    for: TEAM,
    q: 'How do I send a message later?',
    steps: [
      'Write your message.',
      'Right-click the Send button, or press and hold it.',
      'Choose Tomorrow 9:00 AM, Next Monday 9:00 AM or a custom date and time, and confirm.',
      'To edit or cancel it, open the clock icon in the chat’s top bar (Scheduled messages).'
    ],
    note: 'It goes out as a normal message from you at that time.',
    goTo: at('/chat', 'Open Chats'),
    related: ['del-cancel']
  },
  {
    id: 'chat-attach',
    category: 'chat',
    for: TEAM,
    q: 'How do I send files, photos, links and voice notes?',
    steps: [
      'Press + next to the message box for Upload, Paste link or your Google files.',
      'For a voice note, press the microphone when the box is empty, then Send. The trash icon throws it away. A note can be up to 5 minutes.',
      'Anything you type goes along as the caption of the first file.'
    ],
    note: 'Files up to 25 MB each; programs are blocked.',
    related: ['chat-media', 'tasks-assets']
  },
  {
    id: 'chat-menu',
    category: 'chat',
    for: TEAM,
    q: 'How do I reply, forward, react or pin a message?',
    text: 'Open the ⋯ menu on a message.',
    steps: [
      'Pick an emoji to react (👍 ❤️ 😂 😮 🙏 🎉).',
      'Reply quotes the message. Forward copies it into other chats you are in.',
      'Create task turns it into a task.',
      'Pin to top keeps it on top of the chat for everyone in the team.',
      'Message info (on your own messages) shows who has received and seen it.'
    ],
    related: ['tasks-from-chat', 'chat-ticks', 'chat-delete']
  },
  {
    id: 'chat-ticks',
    category: 'chat',
    for: TEAM,
    q: 'What do the ticks on my messages mean?',
    text: 'One tick: sent. Two ticks: delivered to everyone. Two blue ticks: seen by everyone. Open Message info on your message to see who exactly.',
    related: ['chat-menu']
  },
  {
    id: 'chat-find',
    category: 'chat',
    for: TEAM,
    q: 'How do I find an old message or chat?',
    steps: [
      'To find a chat, type in “Find a chat” above the list. Use the All, Unread and Groups tabs.',
      'To search inside one chat, press the magnifier in its top bar.',
      'To search every chat, use “Search messages” above the list. Click a result to jump to that message.'
    ],
    related: ['chat-mention', 'chat-media']
  },
  {
    id: 'chat-mute',
    category: 'chat',
    for: TEAM,
    q: 'How do I mute a chat?',
    steps: [
      'Open the chat and use the mute button in its top bar: 8 hours, 1 week or always.',
      'Or open the chat info panel and switch Mute notifications on.'
    ],
    note: 'A muted chat still collects messages, and you still see them in the app. You just get no popup or sound. @mentions, approvals and overdue notices still reach you. To go quiet for everything, use Focus mode.',
    related: ['notif-focus', 'sub-mute']
  },
  {
    id: 'chat-media',
    category: 'chat',
    for: TEAM,
    q: 'Where are the files and links people shared?',
    text: 'Open the chat info panel (the info button in the chat’s top bar). It has Media, Docs and Links tabs, and the pinned and scheduled messages. Press a shared item to jump to its message.',
    related: ['chat-find']
  },
  {
    id: 'chat-delete',
    category: 'chat',
    for: TEAM,
    q: 'What is the difference between Delete for me and Delete for everyone?',
    steps: [
      'Delete for me hides the message from you only.',
      'Delete for everyone (your own messages) replaces it with “This message was deleted” for all.'
    ],
    note: 'A message deleted for everyone is kept in Trash, and an admin can restore it for 30 days.',
    related: ['del-undo', 'chat-menu']
  },

  // ============================================================= Client approvals
  {
    id: 'approvals-request',
    category: 'approvals',
    for: TEAM,
    q: 'How do I ask a client for a yes or no?',
    steps: [
      'Open a chat group that has a client in it.',
      'Press the shield button next to the message box (Request client approval).',
      'Write the question, and edit the labels of the Approve and Reject buttons if you want.',
      'Send. The client sees a card in the chat and in their Approvals page.'
    ],
    note: 'Any team member of the group can ask. If the client rejects, they must give a reason. Approval requests cannot be forwarded.',
    goTo: at('/chat', 'Open Chats'),
    related: ['approvals-reminder', 'sub-invite']
  },
  {
    id: 'approvals-reminder',
    category: 'approvals',
    for: TEAM,
    q: 'What if the client does not answer?',
    text: 'They are reminded every 24 hours until they answer: a notification, and the card is repeated in the chat. Nobody else is notified, so there is no escalation. Admins see how many approvals are waiting on their dashboard.',
    related: ['approvals-request'],
    admin: { goTo: at('/dashboard', 'Open the dashboard') }
  },

  // ============================================================= Calendar and Google
  {
    id: 'cal-open',
    category: 'calendar',
    for: TEAM,
    q: 'How do I see someone else’s calendar?',
    steps: ['Open Calendar, or open the person’s profile and press their calendar.', 'You see their status, holidays, bookings and, from connected Google calendars, busy times.'],
    goTo: at('/calendar', 'Open Calendar'),
    related: ['cal-book', 'cal-busy']
  },
  {
    id: 'cal-book',
    category: 'calendar',
    for: TEAM,
    q: 'How do I book a meeting with someone?',
    steps: [
      'Open their calendar and pick a day.',
      'Choose the length, then click a free slot.',
      'Fill in New booking: a title, an optional note, and guests (Add members, or Invite by email).',
      'Confirm. The booking shows on their calendar and yours, and a Meet link is added when Google is connected.'
    ],
    note: 'Slots follow the working hours set by your admin. Nobody can be double-booked, and holidays and leave days cannot be booked.',
    goTo: at('/calendar', 'Open Calendar'),
    related: ['cal-guests', 'cal-cancel', 'cal-reminder']
  },
  {
    id: 'cal-guests',
    category: 'calendar',
    for: TEAM,
    q: 'How do I invite teammates, clients or outside guests?',
    steps: [
      'In New booking, open Add members. The list holds everyone active (admins, employees and clients). Search by name or role, tick as many as you like. They show as chips with an x.',
      'To invite anyone else, type their email in Invite by email and press Enter.',
      'Google emails the invitations when you confirm.'
    ],
    note: 'Sending invitations needs your Google calendar connected. Teammates also get a notification in the app.',
    related: ['cal-connect', 'cal-book']
  },
  {
    id: 'cal-cancel',
    category: 'calendar',
    for: TEAM,
    q: 'How do I cancel a booking?',
    text: 'On the calendar, press the cancel icon on the booking and confirm. The person it was booked with, the one who booked it and admins can cancel it. The others are told.',
    goTo: at('/calendar', 'Open Calendar'),
    related: ['del-cancel']
  },
  {
    id: 'cal-reminder',
    category: 'calendar',
    for: TEAM,
    q: 'Will I be reminded before a meeting?',
    text: 'Yes. About 10 minutes before it starts, the host, the person who booked it and any invited teammates get a notification, with the Join link when there is a Meet link.',
    related: ['notif-types']
  },
  {
    id: 'cal-busy',
    category: 'calendar',
    for: TEAM,
    q: 'Why does a time show as busy?',
    text: 'Because there is a booking, a leave day or holiday, or an event in their connected Google calendar. Other people see Google events only as Busy, never the details. You see your own as Google Calendar.',
    related: ['cal-connect', 'cal-book']
  },
  {
    id: 'cal-connect',
    category: 'calendar',
    for: TEAM,
    q: 'How do I connect Google?',
    steps: [
      'Open Settings, then Connected apps.',
      'Press Connect on Google and allow access.',
      'One connection gives you Calendar, Meet, Drive, Docs and Sheets.'
    ],
    note: 'If it says “Google not configured for your company”, ask an admin: each company has its own Google setup.',
    goTo: at('/settings/connected-apps', 'Open Connected apps'),
    related: ['cal-drive', 'cal-guests']
  },
  {
    id: 'cal-drive',
    category: 'calendar',
    for: TEAM,
    q: 'How do I attach a Google file, or make a new Doc or Sheet?',
    steps: [
      'Open any Attach menu (task, chat, Essentials, requirements).',
      'Under From Google pick Google Drive file, Google Doc or Google Sheet and choose the file.',
      'Under Create new press + New Google Doc or + New Google Sheet. It is made in your own Drive and linked here.'
    ],
    note: 'Share it in Google with the people who need to open it. Google files are saved as links.',
    goTo: at('/settings/connected-apps', 'Open Connected apps'),
    related: ['cal-connect', 'tasks-assets']
  },

  // ============================================================= Notifications
  {
    id: 'notif-where',
    category: 'notifications',
    for: TEAM,
    q: 'Where are my notifications?',
    steps: [
      'The bell in the top bar shows the latest ones.',
      'Inbox (under More) shows all of them, with the tabs All, Unread, Mentions and Approvals.',
      'Click one to open what it is about. Mark all as read clears the dots.'
    ],
    goTo: at('/activity', 'Open Inbox'),
    related: ['notif-delete', 'notif-snooze', 'notif-types']
  },
  {
    id: 'notif-snooze',
    category: 'notifications',
    for: TEAM,
    q: 'Can I be reminded about a notification later?',
    steps: ['Open the bell and hover the notification.', 'Press Remind me in 1h.', 'It is marked read now and comes back an hour later as a new one, titled “Reminder: …”.'],
    related: ['notif-where']
  },
  {
    id: 'notif-delete',
    category: 'notifications',
    for: TEAM,
    q: 'How do I delete notifications?',
    steps: ['Open Inbox and hover a notification, then press Delete.', 'Or use Delete read or Delete all at the top.', 'Confirm. Deleted notifications cannot be restored.'],
    goTo: at('/activity', 'Open Inbox'),
    related: ['notif-where']
  },
  {
    id: 'notif-types',
    category: 'notifications',
    for: TEAM,
    q: 'How do I choose which notifications I get?',
    steps: [
      'Open Settings, then Notifications.',
      'Switch off the kinds you do not want: Tasks and projects, Reviews, Chat, Mentions, Office board, Bookings.',
      'A kind that is off does not pop up and does not appear in your bell.'
    ],
    goTo: at('/settings/notifications', 'Open Notifications settings'),
    related: ['notif-sound', 'notif-focus']
  },
  {
    id: 'notif-sound',
    category: 'notifications',
    for: TEAM,
    q: 'How do I change sounds or get desktop popups?',
    steps: [
      'Open Settings, then Notifications, and go to Alerts.',
      'Mute sounds, choose the normal and the important sound, and set the volume. Important ones (mentions, approvals, overdue) still sound when sounds are muted.',
      'Turn on Desktop popups and allow it when the browser asks. A system notification then appears when the app is hidden or minimised, and clicking it opens the item.'
    ],
    note: 'These settings are saved on your account. Each browser asks for permission once.',
    goTo: at('/settings/notifications', 'Open Notifications settings'),
    related: ['notif-types']
  },
  {
    id: 'notif-focus',
    category: 'notifications',
    for: TEAM,
    q: 'How do I stop being interrupted?',
    steps: [
      'Click the moon in the top bar, or open Settings, then Focus mode.',
      'Pick 30 minutes, 1 hour, 2 hours, until tomorrow 9:00 AM or a time of your own.',
      'End it any time from the same place.'
    ],
    note: 'No popups, sounds or badge changes while Focus is on. Everything still waits in your bell. Colleagues see a moon on your avatar and “In focus until…”.',
    goTo: at('/settings/focus', 'Open Focus mode'),
    related: ['chat-mute', 'notif-types']
  },

  // ============================================================= Leave and WFH
  {
    id: 'leave-request',
    category: 'leave',
    for: ['employee'],
    q: 'How do I ask for leave or to work from home?',
    steps: [
      'Open Leave (under More).',
      'On the calendar click your first day, then your last day. For one day, click it twice.',
      'Press Request leave. Choose Leave or Work from home, a half day if it is a single day, write a reason and pick the admin to send it to.',
      'Confirm. The admin is notified.'
    ],
    note: 'You cannot pick a day in the past, or days that overlap a request that is pending or approved. The admin must be from your own company.',
    goTo: at('/leave-requests', 'Open Leave'),
    related: ['leave-status', 'leave-cancel', 'status-leave']
  },
  {
    id: 'leave-status',
    category: 'leave',
    for: ['employee'],
    q: 'How do I know if my request was approved?',
    text: 'You get a notification and a pop-up when the admin decides. My requests on the Leave page shows every request with its status: Pending, Approved, Rejected (with the reason) or Cancelled.',
    goTo: at('/leave-requests', 'Open Leave'),
    related: ['leave-request', 'leave-cancel']
  },
  {
    id: 'leave-cancel',
    category: 'leave',
    for: ['employee'],
    q: 'How do I cancel a leave or WFH request?',
    steps: [
      'Open Leave and find the request under My requests.',
      'Press Cancel request and confirm.',
      'It stays in the list with the status Cancelled.'
    ],
    note: 'A pending request can be cancelled any time. An approved one can only be cancelled before its start date, and the admin who approved it is told. Rejected or already-started requests cannot be cancelled.',
    goTo: at('/leave-requests', 'Open Leave'),
    related: ['leave-request', 'del-cancel']
  },
  {
    id: 'leave-decide',
    category: 'leave',
    for: ['admin'],
    q: 'How do I approve or reject leave requests?',
    steps: [
      'Open Leave requests (under More). The badge counts the ones waiting.',
      'Use the tabs Pending, Approved and Rejected, and filter by company if you want.',
      'Approve, or Reject and write the reason (the employee sees it).'
    ],
    note: 'You only see requests that were sent to you, and only the admin it was sent to can decide it. If the employee cancels an approved request before it starts, you get a notification.',
    goTo: at('/leave-requests', 'Open Leave requests'),
    related: ['status-leave']
  },

  // ============================================================= Office board
  {
    id: 'office-post',
    category: 'office',
    for: TEAM,
    q: 'How do I post on the office board?',
    steps: [
      'Open Office board and press New post.',
      'Write what is going on, for example “The coffee is finished”. Add a photo if it helps.',
      'Tick Important: notify the whole team only if everyone needs to know now. Otherwise it simply goes on the board.',
      'Post it and confirm.'
    ],
    goTo: at('/office', 'Open the Office board'),
    related: ['office-resolve', 'office-delete']
  },
  {
    id: 'office-resolve',
    category: 'office',
    for: TEAM,
    q: 'How do I react to a post, or mark it resolved?',
    steps: [
      'Press an emoji under a post to react. Press it again to take it back.',
      '“Seen by” shows who has looked at it.',
      'The author or an admin presses Mark resolved when it is fixed (and Reopen if it was not). Everyone is told.'
    ],
    note: 'Resolved posts stay as history. Use the tabs to switch between open and resolved.',
    goTo: at('/office'),
    related: ['office-post']
  },
  {
    id: 'office-delete',
    category: 'office',
    for: TEAM,
    q: 'Can I delete a post?',
    text: 'You can delete your own posts with the bin icon on the post. Admins can delete any. Everyone’s board updates at once, and an admin can restore it from Trash for 30 days.',
    goTo: at('/office'),
    related: ['del-who', 'del-undo']
  },

  // ============================================================= Monthly report
  {
    id: 'report-view',
    category: 'report',
    for: TEAM,
    q: 'Where is my monthly report?',
    steps: ['Open Monthly Report under More.', 'Use the arrows or the month box to pick a month.', 'Press Download PDF to save it.'],
    note: 'It shows your attendance, tasks, time tracked and changes. You cannot change anything in it.',
    goTo: at('/reports', 'Open Monthly Report'),
    related: ['report-live', 'report-how'],
    admin: {
      q: 'How do I see employees’ monthly reports?',
      steps: ['Open Monthly Report under More.', 'Pick the month. Each employee has a row: View opens their report, PDF downloads it.', 'Filter by company or name, or press Download all (ZIP) for everyone listed.'],
      note: 'Reports exist for employees. Heads and clients do not get one.'
    }
  },
  {
    id: 'report-live',
    category: 'report',
    for: TEAM,
    q: 'Why do the numbers change? When is a month final?',
    text: 'The current month is a live preview and updates as you work. A finished month is frozen on the 1st, so it never changes afterwards, whatever happens to tasks later.',
    goTo: at('/reports', 'Open Monthly Report'),
    related: ['report-how']
  },
  {
    id: 'report-how',
    category: 'report',
    for: TEAM,
    q: 'How are login time, late tasks and time tracked worked out?',
    steps: [
      'Login time is when you first set your status that day.',
      'A task is Early, On time or Late by comparing its approval date with its due date. A task not approved after its due date shows as Overdue; one still open before it is Pending.',
      'Time tracked is the timer time that started that month, counted on the day each session started.'
    ],
    related: ['report-live', 'tasks-timer-start']
  },

  // ============================================================= Settings and shortcuts
  {
    id: 'settings-where',
    category: 'settings',
    for: TEAM,
    q: 'Where are my settings?',
    text: 'Click your avatar at the top right. The menu lists your own settings (profile, password, notifications, Focus mode, appearance, connected apps, shortcuts, help) and, for admins, the admin ones. Settings is also under More.',
    goTo: at('/settings/profile', 'Open Settings'),
    related: ['settings-profile', 'settings-look']
  },
  {
    id: 'settings-profile',
    category: 'settings',
    for: ALL,
    q: 'How do I change my photo, name or job title?',
    steps: [
      'Open Settings, then My profile.',
      'Press Change picture: upload a photo (up to 2 MB) or pick an emoji, an icon or your initials.',
      'Edit your name, job title and phone, then save. Your email can only be changed by an admin.'
    ],
    goTo: at('/settings/profile', 'Open My profile'),
    related: ['settings-password']
  },
  {
    id: 'settings-password',
    category: 'settings',
    for: ALL,
    q: 'How do I change my password?',
    steps: ['Open Settings, then Change password.', 'Enter your current password and your new one, then confirm.'],
    goTo: at('/settings/password', 'Change my password'),
    related: ['start-forgot']
  },
  {
    id: 'settings-look',
    category: 'settings',
    for: ALL,
    q: 'How do I change the colours or the spacing?',
    steps: [
      'Open Settings, then Appearance.',
      'Pick a colour theme, or press + to build your own. A custom theme can be edited or deleted later.',
      'Choose Comfortable or Compact spacing.'
    ],
    note: 'It applies at once and is saved on your account, so it follows you to other devices. When an admin runs a Festival theme, you see its banner and can switch back to your own.',
    goTo: at('/settings/appearance', 'Open Appearance'),
    related: ['admin-festival']
  },
  {
    id: 'settings-shortcuts',
    category: 'settings',
    for: TEAM,
    q: 'Which keyboard shortcuts are there?',
    steps: [
      'Ctrl+K (⌘K): search and jump to anything.',
      '?: show the list of shortcuts.',
      'g then h, i, c, t, p, k, o or s: go to Home, Inbox, Chats, Tasks, Projects, Calendar, Office board or Settings.',
      'Enter sends a chat message. Shift+Enter starts a new line.',
      'Esc closes a dialog or menu.'
    ],
    note: 'Shortcuts pause while you are typing in a box.',
    goTo: at('/settings/shortcuts', 'Open Keyboard shortcuts'),
    related: ['start-search', 'start-tips']
  },

  // ============================================================= Deleting and cancelling
  {
    id: 'del-confirm',
    category: 'deleting',
    for: ALL,
    q: 'Why does everything ask me to confirm?',
    text: 'Creating, changing and deleting always ask first and show a message when done, so nothing happens by accident. Deleting asks you to hold the red Delete pill for about a second. Letting go early cancels it.',
    related: ['del-undo']
  },
  {
    id: 'del-undo',
    category: 'deleting',
    for: TEAM,
    q: 'I deleted something by mistake. Can I get it back?',
    text: 'Usually yes. Deleted tasks, subfolders, projects, chat messages (deleted for everyone), requirements, mid-way changes and office posts are kept in Trash for 30 days, files included.',
    steps: ['Ask an admin.', 'They open Settings, then Trash, find it and press Restore.'],
    note: 'Things that are not kept: deleted notifications, and cancelled leave requests stay listed as Cancelled instead.',
    related: ['del-who', 'admin-trash'],
    admin: {
      q: 'How do I restore something that was deleted?',
      steps: ['Open Settings, then Trash.', 'Filter by kind if you like, find the item and press Restore.', 'It returns with its files. If what it lived in is gone, restore that first.'],
      goTo: at('/settings/trash', 'Open Trash')
    }
  },
  {
    id: 'del-cancel',
    category: 'deleting',
    for: TEAM,
    q: 'How do I undo or cancel things?',
    steps: [
      'A timer: press pause.',
      'A message not sent yet: open Scheduled messages (clock icon in the chat) and cancel it.',
      'A sent message: Delete for me, or Delete for everyone for your own.',
      'A booking: press the cancel icon on it in the calendar.',
      'A leave or WFH request: Cancel request on the Leave page (approved ones only before they start).',
      'A task you made: delete it from the task.',
      'A requirement, mid-way change or office post you wrote: delete it from where it is shown.',
      'A notification: Delete it in your Inbox.'
    ],
    related: ['leave-cancel', 'chat-schedule', 'cal-cancel', 'del-who']
  },
  {
    id: 'del-who',
    category: 'deleting',
    for: TEAM,
    q: 'Who can delete what?',
    steps: [
      'Projects and subfolders: admins only.',
      'Tasks: whoever made it, the subfolder’s heads and admins.',
      'Requirements, mid-way changes, comments and office posts: the person who wrote them. Admins can delete any.',
      'Chat messages: your own, for yourself or for everyone. A chat group: the person who created it.',
      'Essentials items: whoever added it, heads and admins.'
    ],
    related: ['del-undo', 'del-confirm']
  },

  // ============================================================= Admin tools
  {
    id: 'admin-people',
    category: 'admin',
    for: ['admin'],
    q: 'How do I add or manage team members?',
    steps: [
      'Open Team Members (under More).',
      'Add a member with their name, email, role (employee or client) and company. They get a temporary password and choose their own the first time they sign in.',
      'For someone already there, edit their details, Reset password, or Deactivate and Reactivate.',
      'Sort any column, or search. Team Attendance shows who was present each day.'
    ],
    note: 'A deactivated person cannot sign in, but their work stays. Reset password gives them a temporary one.',
    goTo: at('/users', 'Open Team Members'),
    related: ['admin-security', 'start-forgot']
  },
  {
    id: 'admin-projects',
    category: 'admin',
    for: ['admin'],
    q: 'How do I create a project and appoint heads?',
    steps: [
      'Open Projects and press New project.',
      'Create the first subfolder and appoint its heads and members. Later, heads can add more subfolders.',
      'Add people to a subfolder with Edit subfolder.'
    ],
    goTo: at('/projects', 'Open Projects'),
    related: ['sub-structure', 'sub-members', 'sub-delete']
  },
  {
    id: 'admin-companies',
    category: 'admin',
    for: ['admin'],
    q: 'How do I add or rename a company?',
    steps: ['Open Settings, then Companies.', 'Type a name and add it, or rename an existing company.'],
    note: 'People and projects belong to companies. Calendars, shared subfolders and Google settings follow the company.',
    goTo: at('/settings/companies', 'Open Companies'),
    related: ['admin-people']
  },
  {
    id: 'admin-workspace',
    category: 'admin',
    for: ['admin'],
    q: 'How do I set working hours, holidays and weekly offs?',
    steps: [
      'Open Settings, then Workspace settings.',
      'Set the workspace name and logo, and when the working day starts and ends. Meetings can only be booked in these hours.',
      'Add holidays (days the office is closed). Nobody can book time on them.',
      'Set the weekly off days. They show as a holiday band on every calendar and nobody is asked for a daily status on them.'
    ],
    goTo: at('/settings/workspace', 'Open Workspace settings'),
    related: ['cal-book', 'status-off-days']
  },
  {
    id: 'admin-festival',
    category: 'admin',
    for: ['admin'],
    q: 'How do I give everyone a festival theme?',
    steps: ['Open Settings, then Festival theme.', 'Pick a festival preset, or Custom festival to name it and choose the colours.', 'Set the dates and save.'],
    note: 'Between the dates everyone, clients too, gets the theme and a small banner. People can switch back to their own theme, and it ends by itself.',
    goTo: at('/settings/festival', 'Open Festival theme'),
    related: ['settings-look']
  },
  {
    id: 'admin-trash',
    category: 'admin',
    for: ['admin'],
    q: 'What is in the Trash and for how long?',
    text: 'Deleted tasks, subfolders, projects, chat messages, requirements, mid-way changes and office posts wait here for 30 days and can be restored with their files. After 30 days they are removed for good, files included.',
    goTo: at('/settings/trash', 'Open Trash'),
    related: ['del-undo', 'sub-delete']
  },
  {
    id: 'admin-export',
    category: 'admin',
    for: ['admin'],
    q: 'How do I export data?',
    steps: ['Open Settings, then Export.', 'Choose Tasks, Daily status or Deliverables, narrow it with the filters if you like, and download the CSV.'],
    goTo: at('/settings/export', 'Open Export'),
    related: ['report-view']
  },
  {
    id: 'admin-security',
    category: 'admin',
    for: ['admin'],
    q: 'How do I sign someone out of a device?',
    steps: ['Open Settings, then Security to see who is signed in and on which device.', 'End one sign-in, or sign the person out everywhere. That device is logged out at once.'],
    note: 'You can also sign a person out everywhere from Team Members.',
    goTo: at('/settings/security', 'Open Security'),
    related: ['admin-people']
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
    category: 'approvals',
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
    category: 'calendar',
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
