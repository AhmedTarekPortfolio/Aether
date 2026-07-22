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
    blue: 'bg-[#4F7CFF]/15 text-[#4F7CFF] border-[#4F7CFF]/30',
    emerald: 'bg-[#2DD4BF]/15 text-[#2DD4BF] border-[#2DD4BF]/30',
    purple: 'bg-[#8B5CF6]/15 text-[#8B5CF6] border-[#8B5CF6]/30',
    amber: 'bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30',
    rose: 'bg-[#F43F5E]/15 text-[#F43F5E] border-[#F43F5E]/30',
    gray: 'bg-slate-800/60 text-slate-300 border-slate-700/50',
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
