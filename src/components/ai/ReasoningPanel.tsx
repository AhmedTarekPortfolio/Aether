import React, { useState } from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';

interface ReasoningPanelProps {
  reasoning?: string;
}

export const ReasoningPanel: React.FC<ReasoningPanelProps> = ({ reasoning }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!reasoning || !reasoning.trim()) {
    return null;
  }

  return (
    <div className="my-2.5 rounded-xl border border-[var(--accent-purple)]/30 bg-[var(--accent-purple)]/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-semibold text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/10 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-[var(--accent-purple)]" />
          <span>Model Thinking & Reasoning Process</span>
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="px-3.5 py-3 border-t border-[var(--accent-purple)]/20 text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
          {reasoning}
        </div>
      )}
    </div>
  );
};
