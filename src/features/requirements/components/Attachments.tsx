import React from 'react';
import { FileText, Link2 } from 'lucide-react';
import { toast } from '../../../store/useToastStore';
import { assetApi, type Asset } from '../../../services/http/taskApi';

/** Attached files and links: a link opens in a new tab, a file is downloaded with the login token. */
export const Attachments: React.FC<{ files: Asset[] }> = ({ files }) => {
  if (files.length === 0) return null;
  return (
    <ul className="mt-2.5 flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            onClick={() => assetApi.open(f).catch((err) => toast.error('Could not open the file', err.message))}
            className="flex max-w-[260px] items-center gap-2 rounded-full bg-[var(--tm-card-muted)] px-3 py-1.5 text-[12px] font-semibold text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]"
          >
            {f.kind === 'link' ? <Link2 className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{f.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};
