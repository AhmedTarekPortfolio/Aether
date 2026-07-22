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
        <div className="flex items-center gap-2 text-[#8B5CF6]">
          <Sparkles className="w-5 h-5" />
          <span>Explainable AI Reasoning Engine</span>
        </div>
      }
      maxWidth="xl"
    >
      <div className="space-y-6">
        {/* Banner */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-[#4F7CFF]/15 via-[#8B5CF6]/15 to-[#2DD4BF]/15 border border-white/10">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[#4F7CFF]/20 text-[#4F7CFF] shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-100">
                Transparent Decision Model
              </h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Aether evaluates your deadlines, topic confidence gaps, task priorities, and circadian focus windows to calculate the optimal next study session.
              </p>
            </div>
          </div>
        </div>

        {/* Action Title */}
        <div className="p-4 rounded-xl bg-[#0B1220] border border-white/5 space-y-1">
          <div className="text-xs text-slate-400 font-mono flex items-center justify-between">
            <span>RECOMMENDED TASK</span>
            <span className="text-[#2DD4BF] font-semibold">Confidence Score: {nextAction.confidenceScore}%</span>
          </div>
          <div className="text-base font-semibold text-white">{nextAction.title}</div>
          <div className="text-xs text-slate-400">{nextAction.subtitle}</div>
        </div>

        {/* Factor Breakdown */}
        <div className="space-y-3">
          <h5 className="text-xs font-mono uppercase tracking-wider text-slate-400">
            Weighted Factor Breakdown
          </h5>

          <div className="grid gap-3">
            {nextAction.factors.map((factor, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-white/5 border border-white/5 space-y-2 hover:border-white/10 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {factor.category === 'deadline' && <Clock className="w-4 h-4 text-rose-400" />}
                    {factor.category === 'confidence' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                    {factor.category === 'priority' && <Sparkles className="w-4 h-4 text-purple-400" />}
                    {factor.category === 'energy' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    <span className="text-sm font-medium text-slate-200">{factor.name}</span>
                  </div>
                  <span className="text-xs font-semibold font-mono text-[#4F7CFF]">
                    {factor.weight}% Weight
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-[#4F7CFF] to-[#8B5CF6] h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, factor.weight * 2.5)}%` }}
                  />
                </div>

                <p className="text-xs text-slate-400">{factor.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Actionable Recommendations */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
          <h5 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-[#2DD4BF]" />
            How to maximize this session
          </h5>
          <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
            {nextAction.actionableSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
};
