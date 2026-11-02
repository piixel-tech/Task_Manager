import { useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { isFestivalApplied, useFestivalStore } from '../../store/useFestivalStore';
import { applyAppearance, useSettingsStore } from '../../store/useSettingsStore';
import { socket } from '../../services/socket';
import { useCustomThemesStore } from '../../store/useCustomThemesStore';

const RECHECK_MS = 5 * 60_000;

/**
 * Keeps the festival theme in step: loads it when someone signs in, follows the admin publishing or ending it live,
 * re-checks now and then (it ends by itself after its end date), and re-applies the page's theme when it changes.
 */
export function useFestivalSync(): void {
  const userId = useAuthStore((s) => s.user?.id);
  const applied = useFestivalStore((s) => isFestivalApplied(s));
  const festivalId = useFestivalStore((s) => s.active?.id ?? null);
  const themesLoaded = useCustomThemesStore((s) => s.mine.length + s.team.length + (s.loaded ? 1000 : 0));

  useEffect(() => {
    if (!userId) return;
    const { load, expireIfOver } = useFestivalStore.getState();
    void load();
    void useCustomThemesStore.getState().load();
    const off = socket.on('festival:changed', () => void load());
    const offThemes = socket.on('themes:changed', () => void useCustomThemesStore.getState().load());
    const timer = setInterval(() => {
      expireIfOver();
      void load();
    }, RECHECK_MS);
    const visible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      off();
      offThemes();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [userId]);

  // Show the festival palette (or the person's own) whenever that changes.
  useEffect(() => {
    applyAppearance(useSettingsStore.getState().settings);
  }, [applied, festivalId, themesLoaded]);
}
