import React, { useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { RichEditor, type MentionPerson, type RichEditorHandle } from '../../../components/editor/RichEditor';
import { AssetPicker } from '../../tasks/components/AssetPicker';
import { assetApi, type Asset } from '../../../services/http/taskApi';
import type { ActivityInput } from '../../../services/http/activityApi';
import { useConfirm } from '../../../hooks/useConfirm';

interface Props {
  kind: 'change_request' | 'comment';
  /** People who can see the task: offered for @mentions and (comments only) for "assign to". */
  people: MentionPerson[];
  /** Reply to this entry instead of starting a new one. */
  parentId?: string;
  placeholder: string;
  /** Posts it. Throws with a message to keep the draft. */
  onPost: (input: ActivityInput) => Promise<void>;
  onCancel?: () => void;
  compact?: boolean;
}

/** Rich text with files or links, and (for a new comment) an optional person to assign it to. */
export const EntryComposer: React.FC<Props> = ({ kind, people, parentId, placeholder, onPost, onCancel, compact }) => {
  const confirm = useConfirm();
  const editor = useRef<RichEditorHandle>(null);
  const [empty, setEmpty] = useState(true);
  const [files, setFiles] = useState<Asset[]>([]);
  const [assignee, setAssignee] = useState('');
  const uploaded = useRef<Set<string>>(new Set());
  const noun = kind === 'change_request' ? 'mid-way change' : parentId ? 'reply' : 'comment';

  const submit = async () => {
    if (empty && files.length === 0) return;
    const html = editor.current?.isEmpty() ? '' : (editor.current?.html() ?? '');
    const ok = await confirm({
      title: `Post this ${noun}?`,
      message: kind === 'change_request' ? 'The assignee and the heads are notified.' : 'People mentioned or assigned are notified.',
      confirmLabel: 'Post',
      action: () => onPost({ kind, body: html, file_ids: files.map((f) => f.id), parent_id: parentId, assigned_to: assignee || undefined }),
      successTitle: `${noun[0].toUpperCase()}${noun.slice(1)} posted`
    });
    if (ok) {
      editor.current?.clear();
      uploaded.current = new Set(); // posted: the entry owns these now
      setFiles([]);
      setAssignee('');
      onCancel?.();
    }
  };

  const changeFiles = (next: Asset[]) => {
    files.filter((a) => uploaded.current.has(a.id) && !next.some((n) => n.id === a.id)).forEach((a) => assetApi.remove(a.id).catch(() => {}));
    setFiles(next);
  };

  return (
    <div className="space-y-2.5">
      <RichEditor ref={editor} people={people} placeholder={placeholder} onChange={({ empty: e }) => setEmpty(e)} maxHeightClass={compact ? 'max-h-28' : 'max-h-48'} label={noun} />
      {files.length > 0 || !compact ? <AssetPicker value={files} onChange={changeFiles} onUploaded={(ids) => ids.forEach((id) => uploaded.current.add(id))} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        {kind === 'comment' && !parentId ? (
          <div className="min-w-[10rem] flex-1 sm:max-w-[16rem]">
            <Select label="Assign to (optional)" value={assignee} onChange={(e) => setAssignee(e.target.value)} options={[{ value: '', label: 'No one' }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
          </div>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          {onCancel && (
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button size="sm" disabled={empty && files.length === 0} onClick={submit}>
            Post
          </Button>
        </div>
      </div>
    </div>
  );
};
