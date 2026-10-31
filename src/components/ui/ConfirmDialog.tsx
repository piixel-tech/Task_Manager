import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use for destructive actions such as deactivating an account. */
  danger?: boolean;
  isLoading?: boolean;
  /** Failure message from the confirmed action (e.g. a backend error). */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** "Are you sure?" popup shown before saving or deleting. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  isLoading = false,
  error = null,
  onConfirm,
  onCancel
}) => (
  <Modal isOpen={isOpen} onClose={onCancel} title={title} maxWidth="sm" dismissible={!isLoading}>
    {message && <div className="text-[13.5px] text-[var(--tm-ink-soft)]">{message}</div>}
    {error && (
      <div className="mt-4 tm-error px-4 py-3 text-xs font-semibold">
        {error}
      </div>
    )}
    <div className="mt-6 flex justify-end gap-3">
      <Button variant="outline" type="button" onClick={onCancel} disabled={isLoading}>
        {cancelLabel}
      </Button>
      <Button
        variant={danger ? 'danger' : 'primary'}
        type="button"
        onClick={onConfirm}
        isLoading={isLoading}
      >
        {confirmLabel}
      </Button>
    </div>
  </Modal>
);
