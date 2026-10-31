import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ChatWorkspace } from '../../chat/components/ChatWorkspace';

/** The client's conversations with the team. They can't start groups; they join through an invite link. */
export const ClientChatsPage: React.FC = () => (
  <>
    <h1 className="mb-3 text-[20px] font-extrabold tracking-[-0.01em] text-[var(--tm-ink)]">Chats</h1>
    <ChatWorkspace canCreate={false} />
  </>
);

/** Old links (notifications, invites) point at /client/portal?group=…: send them to the right section. */
export const PortalEntry: React.FC = () => {
  const [params] = useSearchParams();
  const group = params.get('group');
  return <Navigate to={group ? `/client/chats?group=${group}` : '/client/home'} replace />;
};
