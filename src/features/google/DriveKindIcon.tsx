import React from 'react';
import { File as FileIcon, FileText, Folder, Image, Presentation, Sheet, Video } from 'lucide-react';
import type { DriveKind } from '../../services/http/googleApi';

const ICONS: Record<DriveKind, React.ComponentType<{ className?: string }>> = {
  document: FileText,
  spreadsheet: Sheet,
  presentation: Presentation,
  pdf: FileText,
  image: Image,
  video: Video,
  folder: Folder,
  other: FileIcon
};

/** The glyph for a Drive file by kind, in the app's accent colour. */
export const DriveKindIcon: React.FC<{ kind: DriveKind; className?: string }> = ({
  kind,
  className = 'h-4 w-4 shrink-0 text-[var(--tm-primary-dark)]'
}) => {
  const Icon = ICONS[kind] ?? FileIcon;
  return <Icon className={className} />;
};
