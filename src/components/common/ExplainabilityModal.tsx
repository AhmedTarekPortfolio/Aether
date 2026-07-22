import React from 'react';
import { Modal } from '../ui/Modal';
import { NextBestAction } from '../../types';
import { Sparkles, HelpCircle, CheckCircle2, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';

interface ExplainabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  nextAction: NextBestAction | null;
}

export const ExplainabilityModal: React.FC<ExplainabilityModalProps> = ({
  isOpen,
  onClose,
  nextAction,
}) => {
  if (!nextAction) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-[var(--accent-purple)]">
          <Sparkles className="w-5 h-5" />
          <span>Explainable AI Reasoning Engine</span>
        </div>
      }
      maxWidth="xl"
    >
      <div className="space-y-6">
        {/* Banner */}
        <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)]">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                Transparent Decision Model
              </h4>
              <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                Aether evaluates your deadlines, topic confidence gaps, task priorities, and circadian focus windows to calculate the optimal next study session.
              </p>
            </div>
          </div>
        </div>

        {/* Action Title */}
        <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-glass)] space-y-1">
          <div className="text-xs text-[var(--text-muted)] font-mono flex items-center justify-between">
            <span>RECOMMENDED TASK</span>
            <span className="text-[var(--accent-emerald)] font-semibold">Confidence Score: {nextAction.confidenceScore}%</span>
          </div>
          <div className="text-base font-semibold text-[var(--text-primary)]">{nextAction.title}</div>
          <div className="text-xs text-[var(--text-secondary)]">{nextAction.subtitle}</div>
        </div>

        {/* Factor Breakdown */}
        <div className="space-y-3">
          <h5 className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
            Weighted Factor Breakdown
          </h5>

          <div className="grid gap-3">
            {nextAction.factors.map((factor, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-[var(--border-glass)] border border-[var(--border-glass)] space-y-2 hover:border-[var(--border-glass-hover)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {factor.category === 'deadline' && <Clock className="w-4 h-4 text-[var(--accent-rose)]" />}
                    {factor.category === 'confidence' && <AlertTriangle className="w-4 h-4 text-[var(--accent-amber)]" />}
                    {factor.category === 'priority' && <Sparkles className="w-4 h-4 text-[var(--accent-purple)]" />}
                    {factor.category === 'energy' && <CheckCircle2 className="w-4 h-4 text-[var(--accent-emerald)]" />}
                    <span className="text-sm font-medium text-[var(--text-primary)]">{factor.name}</span>
                  </div>
                  <span className="text-xs font-semibold font-mono text-[var(--accent-blue)]">
                    {factor.weight}% Weight
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, factor.weight * 2.5)}%` }}
                  />
                </div>

                <p className="text-xs text-[var(--text-secondary)]">{factor.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Actionable Recommendations */}
        <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] space-y-2">
          <h5 className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-[var(--accent-emerald)]" />
            How to maximize this session
          </h5>
          <ul className="text-xs text-[var(--text-secondary)] space-y-1.5 list-disc list-inside">
            {nextAction.actionableSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
};
