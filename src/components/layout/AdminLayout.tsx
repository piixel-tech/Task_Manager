import React from 'react';
import { AppShell } from './AppShell';
import { DailyStatusGate } from '../../features/status/components/DailyStatusGate';
import { TaskCompletionCelebration } from '../../features/tasks/components/TaskCompletionCelebration';

export const AdminLayout: React.FC = () => (
  <AppShell
    extras={
      <>
        <DailyStatusGate />
        <TaskCompletionCelebration />
      </>
    }
  />
);
