import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'blue' | 'emerald' | 'purple' | 'amber' | 'rose' | 'gray';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'blue',
  size = 'sm',
  className,
}) => {
  const variantStyles = {
    blue: 'bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border-[var(--accent-blue)]/30',
    emerald: 'bg-[var(--accent-emerald)]/15 text-[var(--accent-emerald)] border-[var(--accent-emerald)]/30',
    purple: 'bg-[var(--accent-purple)]/15 text-[var(--accent-purple)] border-[var(--accent-purple)]/30',
    amber: 'bg-[var(--accent-amber)]/15 text-[var(--accent-amber)] border-[var(--accent-amber)]/30',
    rose: 'bg-[var(--accent-rose)]/15 text-[var(--accent-rose)] border-[var(--accent-rose)]/30',
    gray: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-glass)]',
  };

  const sizeStyles = {
    sm: 'px-2.5 py-0.5 text-xs font-medium',
    md: 'px-3 py-1 text-sm font-medium',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1 rounded-full border backdrop-blur-md',
          variantStyles[variant],
          sizeStyles[size],
          className
        )
      )}
    >
      {children}
    </span>
  );
};
