import React from 'react';
import { Video } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/useChatStore';
import { googleApi } from '../../services/http/googleApi';
import { isMeetUrl } from './googleUtils';

/** "Join Meet" for a booking that has a Google Meet. Renders nothing when there is none (yet). */
export const MeetLink: React.FC<{ url?: string; className?: string }> = ({ url, className }) => {
  if (!isMeetUrl(url)) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className} onClick={(e) => e.stopPropagation()}>
      <Button type="button" variant="outline" size="sm" leftIcon={<Video className="h-4 w-4" />}>
        Join Meet
      </Button>
    </a>
  );
};

/** "Start Meet" in a chat group: makes a Google Meet and posts the link to everyone in the group. Team members only. */
export const StartMeetButton: React.FC<{ groupId: string }> = ({ groupId }) => {
  const confirm = useConfirm();
  const role = useAuthStore((s) => s.user?.role);
  const upsertMessage = useChatStore((s) => s.upsertMessage);
  if (role === 'client') return null;

  const start = () =>
    confirm({
      title: 'Start a Google Meet?',
      message: 'A new Meet is created on your Google Calendar and its link is posted in this chat for everyone in the group.',
      confirmLabel: 'Start Meet',
      action: async () => {
        upsertMessage(await googleApi.startMeet(groupId));
      },
      successTitle: 'Meet started'
    });

  return (
    <Button variant="ghost" size="sm" aria-label="Start Google Meet" title="Start Google Meet" onClick={start}>
      <Video className="h-5 w-5" />
    </Button>
  );
};
