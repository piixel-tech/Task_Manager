import React, { useEffect, useState } from 'react';
import { api } from '../../../services/api';

/** A voice note: fetched with the login token, then played inline. */
export const AuthAudio: React.FC<{ url: string; className?: string }> = ({ url, className = '' }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    api
      .get<Blob>(url.replace(/^\/api\/v1/, ''), { responseType: 'blob' })
      .then(({ data }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data);
        setSrc(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (failed) return <p className="text-[12px] text-[var(--tm-ink-muted)]">Voice note unavailable</p>;
  if (!src) return <div className={`h-10 w-60 animate-pulse rounded-full bg-[var(--tm-card-muted)] ${className}`} aria-label="Loading voice note" />;
  return <audio controls preload="metadata" src={src} className={`h-10 max-w-full ${className}`} />;
};
