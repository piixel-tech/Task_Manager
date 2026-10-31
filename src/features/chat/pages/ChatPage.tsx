import React from 'react';
import { ChatWorkspace } from '../components/ChatWorkspace';

/** Team chat: your groups on the left, the open conversation on the right (one at a time on a phone). */
export const ChatPage: React.FC = () => (
  <>
    <h1 className="mb-3 text-[20px] font-extrabold tracking-[-0.01em] text-[var(--tm-ink)]">Team chat</h1>
    <ChatWorkspace canCreate />
  </>
);
