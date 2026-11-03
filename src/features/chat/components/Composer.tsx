import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SendFlight } from '../../../components/ui/SendButton';
import { CalendarClock, ChevronDown, Mic, Send, ShieldQuestion, Square, Trash2, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { RichEditor, type MentionPerson, type RichEditorHandle } from '../../../components/editor/RichEditor';
import { useConfirm } from '../../../hooks/useConfirm';
import { toast } from '../../../store/useToastStore';
import { useChatStore } from '../../../store/useChatStore';
import { socket } from '../../../services/socket';
import { assetApi, type Asset } from '../../../services/http/taskApi';
import { isJobCancelled } from '../../../services/jobs';
import { AttachMenu } from '../../google/AttachMenu';
import { chatApi, type ChatGroup, type ChatMessage, type SendInput } from '../../../services/http/chatApi';
import { mmss, previewOf, scheduleOptions, toLocalInput, whenLabel } from '../chatUtils';

const TYPING_EVERY_MS = 2500;
const MAX_VOICE_SECONDS = 300;
const MIN_VOICE_SECONDS = 1;
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

interface Props {
  group: ChatGroup;
  meId: string;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  /** Team members only: open the "request client approval" form. */
  onRequestApproval?: () => void;
  /** A message was scheduled (so the Scheduled count can refresh). */
  onScheduled?: () => void;
}

/** Message box: rich text with @mentions, files and photos, voice notes, and "send later". */
export const Composer: React.FC<Props> = ({ group, meId, replyTo, onCancelReply, onRequestApproval, onScheduled }) => {
  const groupId = group.id;
  const confirm = useConfirm();
  const upsertMessage = useChatStore((s) => s.upsertMessage);
  const editor = useRef<RichEditorHandle>(null);
  const lastTyping = useRef(0);
  const [empty, setEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<Asset[]>([]);
  const [menu, setMenu] = useState(false);
  const [custom, setCustom] = useState(false);
  const [customWhen, setCustomWhen] = useState('');

  const people: MentionPerson[] = useMemo(() => group.members.filter((u) => u.id !== meId).map((u) => ({ id: u.id, name: u.name, role: u.role })), [group.members, meId]);

  // Voice recording
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<{ mr: MediaRecorder; stream: MediaStream; started: number; send: boolean } | null>(null);

  // Uploaded but never sent: don't leave them behind when the box goes away.
  const leftovers = useRef<Asset[]>([]);
  leftovers.current = attachments;
  useEffect(
    () => () => {
      stopRecording(false);
      leftovers.current.forEach((a) => assetApi.remove(a.id).catch(() => {}));
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (replyTo) editor.current?.focus();
  }, [replyTo]);

  const canSend = !empty || attachments.length > 0;
  /** Counts sends, so the little plane flies once per message. */
  const [flights, setFlights] = useState(0);

  /** Send one message; failures are reported and re-thrown so the caller keeps what is left. */
  const post = async (input: SendInput) => {
    try {
      upsertMessage(await chatApi.send(groupId, { ...input, reply_to: replyTo?.id }));
      onCancelReply();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the message');
      throw err;
    }
  };

  const send = async () => {
    if (!canSend || busy) return;
    setBusy(true);
    setFlights((n) => n + 1);
    const html = editor.current?.isEmpty() ? '' : (editor.current?.html() ?? '');
    try {
      if (attachments.length === 0) {
        await post({ type: 'text', body: html, html: true });
      } else {
        // The text rides along as the caption of the first file; sent files leave the tray so a retry doesn't repeat them.
        for (const [i, a] of attachments.entries()) {
          await post({ type: a.mime.startsWith('image/') ? 'image' : 'file', file_id: a.id, body: i === 0 ? html : '', html: true });
          setAttachments((cur) => cur.filter((x) => x.id !== a.id));
        }
      }
      editor.current?.clear();
    } catch {
      // What wasn't sent stays in the box.
    } finally {
      setBusy(false);
      editor.current?.focus();
    }
  };

  const attach = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const uploaded = await assetApi.upload(files);
      setAttachments((cur) => [...cur, ...uploaded]);
    } catch (err) {
      if (!isJobCancelled(err)) toast.error(err instanceof Error ? err.message : 'Could not upload the file');
    } finally {
      setBusy(false);
    }
  };

  const dropAttachment = (a: Asset) => {
    setAttachments((cur) => cur.filter((x) => x.id !== a.id));
    assetApi.remove(a.id).catch(() => {});
  };

  const schedule = async (when: Date) => {
    if (!canSend) return;
    const ok = await confirm({
      title: 'Schedule this message?',
      message: `It will be sent to “${group.name}” ${whenLabel(when)}, from you, like a normal message. You can edit or cancel it from Scheduled until then.`,
      confirmLabel: 'Schedule',
      action: async () => {
        const html = editor.current?.isEmpty() ? '' : (editor.current?.html() ?? '');
        await chatApi.schedule(groupId, { body: html, file_ids: attachments.map((a) => a.id), send_at: when.toISOString() });
      },
      successTitle: 'Message scheduled'
    });
    if (ok) {
      leftovers.current = []; // the scheduled message owns these files now
      setAttachments([]);
      editor.current?.clear();
      onScheduled?.();
    }
    return ok;
  };

  const hintTyping = () => {
    const now = Date.now();
    if (now - lastTyping.current > TYPING_EVERY_MS) {
      lastTyping.current = now;
      socket.send('typing', { group_id: groupId });
    }
  };

  // --- Voice notes ------------------------------------------------------------------------------
  const sendVoice = async (blob: Blob, seconds: number) => {
    const type = blob.type || 'audio/webm';
    const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
    setBusy(true);
    let id: string;
    try {
      id = (await assetApi.upload([new File([blob], `voice-note.${ext}`, { type })]))[0].id;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload the voice note');
      setBusy(false);
      return;
    }
    try {
      await post({ type: 'voice', file_id: id, duration: seconds });
    } catch {
      assetApi.remove(id).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Voice notes are not supported in this browser');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error('Microphone blocked', 'Allow microphone access in your browser to record voice notes.');
      return;
    }
    const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const state = { mr, stream, started: Date.now(), send: true };
    recorder.current = state;

    mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (recorder.current === state) recorder.current = null;
      setRecording(false);
      const seconds = Math.round((Date.now() - state.started) / 1000);
      if (!state.send) return;
      if (seconds < MIN_VOICE_SECONDS) return toast.info('Voice note too short', 'Hold on a little longer.');
      void sendVoice(new Blob(chunks, { type: (mr.mimeType || mimeType || 'audio/webm').split(';')[0] }), seconds);
    };
    mr.start();
    setElapsed(0);
    setRecording(true);
  };

  function stopRecording(send: boolean) {
    const r = recorder.current;
    if (!r) return;
    r.send = send;
    if (r.mr.state !== 'inactive') r.mr.stop();
  }

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const seconds = Math.floor((Date.now() - (recorder.current?.started ?? Date.now())) / 1000);
      setElapsed(seconds);
      if (seconds >= MAX_VOICE_SECONDS) stopRecording(true);
    }, 250);
    return () => clearInterval(t);
  }, [recording]);

  const presets = menu ? scheduleOptions() : [];

  return (
    <div className="bg-[var(--tm-card)] px-4 pb-4 pt-3">
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-[var(--tm-radius-sm)] border-l-4 border-[var(--tm-primary)] bg-[var(--tm-card-muted)] px-3.5 py-2.5">
          <div className="min-w-0 flex-1 text-[12.5px]">
            <p className="font-bold text-[var(--tm-primary-dark)]">Replying to {replyTo.sender?.id === meId ? 'yourself' : (replyTo.sender?.name ?? 'a former member')}</p>
            <p className="line-clamp-1 text-[var(--tm-ink-soft)]">{previewOf(replyTo)}</p>
          </div>
          <button type="button" aria-label="Cancel reply" onClick={onCancelReply} className="text-[var(--tm-ink-muted)] hover:text-[var(--tm-ink)]">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attachments">
          {attachments.map((a) => (
            <li key={a.id} className="flex max-w-[14rem] items-center gap-2 rounded-full bg-[var(--tm-primary-soft)] py-1 pl-3 pr-1.5 text-[12.5px] font-semibold text-[var(--tm-primary-dark)]">
              <span className="truncate">{a.name}</span>
              <button type="button" aria-label={`Remove ${a.name}`} onClick={() => dropAttachment(a)} className="grid h-5 w-5 shrink-0 place-items-center rounded-full hover:bg-[var(--tm-bg-sunken)]">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {recording ? (
        <div className="flex items-center gap-3" role="status" aria-label="Recording a voice note">
          <span className="h-3 w-3 animate-pulse rounded-full bg-[var(--tm-danger)]" />
          <span className="flex-1 text-[14px] font-bold tabular-nums text-[var(--tm-ink)]">Recording… {mmss(elapsed)}</span>
          <Button type="button" variant="ghost" size="sm" aria-label="Discard recording" onClick={() => stopRecording(false)}>
            <Trash2 className="h-4 w-4 text-[var(--tm-danger)]" />
          </Button>
          <Button type="button" size="sm" onClick={() => stopRecording(true)} leftIcon={<Square className="h-4 w-4" />}>
            Send
          </Button>
        </div>
      ) : (
        <>
          <RichEditor
            ref={editor}
            people={people}
            onSubmit={send}
            onChange={({ empty: e }) => {
              setEmpty(e);
              if (!e) hintTyping();
            }}
            leading={
              <>
                <AttachMenu
                  variant="icon"
                  direction="up"
                  busy={busy}
                  onUpload={attach}
                  onAdded={(files) => setAttachments((cur) => [...cur, ...files])}
                />
                {onRequestApproval && (
                  <Button type="button" variant="ghost" size="sm" aria-label="Request client approval" title="Request client approval" disabled={busy} onClick={onRequestApproval}>
                    <ShieldQuestion className="h-5 w-5" />
                  </Button>
                )}
              </>
            }
            trailing={
              canSend ? (
                <div className="relative flex items-center">
                  <span className="relative">
                    <SendFlight fire={flights} />
                    <Button type="button" size="sm" aria-label="Send" isLoading={busy} onClick={send} className="!rounded-full !bg-[#C4B5E0] !text-[#2A2933] hover:!bg-[#D2C6E9]">
                      <Send className="h-4 w-4" />
                    </Button>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    aria-label="Send later"
                    aria-expanded={menu}
                    disabled={busy}
                    onClick={() => setMenu((m) => !m)}
                    className="ml-1 !rounded-full !bg-[var(--tm-accent)] !text-[var(--tm-accent-ink)] px-2 hover:!brightness-95"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  {menu && (
                    <>
                      <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setMenu(false)} />
                      <div role="menu" className="glass-strong absolute bottom-full right-0 z-40 mb-2 w-64 rounded-[var(--tm-radius-md)] p-2">
                        <p className="px-3 pb-1 pt-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[var(--tm-ink-muted)]">Send later</p>
                        {presets.map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenu(false);
                              void schedule(p.when);
                            }}
                            className="flex w-full items-center justify-between gap-2 rounded-full px-3.5 py-2 text-left text-[13px] font-semibold text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]"
                          >
                            {p.label}
                            <span className="text-[11.5px] font-medium text-[var(--tm-ink-muted)]">{p.hint}</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenu(false);
                            setCustomWhen(toLocalInput(new Date(Date.now() + 3_600_000)));
                            setCustom(true);
                          }}
                          className="flex w-full items-center gap-2 rounded-full px-3.5 py-2 text-left text-[13px] font-semibold text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]"
                        >
                          <CalendarClock className="h-4 w-4" /> Custom date and time…
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <Button type="button" variant="secondary" size="sm" aria-label="Record a voice note" disabled={busy} onClick={startRecording}>
                  <Mic className="h-4 w-4" />
                </Button>
              )
            }
          />
        </>
      )}

      <Modal isOpen={custom} onClose={() => setCustom(false)} title="Send later" description="Pick when this message should go out." maxWidth="sm">
        <div className="space-y-4">
          <Input label="Send at" type="datetime-local" value={customWhen} min={toLocalInput(new Date(Date.now() + 60_000))} onChange={(e) => setCustomWhen(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setCustom(false)}>
              Cancel
            </Button>
            <Button
              disabled={!customWhen || new Date(customWhen).getTime() < Date.now() + 30_000}
              onClick={async () => {
                if (await schedule(new Date(customWhen))) setCustom(false);
              }}
            >
              Schedule
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
