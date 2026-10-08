import { useEffect, useState } from 'react';
import {
  chatService,
  projectService,
  taskService
} from '../services';
import { useAuthStore } from '../store/authStore';

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

/**
 * Read-only badge counts for the sidebar. Pure derivation over the existing
 * services — no writes, no business-logic changes.
 */
export function useNavCounts(): NavCounts {
  const { user } = useAuthStore();
  const [counts, setCounts] = useState<NavCounts>(EMPTY);

  useEffect(() => {
    if (!user) {
      setCounts(EMPTY);
      return;
    }

    let alive = true;
    const isAdmin = user.role === 'admin';

    const load = async () => {
      try {
        const [tasks, projects, rooms, submissions] = await Promise.all([
          taskService.getTasks(undefined, isAdmin ? undefined : user.id),
          projectService.getProjects(undefined, isAdmin ? undefined : user.id),
          chatService.getChatRooms(user.id),
          isAdmin ? taskService.getSubmissionsFeed() : Promise.resolve([])
        ]);

        if (!alive) return;

        const today = new Date().setHours(0, 0, 0, 0);

        setCounts({
          tasks: tasks.filter((t) => t.status !== 'completed').length,
          projects: projects.filter((p) => p.status !== 'completed').length,
          unreadChats: rooms.filter(
            (r) => !!r.lastMessage && !r.revoked
          ).length,
          pendingSubmissions: submissions.filter((s) => s.submission.status === 'pending').length,
          overdue: tasks.filter(
            (t) =>
              t.status !== 'completed' &&
              !!t.dueDate &&
              new Date(t.dueDate).setHours(0, 0, 0, 0) < today
          ).length
        });
      } catch {
        if (alive) setCounts(EMPTY);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [user]);

  return counts;
}
