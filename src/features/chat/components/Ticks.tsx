import React from 'react';
import { Check, CheckCheck } from 'lucide-react';
import type { MessageStatus } from '../../../services/http/chatApi';

const LABEL: Record<MessageStatus, string> = { sent: 'Sent', delivered: 'Delivered', seen: 'Seen' };

/** ✓ sent, ✓✓ delivered, ✓✓ seen (the strongest). */
export const Ticks: React.FC<{ status: MessageStatus; className?: string }> = ({ status, className = '' }) => {
  const Icon = status === 'sent' ? Check : CheckCheck;
  return (
    <span className={`inline-flex ${className}`} title={LABEL[status]}>
      <Icon className={`h-3.5 w-3.5 ${status === 'seen' ? 'text-[var(--tm-ink)]' : 'text-[var(--tm-ink-muted)]'}`} />
      <span className="sr-only">{LABEL[status]}</span>
    </span>
  );
};
