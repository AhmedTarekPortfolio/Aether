import React from 'react';
import { Card } from './Card';
import { Button } from './Button';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <Card className="p-12 text-center flex flex-col items-center justify-center space-y-4 max-w-lg mx-auto border-dashed border-white/15">
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-slate-300">
        {icon}
      </div>

      <div className="space-y-1">
        <h4 className="text-base font-bold text-slate-100">{title}</h4>
        <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
      </div>

      {actionLabel && onAction && (
        <Button variant="primary" size="md" onClick={onAction} className="mt-2">
          {actionLabel}
        </Button>
      )}
    </Card>
  );
};
