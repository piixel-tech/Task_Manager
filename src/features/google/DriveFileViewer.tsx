import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import type { Asset } from '../../services/http/taskApi';
import { isGoogleUrl, KIND_LABEL, previewUrl } from './googleUtils';

/** Inline preview of a Google Doc / Sheet / Slides / Drive file, in a dialog. Google decides who may see it. */
export const DriveFileViewer: React.FC<{ file: Asset | null; onClose: () => void }> = ({ file, onClose }) => {
  const drive = file?.drive ?? null;
  return (
    <Modal
      isOpen={!!file && !!drive}
      onClose={onClose}
      title={file?.name}
      description={drive ? `${KIND_LABEL[drive.kind]} · only people with access in Google can see it` : undefined}
      maxWidth="3xl"
      footer={
        <>
          {file && isGoogleUrl(file.url) && (
            <a href={file.url} target="_blank" rel="noopener noreferrer" className="mr-auto">
              <Button type="button" variant="outline" size="sm" leftIcon={<ExternalLink className="h-4 w-4" />}>
                Open in Google
              </Button>
            </a>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {drive && (
        <iframe
          title={`Preview of ${file?.name}`}
          src={previewUrl(drive)}
          className="h-[65vh] w-full rounded-[var(--tm-radius-md)] border border-[var(--tm-border)] bg-[var(--tm-card)]"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      )}
      <p className="mt-3 text-[12px] text-[var(--tm-ink-muted)]">
        Blank or asking you to sign in? Open it in Google, or ask the owner to share it with you.
      </p>
    </Modal>
  );
};
