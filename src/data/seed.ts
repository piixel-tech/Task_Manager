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
  },
  {
    id: 'usr_1',
    name: 'Rahul Verma',
    jobTitle: 'SEO Executive',
    company: 'piixel',
    role: 'employee',
    loginId: 'rahul-piixel@seo-executive',
    password: 'password123',
    mustChangePassword: true,
    active: true,
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
    birthday: '05-15',
    joiningDate: '2022-03-01'
  },
  {
    id: 'usr_2',
    name: 'Priya Patel',
    jobTitle: 'UI UX Designer',
    company: 'piixel',
    role: 'employee',
    loginId: 'priya-piixel@ui-ux-designer',
    password: 'password123',
    mustChangePassword: false,
    active: true,
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
    birthday: '10-08',
    joiningDate: '2023-01-15'
  },
  {
    id: 'usr_3',
    name: 'Vikram Singh',
    jobTitle: 'Fullstack Developer',
    company: 'unwork',
    role: 'employee',
    loginId: 'vikram-unwork@fullstack-developer',
    password: 'password123',
    mustChangePassword: false,
    active: true,
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80',
    birthday: '11-20',
    joiningDate: '2024-10-08'
  },
  {
    id: 'usr_4',
    name: 'Sneha Reddy',
    jobTitle: 'Content Writer',
    company: 'unwork',
    role: 'employee',
    loginId: 'sneha-unwork@content-writer',
    password: 'password123',
    mustChangePassword: false,
    active: true,
    avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&q=80',
    birthday: '04-12',
    joiningDate: '2023-06-10'
  },
  {
    id: 'usr_5',
    name: 'Amit Kumar',
    jobTitle: 'Frontend Developer',
    company: 'piixel',
    role: 'employee',
    loginId: 'amit-piixel@frontend-developer',
    password: 'password123',
    mustChangePassword: false,
    active: true,
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&q=80',
    birthday: '08-30',
    joiningDate: '2022-09-15'
  },
  {
    id: 'usr_6',
    name: 'Riya Gupta',
    jobTitle: 'Digital Marketer',
    company: 'unwork',
    role: 'employee',
    loginId: 'riya-unwork@digital-marketer',
    password: 'password123',
    mustChangePassword: false,
    active: true,
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80'
  }
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'prj_1',
    name: 'Piixel Brand Identity & Web Redesign',
    description: 'Complete overhaul of Piixel design systems, website landing pages, and component libraries.',
    company: 'piixel',
    status: 'in_progress',
    assignedUserIds: ['usr_2', 'usr_5'],
    memberIds: ['usr_1', 'usr_2', 'usr_5', 'usr_ceo'],
    deadline: '2026-11-15',
    createdAt: '2026-09-01T09:00:00.000Z'
  },
  {
    id: 'prj_2',
    name: 'Unwork NextGen Workspace SaaS',
    description: 'Developing the cloud workspace automation platform for remote team productivity.',
    company: 'unwork',
    status: 'in_progress',
    assignedUserIds: ['usr_3', 'usr_4', 'usr_6'],
    memberIds: ['usr_1', 'usr_3', 'usr_4', 'usr_6', 'usr_ceo'],
    deadline: '2026-12-01',
    createdAt: '2026-09-10T10:00:00.000Z'
  },
  {
    id: 'prj_3',
    name: 'Cross-Brand AI Search Engine Optimization',
    description: 'Multi-channel SEO, generative search optimization, and marketing growth strategy.',
    company: 'both',
    status: 'planning',
    assignedUserIds: ['usr_1', 'usr_6', 'usr_ceo'],
    memberIds: ['usr_1', 'usr_2', 'usr_3', 'usr_4', 'usr_5', 'usr_6', 'usr_ceo'],
    deadline: '2026-10-30',
    createdAt: '2026-09-20T11:00:00.000Z'
  }
];

export const INITIAL_TASKS: Task[] = [
  {
    id: 'tsk_1',
    projectId: 'prj_1',
    title: 'Figma Design Tokens & UI Kit',
    description: 'Design dark/light mode tokens, typography scale, buttons, and form primitives in Figma.',
    status: 'completed',
    priority: 'high',
    assignedUserId: 'usr_2',
    dueDate: '2026-10-12',
    estimatedHours: 24,
    loggedHours: 24,
    createdAt: '2026-10-01T09:30:00.000Z',
    sessions: [
      {
        id: 'ts_1',
        taskId: 'tsk_1',
        userId: 'usr_2',
        startTime: '2026-10-02T09:00:00.000Z',
        endTime: '2026-10-02T17:00:00.000Z',
        durationMinutes: 480
      }
    ],
    submissions: [
      {
        id: 'sub_1',
        taskId: 'tsk_1',
        userId: 'usr_2',
        notes: 'Figma component kit completed and ready for dev handoff.',
        submittedAt: '2026-10-05T16:00:00.000Z',
        status: 'approved'
      }
    ]
  },
  {
    id: 'tsk_2',
    projectId: 'prj_1',
    title: 'Implement Responsive Navbar & Sidebar Components',
    description: 'Build Tailwind UI layout wrapper with mobile drawer and active route indicator.',
    status: 'in_progress',
    priority: 'high',
    assignedUserId: 'usr_5',
    dueDate: '2026-10-15',
    estimatedHours: 16,
    loggedHours: 6,
    createdAt: '2026-10-03T11:00:00.000Z',
    sessions: [],
    submissions: []
  },
  {
    id: 'tsk_3',
    projectId: 'prj_2',
    title: 'Database Schema & Supabase Auth Integration',
    description: 'Configure Row Level Security rules, user profiles, and session handling APIs.',
    status: 'in_progress',
    priority: 'urgent',
    assignedUserId: 'usr_3',
    dueDate: '2026-10-18',
    estimatedHours: 32,
    loggedHours: 18,
    createdAt: '2026-10-04T10:00:00.000Z',
    sessions: [],
    submissions: []
  },
  {
    id: 'tsk_4',
    projectId: 'prj_2',
    title: 'Product Landing Page Copywriting',
    description: 'Craft high-converting headlines, feature highlights, and customer testimonial copy.',
    status: 'review',
    priority: 'medium',
    assignedUserId: 'usr_4',
    dueDate: '2026-10-14',
    estimatedHours: 12,
    loggedHours: 12,
    createdAt: '2026-10-04T14:00:00.000Z',
    sessions: [],
    submissions: [
      {
        id: 'sub_2',
        taskId: 'tsk_4',
        userId: 'usr_4',
        notes: 'Submitted draft V1 for team review.',
        submittedAt: '2026-10-07T15:30:00.000Z',
        status: 'pending'
      }
    ]
  },
  {
    id: 'tsk_5',
    projectId: 'prj_3',
    title: 'Audit Competitor Keywords & Backlink Profile',
    description: 'Analyze top 10 SERP competitors and produce targeted keyword gap report.',
    status: 'todo',
    priority: 'high',
    assignedUserId: 'usr_1',
    dueDate: '2026-10-20',
    estimatedHours: 18,
    loggedHours: 0,
    createdAt: '2026-10-06T09:00:00.000Z',
    sessions: [],
    submissions: []
  },
  {
    id: 'tsk_6',
    projectId: 'prj_3',
    title: 'Q4 Digital Marketing Campaign Plan',
    description: 'Outline LinkedIn and Twitter ad budgets, content calendar, and conversion tracking.',
    status: 'todo',
    priority: 'low',
    assignedUserId: 'usr_6',
    dueDate: '2026-10-25',
    estimatedHours: 20,
    loggedHours: 0,
    createdAt: '2026-10-06T13:00:00.000Z',
    sessions: [],
    submissions: []
  }
];

export const INITIAL_HOLIDAYS: Holiday[] = [
  { id: 'hol_1', title: 'New Year Day', date: '2026-01-01', type: 'national' },
  { id: 'hol_2', title: 'Republic Day', date: '2026-01-26', type: 'national' },
  { id: 'hol_3', title: 'Piixel Annual Foundation Day', date: '2026-05-15', type: 'company' },
  { id: 'hol_4', title: 'Independence Day', date: '2026-08-15', type: 'national' },
  { id: 'hol_5', title: 'Unwork Innovation Summit', date: '2026-09-20', type: 'company' },
  { id: 'hol_6', title: 'Diwali Celebration', date: '2026-11-01', type: 'national' }
];

export const INITIAL_ATTENDANCE: AttendanceDay[] = [
  {
    id: 'att_1',
    userId: 'usr_2',
    date: '2026-10-08',
    status: 'present',
    punchSessions: [
      {
        id: 'ps_1',
        punchIn: '2026-10-08T09:15:00.000Z',
        breaks: [
          {
            id: 'bs_1',
            breakStart: '2026-10-08T13:00:00.000Z',
            breakEnd: '2026-10-08T13:45:00.000Z',
            type: 'lunch'
          }
        ]
      }
    ],
    totalHours: 4.5
  },
  {
    id: 'att_2',
    userId: 'usr_3',
    date: '2026-10-08',
    status: 'present',
    punchSessions: [
      {
        id: 'ps_2',
        punchIn: '2026-10-08T09:00:00.000Z',
        breaks: []
      }
    ],
    totalHours: 5.2
  }
];

export const INITIAL_CHAT_ROOMS: ChatRoom[] = [
  {
    id: 'room_gen',
    name: 'General Company Hub',
    type: 'group',
    participantIds: ['usr_ceo', 'usr_1', 'usr_2', 'usr_3', 'usr_4', 'usr_5', 'usr_6'],
    lastMessage: 'Welcome to the updated Task Manager portal!',
    updatedAt: '2026-10-08T08:00:00.000Z'
  },
  {
    id: 'room_piixel',
    name: 'Piixel Team Hub',
    type: 'group',
    participantIds: ['usr_ceo', 'usr_1', 'usr_2', 'usr_5'],
    lastMessage: 'Design tokens look great Priya!',
    updatedAt: '2026-10-07T16:30:00.000Z'
  },
  {
    id: 'room_unwork',
    name: 'Unwork Devs & Growth',
    type: 'group',
    participantIds: ['usr_ceo', 'usr_3', 'usr_4', 'usr_6'],
    lastMessage: 'Database schema is almost ready.',
    updatedAt: '2026-10-07T14:20:00.000Z'
  }
];

export const INITIAL_MESSAGES: Message[] = [
  {
    id: 'msg_1',
    roomId: 'room_gen',
    senderId: 'usr_ceo',
    content: 'Welcome to the updated Task Manager portal!',
    timestamp: '2026-10-08T08:00:00.000Z'
  },
  {
    id: 'msg_2',
    roomId: 'room_piixel',
    senderId: 'usr_5',
    content: 'Design tokens look great Priya!',
    timestamp: '2026-10-07T16:30:00.000Z'
  },
  {
    id: 'msg_3',
    roomId: 'room_unwork',
    senderId: 'usr_3',
    content: 'Database schema is almost ready.',
    timestamp: '2026-10-07T14:20:00.000Z'
  }
];
