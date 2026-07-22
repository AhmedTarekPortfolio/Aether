import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  glow?: 'blue' | 'emerald' | 'purple' | 'amber' | 'none';
}

export const Card: React.FC<CardProps> = ({
  children,
  interactive = false,
  glow = 'none',
  className,
  ...props
}) => {
  const glowClasses = {
    none: '',
    blue: 'glow-blue',
    emerald: 'glow-emerald',
    purple: 'glow-purple',
    amber: 'box-shadow: 0 0 25px -5px rgba(251, 191, 36, 0.4)',
  };

  return (
    <div
      className={twMerge(
        clsx(
          interactive ? 'glass-panel-interactive cursor-pointer' : 'glass-panel',
          'rounded-2xl p-6 transition-all duration-200',
          glowClasses[glow],
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
};
