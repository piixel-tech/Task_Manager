import { useEffect } from 'react';
import { notificationService } from '../../services';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { NOTIFICATION_CHECK_INTERVAL_MS, runNotificationChecks } from './notificationChecks';

/**
 * Keeps the bell in sync for the signed-in employee:
 * loads the list, listens for new notifications, and runs the date-based
 * checks on app load and every 5 minutes.
 */
export function useNotificationSync(): void {
  const user = useAuthStore((state) => state.user);
  const userId = user?.id;
  const isEmployee = user?.role === 'employee';

  useEffect(() => {
    const { fetchNotifications, clear } = useNotificationStore.getState();

    if (!userId || !isEmployee) {
      clear();
      return;
    }

    fetchNotifications(userId);

    // Refresh whenever a notification is added or read anywhere in the app.
    const unsubscribe = notificationService.subscribe(() => {
      useNotificationStore.getState().fetchNotifications(userId);
    });

    // Date-based checks: on load, then every 5 minutes.
    runNotificationChecks(user);
    const interval = setInterval(() => {
      runNotificationChecks(useAuthStore.getState().user);
    }, NOTIFICATION_CHECK_INTERVAL_MS);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isEmployee]);
}
