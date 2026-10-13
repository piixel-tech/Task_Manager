import type { User, Project, Task, AttendanceDay, Holiday, ChatRoom, Message } from '../types';

export const INITIAL_USERS: User[] = [
  {
    id: 'usr_ceo',
    name: 'Aarav Sharma',
    jobTitle: 'CEO',
    company: 'piixel',
    role: 'admin',
    loginId: 'aarav-piixel@ceo',
    password: 'password123',
    mustChangePassword: false,
    active: true,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
    birthday: '10-08',
    joiningDate: '2021-10-08'
  }
];

export const INITIAL_PROJECTS: Project[] = [];

export const INITIAL_TASKS: Task[] = [];

export const INITIAL_HOLIDAYS: Holiday[] = [];

export const INITIAL_ATTENDANCE: AttendanceDay[] = [];

export const INITIAL_CHAT_ROOMS: ChatRoom[] = [];

export const INITIAL_MESSAGES: Message[] = [];
