import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, Phone, KeyRound, ArrowRight, Building2, AlertCircle } from 'lucide-react';
import { chatService } from '../../../services';
import type { ClientInvite, Project } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';

export const ClientJoinPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const { showToast } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [inviteData, setInviteData] = useState<{ invite: ClientInvite; project: Project } | null>(null);
  const [error, setError] = useState('');

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [generatedOTP, setGeneratedOTP] = useState('');
  const [inputOTP, setInputOTP] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (!code) {
      setError('Invalid invite code');
      setLoading(false);
      return;
    }

    chatService.getInviteByCode(code).then((data) => {
      if (!data) {
        setError('Invite code not found or expired.');
      } else {
        setInviteData(data);
        setPhone(data.invite.phone);
      }
      setLoading(false);
    });
  }, [code]);

  const handleSendOTP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;

    // Generate demo 6-digit OTP
    const demoOTP = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOTP(demoOTP);
    setStep('otp');
    showToast(`Verification code generated: ${demoOTP}`);
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !inputOTP) return;

    if (inputOTP.trim() !== generatedOTP) {
      showToast('Incorrect OTP code. Please enter the demo OTP shown above.');
      return;
    }

    try {
      setIsVerifying(true);
      const { user } = await chatService.verifyClientOTP(code, phone, inputOTP);
      setUser(user);
      showToast(`Welcome, ${user.name}! Access granted to Client Portal.`);
      navigate('/client/portal');
    } catch (err: any) {
      showToast(err.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--tm-card-muted)] flex items-center justify-center p-4">
        <div className="text-[var(--tm-ink-muted)] text-sm animate-pulse">Verifying client invite code...</div>
      </div>
    );
  }

  if (error || !inviteData) {
    return (
      <div className="min-h-screen bg-[var(--tm-card-muted)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--tm-danger-bg)] text-[var(--tm-danger)] flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-[var(--tm-ink)]">Invite Invalid or Expired</h2>
            <p className="text-xs text-[var(--tm-ink-muted)]">{error || 'This invite link is no longer active.'}</p>
            <Button variant="primary" onClick={() => navigate('/login')}>
              Go to Login Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { invite, project } = inviteData;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--tm-ink)] via-[var(--tm-primary)] to-[var(--tm-ink)] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-[var(--tm-primary)] bg-white/95 backdrop-blur-md shadow-2xl overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-[var(--tm-primary)] via-[var(--tm-primary)] to-[var(--tm-success)]" />
        <CardHeader className="text-center pt-6 pb-2">
          <div className="w-12 h-12 rounded-2xl bg-[var(--tm-primary-soft)] text-[var(--tm-primary)] flex items-center justify-center mx-auto mb-3 shadow-md shadow-soft">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <CardTitle className="text-xl font-bold text-[var(--tm-ink)]">Client Portal Join</CardTitle>
          <CardDescription className="text-xs">
            Enter phone number to receive OTP & access project chat
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 space-y-5">
          {/* Project Summary Badge */}
          <div className="bg-[var(--tm-card-muted)] p-3.5 rounded-xl border border-[var(--tm-border)] space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--tm-ink-muted)] font-semibold text-[10px] uppercase">Project</span>
              <Badge variant={project.company === 'piixel' ? 'piixel' : 'unwork'} size="sm">
                {project.company}
              </Badge>
            </div>
            <div className="font-bold text-[var(--tm-ink)] text-sm">{project.name}</div>
            <div className="flex items-center gap-1.5 text-[var(--tm-ink-muted)] pt-0.5">
              <Building2 className="w-3.5 h-3.5 text-[var(--tm-primary)]" />
              <span>Prepared for: <strong>{invite.clientName}</strong></span>
            </div>
          </div>

          {step === 'phone' ? (
            <form onSubmit={handleSendOTP} className="space-y-4">
              <Input
                label="WhatsApp / Mobile Phone Number"
                type="tel"
                placeholder="e.g. +91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                leftIcon={<Phone className="w-4 h-4" />}
                required
              />

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full"
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Send Verification OTP
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              {/* Demo OTP Display Box */}
              <div className="p-3.5 bg-[var(--tm-success-bg)] border border-[var(--tm-success-ring)] rounded-xl text-[var(--tm-success)] text-xs space-y-1 text-center animate-bounce">
                <div className="font-semibold text-[var(--tm-success)]">Demo Verification OTP Code</div>
                <div className="text-2xl font-mono font-bold tracking-widest text-[var(--tm-success)]">
                  {generatedOTP}
                </div>
                <div className="text-[10px] text-[var(--tm-success)]">Enter this code below to log in instantly</div>
              </div>

              <Input
                label="Enter 6-Digit OTP Code"
                type="text"
                placeholder="e.g. 849201"
                maxLength={6}
                value={inputOTP}
                onChange={(e) => setInputOTP(e.target.value)}
                leftIcon={<KeyRound className="w-4 h-4" />}
                required
              />

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('phone')}
                  className="text-xs text-[var(--tm-ink-muted)] hover:text-[var(--tm-ink)] underline"
                >
                  Change Phone Number
                </button>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isVerifying}
                  className="bg-[var(--tm-success)] hover:bg-[var(--tm-success)]"
                >
                  Verify & Access Portal
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
