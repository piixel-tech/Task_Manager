import React from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ChatWorkspace } from '../components/ChatWorkspace';

/** Team chat: your groups on the left, the open conversation on the right (one at a time on a phone). */
export const ChatPage: React.FC = () => (
  <>
    <PageHeader title="Team chat" description="Groups for your team and clients. Messages arrive live, with ticks that show who has read them." />
    <ChatWorkspace canCreate />
  </>
);
