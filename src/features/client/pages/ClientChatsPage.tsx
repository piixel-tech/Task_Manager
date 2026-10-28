import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ChatWorkspace } from '../../chat/components/ChatWorkspace';

/** The client's conversations with the team. They can't start groups; they join through an invite link. */
export const ClientChatsPage: React.FC = () => (
  <>
    <PageHeader title="Chats" description="Talk to your project team. Messages arrive live." />
    <ChatWorkspace canCreate={false} heightClass="h-[calc(100dvh-17rem)]" />
  </>
);

/** Old links (notifications, invites) point at /client/portal?group=…: send them to the right section. */
export const PortalEntry: React.FC = () => {
  const [params] = useSearchParams();
  const group = params.get('group');
  return <Navigate to={group ? `/client/chats?group=${group}` : '/client/home'} replace />;
};
