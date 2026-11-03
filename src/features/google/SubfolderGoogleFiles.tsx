import React, { useCallback, useEffect, useState } from 'react';
import { Eye, ExternalLink, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { useConfirm } from '../../hooks/useConfirm';
import { subfolderFileApi, type SubfolderFiles } from '../../services/http/googleApi';
import type { Asset } from '../../services/http/taskApi';
import { DriveFileViewer } from './DriveFileViewer';
import { DriveKindIcon } from './DriveKindIcon';
import { AttachMenu } from './AttachMenu';
import { isGoogleUrl, KIND_LABEL } from './googleUtils';

/** Google Docs, Sheets and Drive files linked to a subfolder, with an inline preview. Members add and remove; everyone reads. */
export const SubfolderGoogleFiles: React.FC<{ subfolderId: string; className?: string }> = ({ subfolderId, className }) => {
  const confirm = useConfirm();
  const [data, setData] = useState<SubfolderFiles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<Asset | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await subfolderFileApi.list(subfolderId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the Google files');
    }
  }, [subfolderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (files: Asset[]) => {
    for (const f of files) setData(await subfolderFileApi.link(subfolderId, f.id));
  };

  const remove = (file: Asset) =>
    confirm({
      title: 'Remove this Google file?',
      message: `${file.name} is taken off this subfolder. The file itself stays in Google Drive.`,
      confirmLabel: 'Remove',
      danger: true,
      action: async () => setData(await subfolderFileApi.unlink(subfolderId, file.id)),
      successTitle: 'Removed from the subfolder'
    });

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-extrabold">Google files{data ? ` (${data.files.length})` : ''}</CardTitle>
          {data?.can_write && (
            <div className="flex flex-wrap items-center gap-2">
              <AttachMenu onAdded={add} label="Add Google file" />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-[13px] font-medium text-[var(--tm-danger)]">{error}</p>}
        {data && data.files.length === 0 && (
          <p className="text-[13px] text-[var(--tm-ink-muted)]">
            No Google Docs, Sheets or Drive files yet.{data.can_write ? ' Create one or add one from your Drive.' : ''}
          </p>
        )}
        {data && data.files.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data.files.map((f) => (
              <li key={f.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => (f.drive ? setPreviewing(f) : undefined)}
                  title="Preview here"
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-3 text-left transition-colors hover:bg-[var(--tm-bg-sunken)]"
                >
                  <DriveKindIcon kind={f.drive?.kind ?? 'other'} />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-[13px] font-bold text-[var(--tm-ink)]">{f.name}</span>
                    <span className="block truncate text-[11.5px] text-[var(--tm-ink-muted)]">{KIND_LABEL[f.drive?.kind ?? 'other']}</span>
                  </span>
                  <Eye className="ml-auto h-4 w-4 shrink-0 text-[var(--tm-ink-muted)]" />
                </button>
                {isGoogleUrl(f.url) && (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${f.name} in Google`}
                    title="Open in Google"
                    className="grid w-11 shrink-0 place-items-center rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] text-[var(--tm-primary-dark)] transition-colors hover:bg-[var(--tm-bg-sunken)]"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                {data.can_write && (
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    title="Remove from the subfolder"
                    onClick={() => remove(f)}
                    className="grid w-11 shrink-0 place-items-center rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] text-[var(--tm-ink-muted)] transition-colors hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-danger)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <DriveFileViewer file={previewing} onClose={() => setPreviewing(null)} />
    </Card>
  );
};
