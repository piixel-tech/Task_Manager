/**
 * The first-login tour: six short steps, worded separately for the admin panel and the employee panel. Each step points at a real
 * part of the screen (a `data-tour` mark, or the link to a page). If a part is not on screen (a phone has no left rail), the step is
 * shown in the middle of the screen instead.
 */
export type TourRole = 'admin' | 'employee';

export interface TourStep {
  id: string;
  /** CSS selector of what to point at; the first one that is visible is used. */
  target: string;
  title: string;
  text: string;
}

/** Saved on the account when the tour is finished or skipped. Raise the number to show an updated tour again. */
export const TOUR_ID: Record<TourRole, string> = { admin: 'admin-1', employee: 'employee-1' };

const T = {
  rail: '[data-tour="rail"]',
  timer: '[data-tour="timer"]',
  tasks: 'a[href$="/tasks"]',
  chat: 'a[href$="/chat"]',
  status: '[data-tour="status"]',
  account: '[data-tour="account"]'
};

const EMPLOYEE: TourStep[] = [
  { id: 'rail', target: T.rail, title: 'Your shortcuts', text: 'Jump between Home, Projects, your tasks and chats from this bar. Hover any icon to see its name.' },
  { id: 'timer', target: T.timer, title: 'Your timer', text: 'Press the round play button on a task and the time is tracked here. Click this to pause, resume or open the task.' },
  { id: 'tasks', target: T.tasks, title: 'My Tasks', text: 'Everything assigned to you, grouped by what needs attention first. Open one to submit it for review.' },
  { id: 'chat', target: T.chat, title: 'Chats', text: 'Talk with your team and clients. Type @ to mention someone, or turn a message into a task.' },
  { id: 'status', target: T.status, title: 'Daily status', text: 'Tell the team how you are working today. You can change it any time during the day.' },
  { id: 'account', target: T.account, title: 'Settings and help', text: 'Your profile, notifications, Focus mode and Help live in this menu. You can replay this tour from Help.' }
];

const ADMIN: TourStep[] = [
  { id: 'rail', target: T.rail, title: 'Your shortcuts', text: 'Jump between Home, Projects, the Task Hub and chats from this bar. Hover any icon to see its name.' },
  { id: 'timer', target: T.timer, title: 'Your timer', text: 'Press the round play button on a task and the time is tracked here. Click this to pause, resume or open the task.' },
  { id: 'tasks', target: T.tasks, title: 'Task Hub', text: 'Every task in every project, including who is working on what. Filter by project, person or status.' },
  { id: 'chat', target: T.chat, title: 'Chats', text: 'Talk with the team and with clients, and send clients yes-or-no approval requests.' },
  { id: 'status', target: T.status, title: 'Daily status', text: 'Set how you are working today. Everyone sees it, and yours counts in the monthly report.' },
  { id: 'account', target: T.account, title: 'Settings and admin tools', text: 'People, companies, workspace hours, Trash, export and Help are in this menu. You can replay this tour from Help.' }
];

export const tourFor = (role: string | undefined): TourStep[] | null => (role === 'admin' ? ADMIN : role === 'employee' ? EMPLOYEE : null);
export const tourIdFor = (role: string | undefined): string | null => (role === 'admin' || role === 'employee' ? TOUR_ID[role] : null);
