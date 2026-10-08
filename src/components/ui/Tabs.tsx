import React from 'react';
import { PillTabs } from './PillTabs';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * Kept as the app-wide tab API; renders the redesigned pill tabs so every
 * existing call site picks up the new look without changes.
 */
export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange, className = '' }) => (
  <PillTabs tabs={tabs} activeTab={activeTab} onChange={onChange} className={className} />
);
