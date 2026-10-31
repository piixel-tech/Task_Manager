import { useCallback, useEffect, useState, useMemo } from 'react';
import { projectService } from '../services';
import { useAuthStore } from '../store/authStore';
import { socket } from '../services/socket';
import { reviewApi } from '../services/http/reviewApi';
import { useTaskStore } from '../store/useTaskStore';
import { useOfficeStore } from '../store/useOfficeStore';
import { useChatStore } from '../store/useChatStore';
import { officeApi } from '../services/http/officeApi';
import { taskApi } from '../services/http/taskApi';

export interface NavCounts {
  tasks: number;
  /** Tasks handed to you by someone else that you haven't opened. */
  tasksUnseen: number;
  projects: number;
  unreadChats: number;
  pendingSubmissions: number;
  overdue: number;
  /** Office board posts you haven't seen. */
  officeUnseen: number;
}

const EMPTY: NavCounts = {
  officeUnseen: 0,
  tasks: 0,
  tasksUnseen: 0,
  projects: 0,
  unreadChats: 0,
  pendingSubmissions: 0,
  overdue: 0
};

export function useNavCounts(): NavCounts {
  const { user } = useAuthStore();
  const tasks = useTaskStore((state) => state.tasks);

  const [projectsCount, setProjectsCount] = useState(0);
  // Unread chat messages across every group, kept live by useChatRealtime.
  const unreadChats = useChatStore((s) => s.groups.reduce((n, g) => n + g.unread_count, 0));
  const [pendingSubmissions, setPendingSubmissions] = useState(0);
  const [tasksUnseen, setTasksUnseen] = useState(0);

  useEffect(() => {
    if (!user) return;
    projectService.getProjects().then((pList) => {
      setProjectsCount(pList.filter((p) => p.status !== 'completed').length);
    }).catch(() => {});

  }, [user]);

  // Reviews waiting on this person (every pending review for admins), kept fresh by live notifications.
  const loadPending = useCallback(() => {
    if (!user || user.role === 'client') return;
    reviewApi.pendingCount().then(setPendingSubmissions).catch(() => {});
  }, [user]);

  const loadUnseen = useCallback(() => {
    if (!user || user.role === 'client') return;
    taskApi.unseenCount().then(setTasksUnseen).catch(() => {});
  }, [user]);

  useEffect(() => {
    loadPending();
    loadUnseen();
    const offSocket = socket.on('notification', (n: { type?: string }) => {
      if (n?.type?.startsWith('review_')) loadPending();
      if (n?.type?.startsWith('task_')) loadUnseen();
    });
    // Opening a task or deciding a review recounts straight away; coming back to the tab catches the rest.
    const recount = () => {
      loadPending();
      loadUnseen();
    };
    window.addEventListener('tm:nav-counts', recount);
    window.addEventListener('focus', recount);
    return () => {
      offSocket();
      window.removeEventListener('tm:nav-counts', recount);
      window.removeEventListener('focus', recount);
    };
  }, [loadPending, loadUnseen]);

  // Unseen office posts (the board and dashboard card keep the same store up to date as you read).
  const officeUnseen = useOfficeStore((s) => s.unseen);
  const setOfficeUnseen = useOfficeStore((s) => s.setUnseen);
  const loadOffice = useCallback(() => {
    if (!user || user.role === 'client') return;
    officeApi.summary().then((s) => setOfficeUnseen(s.unseen_count)).catch(() => {});
  }, [user, setOfficeUnseen]);

  useEffect(() => {
    loadOffice();
    return socket.on('notification', (n: { type?: string }) => n?.type?.startsWith('office_') && loadOffice());
  }, [loadOffice]);

  const counts = useMemo(() => {
    if (!user) return EMPTY;
    const isAdmin = user.role === 'admin';
    const userTasks = tasks.filter((t) => isAdmin || t.assignedUserId === user.id);
    const today = new Date().setHours(0, 0, 0, 0);

    const remainingTasksCount = userTasks.filter((t) => t.status !== 'completed').length;
    const overdueCount = userTasks.filter(
      (t) =>
        t.status !== 'completed' &&
        !!t.dueDate &&
        new Date(t.dueDate).setHours(0, 0, 0, 0) < today
    ).length;

    return {
      tasks: remainingTasksCount,
      tasksUnseen,
      projects: projectsCount,
      unreadChats,
      pendingSubmissions,
      overdue: overdueCount,
      officeUnseen
    };
  }, [user, tasks, projectsCount, unreadChats, pendingSubmissions, tasksUnseen, officeUnseen]);

  return counts;
}
