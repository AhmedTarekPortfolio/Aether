import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { PreparedAIRequest } from '../../services/ai/types';
import { ShieldCheck, Cpu, FileText, Lock, AlertTriangle } from 'lucide-react';

interface PrivacyPreviewModalProps {
  isOpen: boolean;
  prepared: PreparedAIRequest | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const PrivacyPreviewModal: React.FC<PrivacyPreviewModalProps> = ({
  isOpen,
  prepared,
  onConfirm,
  onCancel,
}) => {
  if (!prepared) return null;

  const { preview } = prepared;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="Privacy & Data Outflow Preview" maxWidth="lg">
      <div className="space-y-4 text-xs text-[var(--text-primary)]">
        <div className="p-3 rounded-xl bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/30 text-[var(--accent-amber)] flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Ask Before Sending</div>
            <div className="text-[11px] leading-relaxed mt-0.5">
              Review the outgoing payload details below before sending data to the external AI provider. No network request has been executed yet.
            </div>
          </div>
        </div>

        {/* Outgoing Details */}
        <div className="p-3.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)] font-medium">Target Provider</span>
            <span className="font-semibold flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[var(--accent-purple)]" />
              {preview.providerName}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)] font-medium">Model ID</span>
            <span className="font-mono text-[var(--text-primary)]">{preview.modelId}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)] font-medium">Mode</span>
            <span className="capitalize font-semibold text-[var(--accent-blue)]">{preview.mode}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)] font-medium">History Messages Sent</span>
            <span className="font-mono">{preview.historyMessageCount} messages</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)] font-medium">Estimated Payload Size</span>
            <span className="font-mono">~{preview.estimatedInputChars} characters</span>
          </div>
        </div>

        {/* Attached Resources */}
        {preview.attachedResources.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-[var(--text-secondary)] font-medium flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
              Attached Study Resources ({preview.attachedResources.length})
            </label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {preview.attachedResources.map((res) => (
                <div key={res.id} className="p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-glass)] text-[11px]">
                  <div><span className="font-bold text-[var(--accent-purple)]">[{res.sourceId}]</span> {res.title}</div>
                  <pre className="mt-1 whitespace-pre-wrap font-sans text-[10px] text-[var(--text-secondary)]">{res.excerpt}</pre>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-glass)]">
          <Button variant="ghost" size="md" onClick={onCancel}>
            Cancel Request
          </Button>
          <Button variant="purple" size="md" icon={<ShieldCheck className="w-4 h-4" />} onClick={onConfirm}>
            Confirm & Send to Provider
          </Button>
        </div>
      </div>
    </Modal>
  );
};
