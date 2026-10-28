import React, { useRef, useState } from 'react';
import { FileText, Link2, Paperclip, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { assetApi, type Asset } from '../../../services/http/taskApi';

interface Props {
  value: Asset[];
  onChange: (assets: Asset[]) => void;
  /** Called with ids of files uploaded here, so the form can clean up if it is cancelled. */
  onUploaded?: (ids: string[]) => void;
}

/** Attach several files and/or links. Each is saved through the file service right away. */
export const AssetPicker: React.FC<Props> = ({ value, onChange, onUploaded }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const run = async (work: () => Promise<Asset[]>) => {
    setBusy(true);
    setError(null);
    try {
      const added = await work();
      onChange([...value, ...added]);
      onUploaded?.(added.map((a) => a.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    run(() => assetApi.upload(Array.from(files)));
    if (input.current) input.current.value = '';
  };

  const addLink = () => {
    if (!linkUrl.trim()) return;
    run(async () => {
      const url = /^https?:\/\//i.test(linkUrl.trim()) ? linkUrl.trim() : `https://${linkUrl.trim()}`;
      const asset = await assetApi.addLink(linkTitle.trim() || url, url);
      setLinkTitle('');
      setLinkUrl('');
      return [asset];
    });
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
                {a.kind === 'link' ? <Link2 className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
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
        <input ref={input} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        <Button type="button" variant="outline" size="sm" isLoading={busy} onClick={() => input.current?.click()} leftIcon={<Paperclip className="h-4 w-4" />}>
          Upload files
        </Button>
        <span className="text-[11.5px] text-[var(--tm-ink-muted)]">Up to 25 MB each. Executables are blocked.</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
        <Input placeholder="Link title (optional)" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
        <Input placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
        <Button type="button" variant="outline" size="sm" disabled={!linkUrl.trim() || busy} onClick={addLink}>
          Add link
        </Button>
      </div>

      {error && <p className="text-[12px] font-medium text-[var(--tm-danger)]">{error}</p>}
    </div>
  );
};
