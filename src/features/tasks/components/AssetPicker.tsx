import React, { useState } from 'react';
import { FileText, Link2, X } from 'lucide-react';
import { assetApi, type Asset } from '../../../services/http/taskApi';
import { isJobCancelled } from '../../../services/jobs';
import { DriveKindIcon } from '../../google/DriveKindIcon';
import { AttachMenu } from '../../google/AttachMenu';

interface Props {
  value: Asset[];
  onChange: (assets: Asset[]) => void;
  /** Called with ids of files uploaded here, so the form can clean up if it is cancelled. */
  onUploaded?: (ids: string[]) => void;
}

/** Attach several files and/or links. Each is saved through the file service right away. */
export const AssetPicker: React.FC<Props> = ({ value, onChange, onUploaded }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (work: () => Promise<Asset[]>) => {
    setBusy(true);
    setError(null);
    try {
      const added = await work();
      onChange([...value, ...added]);
      onUploaded?.(added.map((a) => a.id));
    } catch (err) {
      if (!isJobCancelled(err)) setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <span className="text-[12px] font-semibold text-[var(--tm-ink-soft)]">Assets</span>

      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-[var(--tm-ink)]">
                {a.drive ? (
                  <DriveKindIcon kind={a.drive.kind} className="h-4 w-4 shrink-0" />
                ) : a.kind === 'link' ? (
                  <Link2 className="h-4 w-4 shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">{a.name}</span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => onChange(value.filter((x) => x.id !== a.id))}
                className="text-[var(--tm-ink-muted)] hover:text-[var(--tm-danger)]"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <AttachMenu
          busy={busy}
          onUpload={(files) => run(() => assetApi.upload(files))}
          onAdded={(files) => {
            onChange([...value, ...files]);
            onUploaded?.(files.map((f) => f.id));
          }}
        />
        <span className="text-[11.5px] text-[var(--tm-ink-muted)]"></span>
      </div>

      {error && <p className="text-[12px] font-medium text-[var(--tm-danger)]">{error}</p>}
    </div>
  );
};
