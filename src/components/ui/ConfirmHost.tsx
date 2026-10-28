import React from 'react';
import { useConfirmStore } from '../../store/useConfirmStore';
import { toast } from '../../store/useToastStore';
import { ConfirmDialog } from './ConfirmDialog';

/** Renders the dialog driven by `useConfirm()`. Mount once at the app root. */
export const ConfirmHost: React.FC = () => {
  const { request, busy, error, setBusy, setError, close } = useConfirmStore();

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
    close(true);
  };

  return (
    <ConfirmDialog
      isOpen={!!request}
      title={request?.title ?? ''}
      message={request?.message}
      confirmLabel={request?.confirmLabel}
      danger={request?.danger}
      isLoading={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={() => close(false)}
    />
  );
};
