import React from 'react';
import { ChatWorkspace } from '../components/ChatWorkspace';

/** Team chat: your groups on the left, the open conversation on the right (one at a time on a phone). */
export const ChatPage: React.FC = () => (
  <>
    <div className="mb-3">
      <h1 className="text-[20px] font-extrabold tracking-[-0.01em] text-[var(--tm-ink)]">Team chat</h1>
      <p data-hint className="mt-0.5 text-[13px] text-[var(--tm-ink-muted)]">Talk with your team and your clients.</p>
    </div>
    <ChatWorkspace canCreate />
  </>
);
