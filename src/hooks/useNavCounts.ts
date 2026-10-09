import { useEffect, useState, useMemo } from 'react';
import {
  chatService,
  projectService
} from '../services';
import { useAuthStore } from '../store/authStore';
import { useTaskStore } from '../store/useTaskStore';

export interface NavCounts {
  tasks: number;
  projects: number;
  unreadChats: number;
  pendingSubmissions: number;
  overdue: number;
}

const EMPTY: NavCounts = {
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
  const [unreadChats, setUnreadChats] = useState(0);
  const [pendingSubmissions, setPendingSubmissions] = useState(0);

  useEffect(() => {
    if (!user) return;
    const isAdmin = user.role === 'admin';

    projectService.getProjects(undefined, isAdmin ? undefined : user.id).then((pList) => {
      setProjectsCount(pList.filter((p) => p.status !== 'completed').length);
    }).catch(() => {});

    chatService.getChatRooms(user.id).then((rList) => {
      setUnreadChats(rList.filter((r) => !!r.lastMessage && !r.revoked).length);
    }).catch(() => {});

    if (isAdmin) {
      import('../services').then(({ taskService }) => {
        taskService.getSubmissionsFeed().then((subs) => {
          setPendingSubmissions(subs.filter((s) => s.submission.status === 'pending').length);
        });
      });
    }
  }, [user]);

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
      overdue: overdueCount
    };
  }, [user, tasks, projectsCount, unreadChats, pendingSubmissions]);

  return counts;
}
