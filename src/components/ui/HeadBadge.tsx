import React from 'react';
import { Crown } from 'lucide-react';
import { Badge } from './Badge';

/** "Head" is per subfolder, never an account role: show this wherever a person is head. */
export const HeadBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <Badge variant="both" size="sm" className={`inline-flex items-center gap-1 ${className}`}>
    <Crown className="h-3 w-3" />
    Head
  </Badge>
);
