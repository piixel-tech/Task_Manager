import React from 'react';
import { CalendarHeart, Clock, PartyPopper, Trophy } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { CurvePattern } from '../../../components/ui/HeroCard';

interface NudgeBannerProps {
  isPunchedIn: boolean;
  hasMarkedAttendanceToday: boolean;
  onPunchIn?: () => void;
}

export const NudgeBanner: React.FC<NudgeBannerProps> = ({
  isPunchedIn,
  hasMarkedAttendanceToday,
  onPunchIn
}) => {
  const now = new Date();
  const currentHour = now.getHours();

  // Show nudge banner if past 11:00 AM and attendance not marked or not punched in today
  if (currentHour < 11 || hasMarkedAttendanceToday || isPunchedIn) {
    return null;
  }

  return (
    <div
      className="flex items-center justify-between gap-4 border-b border-[var(--tm-warning-ring)]
        bg-[var(--tm-warning-bg)] px-4 py-3 lg:px-8"
    >
      <div className="flex items-center gap-2.5 text-[13px] text-[var(--tm-warning)]">
        <Clock className="h-4 w-4 shrink-0" />
        <span>
          <strong className="font-bold">Attendance reminder:</strong> it is past 11:00 AM and you
          have not marked Present or Leave today.
        </span>
      </div>

      {onPunchIn && (
        <button
          onClick={onPunchIn}
          className="shrink-0 rounded-full bg-[var(--tm-warning)] px-4 py-1.5 text-[12px]
            font-bold text-white transition-opacity hover:opacity-90"
        >
          Punch in now
        </button>
      )}
    </div>
  );
};

/** Shared layout for the celebratory banners: dark accent panel, white text. */
const CelebrationCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  body: string;
  aside: React.ReactNode;
}> = ({ icon, title, body, aside }) => (
  <div
    className="relative overflow-hidden rounded-[var(--tm-radius-xl)] px-6 py-5 text-white shadow-hero"
    style={{
      backgroundImage:
        'linear-gradient(135deg, var(--tm-primary) 0%, var(--tm-primary-dark) 70%)'
    }}
  >
    <CurvePattern opacity={0.16} />

    <div className="relative flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15 backdrop-blur-sm">
          {icon}
        </span>
        <div>
          <div className="text-[15px] font-extrabold tracking-[-0.01em]">{title}</div>
          <div className="mt-0.5 text-[12.5px] text-white/70">{body}</div>
        </div>
      </div>
      <span className="hidden shrink-0 text-white/70 sm:block">{aside}</span>
    </div>
  </div>
);

export const CelebrationBanners: React.FC = () => {
  const { user } = useAuthStore();
  if (!user) return null;

  const todayStr = new Date().toISOString().slice(5, 10); // MM-DD
  const isBirthday = user.birthday && user.birthday.endsWith(todayStr);

  let yearsAtCompany = 0;
  let isAnniversary = false;
  if (user.joiningDate && user.joiningDate.endsWith(todayStr)) {
    const joinYear = parseInt(user.joiningDate.slice(0, 4), 10);
    const currentYear = new Date().getFullYear();
    yearsAtCompany = currentYear - joinYear;
    if (yearsAtCompany > 0) isAnniversary = true;
  }

  if (!isBirthday && !isAnniversary) return null;

  return (
    <div className="mb-6 space-y-3">
      {isBirthday && (
        <CelebrationCard
          icon={<PartyPopper className="h-5 w-5" />}
          title={`Happy birthday, ${user.name}!`}
          body="Wishing you a fantastic day ahead, filled with success and joy."
          aside={<CalendarHeart className="h-6 w-6" />}
        />
      )}

      {isAnniversary && (
        <CelebrationCard
          icon={<Trophy className="h-5 w-5" />}
          title={`Happy ${yearsAtCompany} year work anniversary!`}
          body="Thank you for your incredible contributions and dedication."
          aside={<Trophy className="h-6 w-6" />}
        />
      )}
    </div>
  );
};
