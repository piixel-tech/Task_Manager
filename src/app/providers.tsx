import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ToastHost } from '../components/ui/ToastHost';
import { ConfirmHost } from '../components/ui/ConfirmHost';

export const AppProviders: React.FC = () => {
  return (
    <>
      <RouterProvider router={router} />
      <ToastHost />
      <ConfirmHost />
    </>
  );
};
