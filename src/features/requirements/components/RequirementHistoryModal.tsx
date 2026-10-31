import React, { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { requirementApi, type Requirement, type RequirementDetail } from '../../../services/http/requirementApi';
import { Attachments } from './Attachments';

const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Every version of a requirement, newest first. */
export const RequirementHistoryModal: React.FC<{ requirement: Requirement | null; onClose: () => void }> = ({ requirement, onClose }) => {
  const [detail, setDetail] = useState<RequirementDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    if (requirement) requirementApi.get(requirement.id).then(setDetail).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the history'));
  }, [requirement]);

  if (!requirement) return null;
  return (
    <Modal isOpen onClose={onClose} title="Version history" description={requirement.title} maxWidth="2xl">
      {error && <p className="tm-error px-4 py-3 text-[13px] font-semibold">{error}</p>}
      {!detail && !error && <SkeletonRows count={3} />}
      <ol className="space-y-4">
        {detail?.versions.map((v) => (
          <li key={v.number} className="rounded-[var(--tm-radius-sm)] border border-[var(--tm-border)] p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--tm-ink-muted)]">
              <span className="font-extrabold text-[var(--tm-ink)]">Version {v.number}</span>
              {v.current && <span className="rounded-full bg-[var(--tm-success-bg)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--tm-success)]">Current</span>}
              <span>
                {v.edited_by?.name ?? 'Someone'} · {when(v.edited_at)}
              </span>
              {v.subfolder && <span className="rounded-full bg-[var(--tm-primary-soft)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--tm-primary-dark)]">{v.subfolder.name}</span>}
            </div>
            <p className="text-[14px] font-bold text-[var(--tm-ink)]">{v.title}</p>
            {v.details && <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] text-[var(--tm-ink-soft)]">{v.details}</p>}
            <Attachments files={v.attachments} />
          </li>
        ))}
      </ol>
    </Modal>
  );
};
