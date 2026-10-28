import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface SuccessDialogProps {
  isOpen: boolean;
  title: string;
  message?: React.ReactNode;
  onClose: () => void;
}

/** Confirmation popup shown after an action succeeded. */
export const SuccessDialog: React.FC<SuccessDialogProps> = ({ isOpen, title, message, onClose }) => (
  <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm" hideClose>
    <div className="flex flex-col items-center text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--tm-success-bg)] text-[var(--tm-success)]">
        <CheckCircle2 className="h-7 w-7" />
      </span>
      <h3 className="mt-4 text-[17px] font-extrabold text-[var(--tm-ink)]">{title}</h3>
      {message && <p className="mt-1.5 text-[13.5px] text-[var(--tm-ink-muted)]">{message}</p>}
      <Button className="mt-6 w-full" onClick={onClose}>
        Done
      </Button>
    </div>
  </Modal>
);
