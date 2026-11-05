import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useConfirm } from '../../../hooks/useConfirm';
import { assetApi, type Asset } from '../../../services/http/taskApi';
import { officeApi, type OfficePost } from '../../../services/http/officeApi';

const MAX_PHOTO_MB = 10;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onPosted: (post: OfficePost) => void;
}

/** Post an issue or notice: say what is going on, optionally add a photo. */
export const NewPostModal: React.FC<Props> = ({ isOpen, onClose, onPosted }) => {
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<{ asset: Asset; preview: string } | null>(null);
  const [important, setImportant] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discardPhoto = (p: typeof photo) => {
    if (!p) return;
    URL.revokeObjectURL(p.preview);
    assetApi.remove(p.asset.id).catch(() => {});
  };

  // Start fresh every time it opens.
  useEffect(() => {
    if (!isOpen) return;
    setText('');
    setPhoto(null);
    setError(null);
  }, [isOpen]);

  const close = () => {
    discardPhoto(photo); // an upload that was never posted shouldn't linger
    setPhoto(null);
    onClose();
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Please choose an image file.');
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) return setError(`The photo must be under ${MAX_PHOTO_MB} MB.`);
    setError(null);
    setUploading(true);
    try {
      const [asset] = await assetApi.upload([file]);
      discardPhoto(photo);
      setPhoto({ asset, preview: URL.createObjectURL(file) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the photo');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return setError('Say what is going on.');
    setError(null);
    let created: OfficePost | null = null;
    const ok = await confirm({
      title: 'Post to the office board?',
      message: important ? 'Everyone on the team is notified straight away.' : 'It goes on the board. Nobody is notified.',
      confirmLabel: 'Post',
      action: async () => {
        created = await officeApi.create(body, photo?.asset.id ?? null, important);
      },
      successTitle: 'Posted to the office board'
    });
    if (ok && created) {
      if (photo) URL.revokeObjectURL(photo.preview);
      setPhoto(null); // it belongs to the post now
      onPosted(created);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="New office post" description="Broken coffee machine? AC acting up? Tell the team." maxWidth="lg">
      <form onSubmit={submit} className="space-y-5">
        {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}

        <div>
          <label htmlFor="office-text" className="mb-1.5 block text-[12.5px] font-bold text-[var(--tm-ink-soft)]">
            What is happening?
          </label>
          <textarea
            id="office-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="e.g. The coffee is finished, can someone order more?"
            className="w-full resize-y rounded-[var(--tm-radius-md)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-3 text-[14px] text-[var(--tm-ink)] outline-none focus:border-[var(--tm-primary)]"
          />
          <p className="mt-1 text-right text-[11px] text-[var(--tm-ink-muted)]">{text.length}/1000</p>
        </div>

        <div>
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          {photo ? (
            <div className="relative inline-block">
              <img src={photo.preview} alt="Selected photo" className="h-32 rounded-[var(--tm-radius-sm)] border border-[var(--tm-border)] object-cover" />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => {
                  discardPhoto(photo);
                  setPhoto(null);
                }}
                className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-[var(--tm-ink)] text-[var(--tm-ink-invert)] shadow-soft-sm"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" isLoading={uploading} onClick={() => input.current?.click()} leftIcon={<ImagePlus className="h-4 w-4" />}>
              Add a photo (optional)
            </Button>
          )}
        </div>

        <label className="flex items-center gap-2 text-[13px] font-semibold text-[var(--tm-ink-soft)]">
          <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} className="h-4 w-4 accent-[var(--tm-primary)]" />
          Important: notify the whole team
        </label>

        <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
          <Button variant="outline" type="button" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={!text.trim() || uploading}>
            Post
          </Button>
        </div>
      </form>
    </Modal>
  );
};
