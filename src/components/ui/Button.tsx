import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'emerald' | 'purple' | 'amber' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] select-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:outline-none';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2.5 font-semibold',
  };

  const variantStyles = {
    primary:
      'bg-[var(--accent-blue)] text-white hover:opacity-90 shadow-lg shadow-[var(--accent-blue)]/20 border border-[var(--accent-blue)]/30',
    secondary:
      'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-glass)] hover:border-[var(--border-glass-hover)]',
    ghost:
      'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-glass)]',
    emerald:
      'bg-[var(--accent-emerald)] text-[var(--text-inverted)] hover:opacity-90 shadow-lg shadow-[var(--accent-emerald)]/20 font-semibold',
    purple:
      'bg-[var(--accent-purple)] text-white hover:opacity-90 shadow-lg shadow-[var(--accent-purple)]/20 border border-[var(--accent-purple)]/30',
    amber:
      'bg-[var(--accent-amber)] text-[var(--text-inverted)] hover:opacity-90 shadow-lg shadow-[var(--accent-amber)]/20 font-semibold',
    danger:
      'bg-[var(--accent-rose)]/20 text-[var(--accent-rose)] border border-[var(--accent-rose)]/30 hover:bg-[var(--accent-rose)]/30',
  };

  return (
    <button
      className={twMerge(clsx(baseStyles, sizeStyles[size], variantStyles[variant], className))}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
};
