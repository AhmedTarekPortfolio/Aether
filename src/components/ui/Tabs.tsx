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
          variant === 'pills' ? 'p-1 bg-[#111B2E] border border-white/10 rounded-2xl' : 'border-b border-white/10 pb-0.5',
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
              'inline-flex items-center gap-2 font-medium transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4F7CFF] focus-visible:outline-none select-none',
              size === 'sm' ? 'px-3 py-1.5 text-xs rounded-xl' : 'px-4 py-2 text-sm rounded-xl',
              variant === 'pills' && isActive && 'bg-[#4F7CFF] text-white shadow-md shadow-[#4F7CFF]/20',
              variant === 'pills' && !isActive && 'text-slate-400 hover:text-slate-200 hover:bg-white/5',
              variant === 'underline' && isActive && 'text-[#4F7CFF] border-b-2 border-[#4F7CFF] rounded-none pb-2 font-semibold',
              variant === 'underline' && !isActive && 'text-slate-400 hover:text-slate-200 pb-2'
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={clsx(
                  'px-1.5 py-0.2 text-[10px] font-mono rounded-full',
                  isActive ? 'bg-white/20 text-white' : 'bg-white/5 text-slate-400'
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
