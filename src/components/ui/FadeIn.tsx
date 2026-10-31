import React from 'react';

/** Wraps content that replaces a skeleton so it eases in instead of popping. */
export const FadeIn: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`animate-fade-in ${className}`}>{children}</div>
);
