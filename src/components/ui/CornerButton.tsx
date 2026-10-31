import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Button, type ButtonProps } from './Button';

export interface CornerButtonProps extends Omit<ButtonProps, 'size' | 'variant' | 'children' | 'leftIcon' | 'rightIcon'> {
  /** Accessible name: the text the old pill button carried. */
  label: string;
  icon?: React.ReactNode;
}

/** Solid circular icon button that sits in a card's corner (restyle of a card's existing action). */
export const CornerButton: React.FC<CornerButtonProps> = ({ label, icon, className = '', ...props }) => (
  <Button
    type="button"
    variant="solid"
    size="icon"
    aria-label={label}
    title={label}
    className={`h-9 w-9 shrink-0 ${className}`}
    {...props}
  >
    {icon ?? <ArrowUpRight className="h-4 w-4" />}
  </Button>
);
