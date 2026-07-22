import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface TabItem {
  id: string;
  label: string;
  badge?: string | number;
  icon?: React.ReactNode;
}

interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  variant?: 'pills' | 'underline';
  size?: 'sm' | 'md';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  activeId,
  onChange,
  variant = 'pills',
  size = 'md',
  className,
}) => {
  return (
    <div
      role="tablist"
      className={twMerge(
        clsx(
          'flex items-center gap-1.5',
          variant === 'pills' ? 'p-1 bg-[var(--bg-secondary)] border border-[var(--border-glass)] rounded-2xl' : 'border-b border-[var(--border-glass)] pb-0.5',
          className
        )
      )}
    >
      {items.map((tab) => {
        const isActive = activeId === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={clsx(
              'inline-flex items-center gap-2 font-medium transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:outline-none select-none',
              size === 'sm' ? 'px-3 py-1.5 text-xs rounded-xl' : 'px-4 py-2 text-sm rounded-xl',
              variant === 'pills' && isActive && 'bg-[var(--accent-blue)] text-white shadow-md shadow-[var(--accent-blue)]/20',
              variant === 'pills' && !isActive && 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-glass)]',
              variant === 'underline' && isActive && 'text-[var(--accent-blue)] border-b-2 border-[var(--accent-blue)] rounded-none pb-2 font-semibold',
              variant === 'underline' && !isActive && 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] pb-2'
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={clsx(
                  'px-1.5 py-0.2 text-[10px] font-mono rounded-full',
                  isActive ? 'bg-white/20 text-white' : 'bg-[var(--border-glass)] text-[var(--text-secondary)]'
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
