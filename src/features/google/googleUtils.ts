import { toast } from '../../store/useToastStore';
import { useAuthStore } from '../../store/authStore';
import { GoogleAccessError, type DriveMeta } from '../../services/http/googleApi';

// --- Preview and links ------------------------------------------------------------------------------------------------
/** The inline preview address. It shows the file if the viewer's own Google account may open it. */
export function previewUrl(drive: DriveMeta): string {
  const id = encodeURIComponent(drive.file_id);
  switch (drive.kind) {
    case 'document':
      return `https://docs.google.com/document/d/${id}/preview`;
    case 'spreadsheet':
      return `https://docs.google.com/spreadsheets/d/${id}/preview`;
    case 'presentation':
      return `https://docs.google.com/presentation/d/${id}/preview`;
    default:
      return `https://drive.google.com/file/d/${id}/preview`;
  }
}

/** Only ever send people to Google's own addresses, whatever a record says. */
export function isGoogleUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)google\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

/** Meet links only ever point at meet.google.com, whatever a record says. */
export function isMeetUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'meet.google.com';
  } catch {
    return false;
  }
}

/** Thumbnails come from Google's image servers; anything else is not shown. */
export function isThumbnailUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)(googleusercontent|google)\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

export const KIND_LABEL: Record<DriveMeta['kind'], string> = {
  document: 'Google Doc',
  spreadsheet: 'Google Sheet',
  presentation: 'Google Slides',
  pdf: 'PDF',
  image: 'Image',
  video: 'Video',
  folder: 'Folder',
  other: 'Drive file'
};

// --- Telling people what to do about a Google problem -------------------------------------------------------------------
/** A toast that says what went wrong and, when Google needs setting up or renewing, takes them to Connected apps. */
export function reportGoogleError(err: unknown, title: string): void {
  const role = useAuthStore.getState().user?.role;
  const settings = `${role === 'admin' ? '/admin' : '/app'}/settings/connected-apps`;
  if (err instanceof GoogleAccessError) {
    const heading =
      err.code === 'not_connected' ? 'Connect Google first' : err.code === 'reconnect' ? 'Reconnect Google' : 'Reconnect Google to continue';
    toast.error(heading, `${err.message} Click here to open Connected apps.`, settings);
    return;
  }
  toast.error(title, err instanceof Error ? err.message : undefined);
}
