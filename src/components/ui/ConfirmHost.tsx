import React, { useState } from 'react';
import { useConfirmStore } from '../../store/useConfirmStore';
import { toast } from '../../store/useToastStore';
import { ConfirmDialog } from './ConfirmDialog';
import { useMotionPrefs } from './useMotionPrefs';

/** How long the dialog stays open on "Sent!" before it closes. */
const SENT_HOLD_MS = 1200;

/** Renders the dialog driven by `useConfirm()`. Mount once at the app root. */
export const ConfirmHost: React.FC = () => {
  const { request, busy, error, setBusy, setError, close } = useConfirmStore();
  const { reduced } = useMotionPrefs();
  const [sent, setSent] = useState(false);

  const onConfirm = async () => {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      await request.action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
      return;
    }
    if (request.successTitle) toast.success(request.successTitle, request.successMessage);
    if (request.send) {
      setSent(true);
      await new Promise((r) => setTimeout(r, reduced ? 350 : SENT_HOLD_MS));
      setSent(false);
    }
    close(true);
  };

  return (
    <ConfirmDialog
      isOpen={!!request}
      title={request?.title ?? ''}
      message={request?.message}
      confirmLabel={request?.confirmLabel}
      danger={request?.danger}
      send={request?.send}
      sent={sent}
      isLoading={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={() => close(false)}
    />
  );
};
