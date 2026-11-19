import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * The round back button left of a page heading. It goes to the previous page when the person came from inside the app,
 * otherwise to the page's parent (`fallback`).
 */
export const BackButton: React.FC<{ fallback: string }> = ({ fallback }) => {
  const navigate = useNavigate();
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback);
  };
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Go back"
      title="Back"
      className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)]
        text-[var(--tm-ink)] shadow-soft-xs transition-colors hover:border-transparent hover:bg-[var(--tm-solid)]
        hover:text-[var(--tm-solid-ink)]"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
};
