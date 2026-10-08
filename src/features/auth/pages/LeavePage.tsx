import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Heart, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent } from '../../../components/ui/Card';
import { getTodayDateString, formatDate } from '../../../utils/time';

export const LeavePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const todayStr = getTodayDateString();

  return (
    <div className="min-h-screen bg-[var(--tm-bg)] flex flex-col items-center justify-center p-4">
      <Card className="max-w-md w-full border-[var(--tm-warning-ring)] shadow-xl bg-white/90 backdrop-blur-md text-center overflow-hidden animate-fade-in">
        <div className="h-2 bg-[var(--tm-primary)]" />
        <CardContent className="p-8 space-y-6">
          <div className="w-20 h-20 rounded-full bg-[var(--tm-warning-bg)] text-[var(--tm-warning)] flex items-center justify-center mx-auto shadow-md shadow-soft">
            <Sun className="w-10 h-10" />
          </div>

          <div>
            <span className="px-3 py-1 bg-[var(--tm-warning-bg)] text-[var(--tm-warning)] text-xs font-bold rounded-full uppercase tracking-wider">
              {formatDate(todayStr, 'EEEE, MMMM dd, yyyy')}
            </span>
            <h1 className="text-2xl font-black text-[var(--tm-ink)] mt-3 tracking-tight">
              Have a happy leave, enjoy your day! <Heart className="inline w-6 h-6 text-[var(--tm-danger)] fill-[var(--tm-danger)]" />
            </h1>
            <p className="text-xs text-[var(--tm-ink-soft)] mt-2 leading-relaxed">
              Hey <span className="font-bold text-[var(--tm-ink)]">{user?.name}</span>, your shift status is marked as <span className="font-semibold text-[var(--tm-warning)]">On Leave</span> today. Take time to relax and recharge!
            </p>
          </div>

          <div className="pt-4 border-t border-[var(--tm-warning-ring)] flex flex-col gap-2">
            <Button
              variant="outline"
              size="md"
              onClick={() => navigate('/app/profile')}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              View My Profile & Calendar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
