import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** An upload's API path (needs the login token, so a plain <img src> can't load it). */
  url: string;
}

/** Image for files served by the API: fetched with the login token and shown from a blob URL. */
export const AuthImage: React.FC<Props> = ({ url, alt = '', className = '', ...rest }) => {
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

  if (failed) {
    return (
      <div className={`grid place-items-center bg-[var(--tm-card-muted)] text-[12px] text-[var(--tm-ink-muted)] ${className}`}>
        Photo unavailable
      </div>
    );
  }
  if (!src) return <div className={`animate-pulse bg-[var(--tm-card-muted)] ${className}`} aria-hidden />;
  return <img src={src} alt={alt} className={className} {...rest} />;
};
