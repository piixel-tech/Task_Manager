import React, { useEffect, useState } from 'react';
import { Flame, Trophy } from 'lucide-react';
import { gamificationService } from '../../../services';
import type { UserGamification } from '../../../types';
import { useAuthStore } from '../../../store/authStore';

export const UserLevelBadge: React.FC = () => {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<UserGamification | null>(null);

  useEffect(() => {
    if (!user) return;
    gamificationService.getUserGamification(user.id).then(setStats).catch(console.error);
  }, [user]);

  if (!user || !stats) return null;

  const nextLevelPoints = stats.level === 'Rookie' ? 50 : stats.level === 'Pro' ? 200 : 500;
  const currentLevelMin = stats.level === 'Rookie' ? 0 : stats.level === 'Pro' ? 50 : 200;
  const progressPercent = Math.min(
    100,
    Math.max(0, ((stats.points - currentLevelMin) / (nextLevelPoints - currentLevelMin)) * 100)
  );

  const levelColor =
    stats.level === 'Legend'
      ? 'from-[var(--tm-warning)] to-[var(--tm-warning)] text-[var(--tm-on-primary)] shadow-soft'
      : stats.level === 'Pro'
      ? 'from-[var(--tm-primary)] to-[var(--tm-primary)] text-[var(--tm-on-primary)] shadow-soft'
      : 'from-[var(--tm-primary)] to-[var(--tm-primary)] text-[var(--tm-on-primary)] shadow-soft';

  return (
    <div className="flex items-center gap-3 bg-[rgba(36,26,51,0.32)] backdrop-blur-md px-3.5 py-1.5 rounded-full border border-[var(--tm-border-strong)] text-xs shadow-inner">
      {/* Streak Counter */}
      <div className="flex items-center gap-1 text-[var(--tm-warning)] font-bold" title={`${stats.streak} day productive streak`}>
        <Flame className="w-4 h-4 text-[var(--tm-warning)] fill-[var(--tm-warning)] animate-pulse" />
        <span>{stats.streak}d</span>
      </div>

      <div className="h-3 w-px bg-[var(--tm-ink)]" />

      {/* Points & Level */}
      <div className="flex items-center gap-2">
        <div className={`px-2 py-0.5 rounded-full bg-gradient-to-r ${levelColor} text-[10px] font-extrabold uppercase tracking-wider shadow-soft-xs flex items-center gap-1`}>
          <Trophy className="w-3 h-3" />
          {stats.level}
        </div>
        <div className="font-semibold text-[var(--tm-ink-muted)]">
          {stats.points} <span className="text-[10px] text-[var(--tm-ink-muted)] font-normal">pts</span>
        </div>
      </div>

      {/* Progress Bar */}
      {stats.level !== 'Legend' && (
        <div className="w-12 bg-[var(--tm-ink)] h-1.5 rounded-full overflow-hidden hidden sm:block" title={`${stats.points}/${nextLevelPoints} pts to next level`}>
          <div
            className="h-full bg-gradient-to-r from-[var(--tm-success)] to-[var(--tm-success-bg)] rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
};
