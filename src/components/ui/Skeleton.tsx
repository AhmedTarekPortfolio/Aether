import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'card' | 'circle' | 'button';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  className,
  style,
  ...props
}) => {
  const variantStyles = {
    text: 'h-4 w-full rounded-md',
    card: 'h-32 w-full rounded-2xl',
    circle: 'w-10 h-10 rounded-full',
    button: 'h-10 w-28 rounded-xl',
  };

  return (
    <div
      className={twMerge(
        clsx(
          'bg-white/5 animate-pulse border border-white/5',
          variantStyles[variant],
          className
        )
      )}
      style={{
        width: width !== undefined ? width : undefined,
        height: height !== undefined ? height : undefined,
        ...style,
      }}
      {...props}
    />
  );
};
