import React, { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ToastHost } from '../components/ui/ToastHost';
import { ConfirmHost } from '../components/ui/ConfirmHost';
import { ProgressToastHost } from '../components/ui/ProgressToastHost';
import { FilePreviewHost } from '../components/ui/FilePreviewHost';
import { TooltipHost } from '../components/ui/TooltipHost';
import { installFormValidation } from '../utils/formValidation';
import { installStackedTables } from '../utils/stackedTables';

export const AppProviders: React.FC = () => {
  // Our own form messages instead of the browser's pop-ups, for every form in every panel.
  useEffect(() => installFormValidation(), []);
  useEffect(() => installStackedTables(), []);

  return (
    <>
      <RouterProvider router={router} />
      <ToastHost />
      <ConfirmHost />
      <FilePreviewHost />
      <TooltipHost />
      <ProgressToastHost />
    </>
  );
};
