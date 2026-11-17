import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { HoldToDelete } from './HoldToDelete';
import { SendButton } from './SendButton';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use for destructive actions such as deactivating an account. */
  danger?: boolean;
  /** The confirm button is the Send button with its plane animation. */
  send?: boolean;
  /** The action has finished: the Send button shows "Sent!". */
  sent?: boolean;
  isLoading?: boolean;
  /** What the action takes with it, one line each, listed under the message. */
  details?: string[];
  /** The person must type this before the confirm button works (e.g. a project's name). */
  requireText?: string;
  /** Failure message from the confirmed action (e.g. a backend error). */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Destructive deletes ask for a press-and-hold instead of a click. Other danger actions (sign out, request changes…) keep the red button. */
const isDelete = (danger: boolean, confirmLabel: string, title: string) => danger && /\b(delete|remove)\b/i.test(`${confirmLabel} ${title}`);

/** "Are you sure?" popup shown before saving or deleting. Deleting is confirmed with the shared "Hold to Delete" pill. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  send = false,
  sent = false,
  isLoading = false,
  details,
  requireText,
  error = null,
  onConfirm,
  onCancel
}) => {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (isOpen) setTyped('');
  }, [isOpen, title]);
  const locked = !!requireText && typed.trim().toLowerCase() !== requireText.trim().toLowerCase();
  return (
  <Modal isOpen={isOpen} onClose={onCancel} title={title} maxWidth="sm" dismissible={!isLoading}>
    {message && <div className="text-[13.5px] text-[var(--tm-ink-soft)]">{message}</div>}
    {details && details.length > 0 && (
      <ul className="mt-3 space-y-1 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-3 text-[13px] font-semibold text-[var(--tm-ink)]" aria-label="What is inside">
        {details.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
    )}
    {requireText && (
      <div className="mt-4">
        <Input
          label={`Type “${requireText}” to confirm`}
          value={typed}
          autoFocus
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>
    )}
    {error && (
      <div className="mt-4 tm-error px-4 py-3 text-xs font-semibold">
        {error}
      </div>
    )}
    <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
      <Button variant="outline" type="button" onClick={onCancel} disabled={isLoading}>
        {cancelLabel}
      </Button>
      {isDelete(danger, confirmLabel, title) ? (
        <HoldToDelete
          label={/^(confirm|delete)$/i.test(confirmLabel) ? 'Hold to Delete' : `Hold to ${confirmLabel}`}
          onConfirm={onConfirm}
          isLoading={isLoading}
          disabled={locked}
        />
      ) : send ? (
        <SendButton
          label={confirmLabel}
          status={sent ? 'sent' : isLoading ? 'sending' : error ? 'error' : 'idle'}
          onClick={onConfirm}
        />
      ) : (
        <Button
          variant={danger ? 'danger' : 'primary'}
          type="button"
          onClick={onConfirm}
          isLoading={isLoading}
          disabled={locked}
        >
          {confirmLabel}
        </Button>
      )}
    </div>
  </Modal>
  );
};
