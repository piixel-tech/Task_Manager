import React from 'react';
import { Check, CheckCheck } from 'lucide-react';
import type { MessageStatus } from '../../../services/http/chatApi';

const LABEL: Record<MessageStatus, string> = { sent: 'Sent', delivered: 'Delivered', seen: 'Seen' };

/** ✓ sent, ✓✓ delivered, blue ✓✓ seen. */
export const Ticks: React.FC<{ status: MessageStatus; className?: string }> = ({ status, className = '' }) => {
  const Icon = status === 'sent' ? Check : CheckCheck;
  return (
    <span className={`inline-flex ${className}`} title={LABEL[status]}>
      <Icon className={`h-4 w-4 ${status === 'seen' ? 'text-[var(--tm-info)]' : 'text-[var(--tm-ink-muted)]'}`} />
      <span className="sr-only">{LABEL[status]}</span>
    </span>
  );
};
