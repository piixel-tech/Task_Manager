import { useCallback, useEffect, useState, useMemo } from 'react';
import { projectService } from '../services';
import { useAuthStore } from '../store/authStore';
import { socket } from '../services/socket';
import { reviewApi } from '../services/http/reviewApi';
import { useTaskStore } from '../store/useTaskStore';
import { useOfficeStore } from '../store/useOfficeStore';
import { useChatStore } from '../store/useChatStore';
import { officeApi } from '../services/http/officeApi';

export interface NavCounts {
  tasks: number;
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

  useEffect(() => {
    loadPending();
    return socket.on('notification', (n: { type?: string }) => n?.type?.startsWith('review_') && loadPending());
  }, [loadPending]);

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
      projects: projectsCount,
      unreadChats,
      pendingSubmissions,
      overdue: overdueCount,
      officeUnseen
    };
  }, [user, tasks, projectsCount, unreadChats, pendingSubmissions, officeUnseen]);

  return counts;
}
