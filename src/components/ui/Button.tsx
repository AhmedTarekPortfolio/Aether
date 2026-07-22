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
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] select-none';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2.5 font-semibold',
  };

  const variantStyles = {
    primary: 'bg-[#4F7CFF] text-white hover:bg-[#3B66E6] shadow-lg shadow-[#4F7CFF]/25 border border-blue-400/30',
    secondary: 'bg-[#111B2E] text-slate-200 hover:bg-[#1B2842] border border-white/10 hover:border-white/20',
    ghost: 'text-slate-400 hover:text-slate-100 hover:bg-white/5',
    emerald: 'bg-[#2DD4BF] text-slate-950 hover:bg-[#26bba8] shadow-lg shadow-[#2DD4BF]/25 font-semibold',
    purple: 'bg-[#8B5CF6] text-white hover:bg-[#7c4dff] shadow-lg shadow-[#8B5CF6]/25 border border-purple-400/30',
    amber: 'bg-[#FBBF24] text-slate-950 hover:bg-[#e5ac10] shadow-lg shadow-[#FBBF24]/25 font-semibold',
    danger: 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30',
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
