import { useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { toast } from '../../store/useToastStore';
import { stripEmoji } from './notificationVisuals';
import { socket } from '../../services/socket';
import { amFocused } from '../../store/useFocusStore';
import { useFocusSync } from '../focus/useFocusSync';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useMutesStore } from '../../store/useMutesStore';
import { router } from '../../app/router';
import { playNotificationSound, showDesktopNotification } from './notificationAlerts';
import { toNotification, type ApiNotification } from '../../services/http/notificationApi';
import { enablePush, listenForPushNavigation } from './webPush';

/**
 * Keeps the bell in sync for the signed-in user: loads the list and badge,
 * opens the WebSocket, and turns live "notification" events into a toast
 * plus a badge bump. Disconnects on logout.
 */
export function useNotificationSync(): void {
  const userId = useAuthStore((state) => state.user?.id);
  useFocusSync();

  // This person's saved appearance and notification choices apply as soon as they are known.
  useEffect(() => {
    if (userId) useSettingsStore.getState().init(useAuthStore.getState().user?.settings);
    else useSettingsStore.getState().reset();
  }, [userId]);

  useEffect(() => {
    const { fetchNotifications, addLive, clear } = useNotificationStore.getState();

    if (!userId) {
      clear();
      return;
    }

    fetchNotifications();
    void useMutesStore.getState().load();
    void enablePush(); // system notifications even when the tab is closed
    const offPushClick = listenForPushNavigation((url) => void router.navigate(url));

    // The subscription can expire or be replaced by the browser: check it again when the person returns, at most every 10 minutes.
    let lastPushCheck = Date.now();
    const onFocus = () => {
      if (Date.now() - lastPushCheck < 10 * 60_000) return;
      lastPushCheck = Date.now();
      void enablePush();
    };
    window.addEventListener('focus', onFocus);

    // After the socket drops and comes back (Render waking up, wifi change, sleep) reload what was missed meanwhile.
    let firstOpen = true;
    const offReconnected = socket.on('socket:reconnected', () => {
      if (firstOpen) firstOpen = false;
      else fetchNotifications();
    });

    const off = socket.on('notification', (data: ApiNotification) => {
      const notification = toNotification(data);
      addLive(notification);
      // In Focus mode the server sends nothing live; this covers a notification already in flight.
      if (!amFocused()) {
        const title = stripEmoji(notification.title);
        const message = stripEmoji(notification.message);
        toast.info(title, message, notification.link || undefined, notification);
        // Sound and OS popup are for other people's actions, not the ones I just did myself.
        if (notification.actor?.id !== userId) {
          playNotificationSound(notification.priority);
          showDesktopNotification(title, message, () => notification.link && router.navigate(notification.link), notification.id);
        }
      }
    });
    // An admin ended this sign-in: leave straight away instead of waiting for the next request to fail.
    const offRevoked = socket.on('session:revoked', () => {
      toast.error('You were signed out', 'An admin ended this session.');
      void useAuthStore.getState().logout();
    });
    socket.connect();

    return () => {
      off();
      offRevoked();
      offPushClick();
      offReconnected();
      window.removeEventListener('focus', onFocus);
      socket.disconnect();
    };
  }, [userId]);
}
