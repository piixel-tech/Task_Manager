import React, { useEffect, useState } from 'react';
import { Award, ShieldCheck, Zap, Heart, CheckCircle2, Plus } from 'lucide-react';
import { gamificationService, userService } from '../../../services';
import type { BadgeType, UserGamification, User } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';

interface BadgesGridProps {
  targetUserId?: string;
  showAwardButton?: boolean;
}

const ALL_BADGE_TYPES: { type: BadgeType; title: string; description: string; icon: React.ReactNode; color: string }[] = [
  {
    type: 'fastest_delivery',
    title: 'Fastest Delivery',
    description: 'Delivered a critical task significantly ahead of deadline',
    icon: <Zap className="w-5 h-5" />,
    color: 'from-[var(--tm-warning)] to-[var(--tm-warning)] text-white bg-[var(--tm-warning-bg)] border-[var(--tm-warning-ring)]'
  },
  {
    type: 'client_favourite',
    title: 'Client Favourite',
    description: 'Awarded by management for stellar client communication',
    icon: <Heart className="w-5 h-5 text-[var(--tm-danger)]" />,
    color: 'from-[var(--tm-danger)] to-[var(--tm-danger)] text-white bg-[var(--tm-danger-bg)] border-[var(--tm-danger-ring)]'
  },
  {
    type: 'helped_teammate',
    title: 'Helped a Teammate',
    description: 'Stepped in and completed an assigned task for a peer',
    icon: <Award className="w-5 h-5 text-[var(--tm-primary)]" />,
    color: 'from-[var(--tm-primary)] to-[var(--tm-primary)] text-white bg-[var(--tm-primary-softer)] border-[var(--tm-primary-soft)]'
  },
  {
    type: 'zero_revisions',
    title: 'Zero Revisions',
    description: 'Completed work with perfect quality on first submission',
    icon: <ShieldCheck className="w-5 h-5 text-[var(--tm-success)]" />,
    color: 'from-[var(--tm-success)] to-[var(--tm-success)] text-white bg-[var(--tm-success-bg)] border-[var(--tm-success-ring)]'
  }
];

export const BadgesGrid: React.FC<BadgesGridProps> = ({ targetUserId, showAwardButton = true }) => {
  const { user: currentUser } = useAuthStore();
  const { showToast } = useAppStore();

  const activeUserId = targetUserId || currentUser?.id;
  const isAdmin = currentUser?.role === 'admin';

  const [stats, setStats] = useState<UserGamification | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isAwardModalOpen, setIsAwardModalOpen] = useState(false);
  const [selectedUserToAward, setSelectedUserToAward] = useState('');
  const [selectedBadgeType, setSelectedBadgeType] = useState<BadgeType>('client_favourite');
  const [awardNote, setAwardNote] = useState('');

  const loadData = () => {
    if (!activeUserId) return;
    gamificationService.getUserGamification(activeUserId).then(setStats).catch(console.error);
    if (isAdmin) {
      userService.getUsers().then(u => {
        setUsers(u.filter(x => x.role === 'employee'));
        if (u.length > 0) setSelectedUserToAward(u[0].id);
      }).catch(console.error);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeUserId]);

  if (!stats) return null;

  const unlockedTypes = new Set(stats.badges.map((b) => b.badgeType));

  const handleAwardBadgeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserToAward) return;
    try {
      await gamificationService.awardBadge(
        selectedUserToAward,
        selectedBadgeType,
        currentUser?.name,
        awardNote.trim() || undefined
      );
      showToast(`Awarded ${selectedBadgeType.replace('_', ' ')} badge!`);
      setIsAwardModalOpen(false);
      setAwardNote('');
      loadData();
    } catch {
      showToast('Failed to award badge');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--tm-ink)] flex items-center gap-2">
            <Award className="w-4 h-4 text-[var(--tm-primary)]" /> Unlocked Achievement Badges
          </h3>
          <p className="text-xs text-[var(--tm-ink-muted)]">Collect badges by completing tasks cleanly and helping your team.</p>
        </div>
        {isAdmin && showAwardButton && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAwardModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Award Badge
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ALL_BADGE_TYPES.map((b) => {
          const isUnlocked = unlockedTypes.has(b.type);
          const userBadge = stats.badges.find((x) => x.badgeType === b.type);

          return (
            <div
              key={b.type}
              className={`p-4 rounded-2xl border transition-all relative overflow-hidden ${
                isUnlocked
                  ? 'bg-white border-[var(--tm-border)] shadow-sm'
                  : 'bg-[var(--tm-card-muted)] border-[var(--tm-border)] opacity-60 grayscale'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${b.color} shadow-sm`}>
                  {b.icon}
                </div>
                {isUnlocked ? (
                  <span className="text-[10px] bg-[var(--tm-success-bg)] text-[var(--tm-success)] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Unlocked
                  </span>
                ) : (
                  <span className="text-[10px] bg-[var(--tm-bg-sunken)] text-[var(--tm-ink-soft)] font-semibold px-2 py-0.5 rounded-full">
                    Locked
                  </span>
                )}
              </div>
              <h4 className="font-bold text-xs text-[var(--tm-ink)]">{b.title}</h4>
              <p className="text-[11px] text-[var(--tm-ink-muted)] mt-1">{b.description}</p>

              {userBadge?.note && (
                <div className="mt-2 text-[10px] bg-[var(--tm-primary-softer)] text-[var(--tm-primary-dark)] p-2 rounded-lg border border-[var(--tm-primary-soft)] italic">
                  "{userBadge.note}"
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Admin Award Badge Modal */}
      <Modal isOpen={isAwardModalOpen} onClose={() => setIsAwardModalOpen(false)} title="Award Recognition Badge">
        <form onSubmit={handleAwardBadgeSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-[var(--tm-ink-soft)] font-medium mb-1">Select Employee</label>
            <Select
              value={selectedUserToAward}
              onChange={(e) => setSelectedUserToAward(e.target.value)}
              options={users.map((u) => ({ value: u.id, label: `${u.name} (${u.jobTitle})` }))}
            />
          </div>

          <div>
            <label className="block text-[var(--tm-ink-soft)] font-medium mb-1">Select Badge Type</label>
            <Select
              value={selectedBadgeType}
              onChange={(e) => setSelectedBadgeType(e.target.value as BadgeType)}
              options={ALL_BADGE_TYPES.map((b) => ({ value: b.type, label: b.title }))}
            />
          </div>

          <div>
            <label className="block text-[var(--tm-ink-soft)] font-medium mb-1">Special Recognition Note (Optional)</label>
            <input
              type="text"
              value={awardNote}
              onChange={(e) => setAwardNote(e.target.value)}
              placeholder="e.g., Outstanding client presentation and clear communication."
              className="w-full px-3 py-2 border border-[var(--tm-border-strong)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--tm-primary)] focus:border-[var(--tm-primary)]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--tm-border)]">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAwardModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Award Badge Now
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
