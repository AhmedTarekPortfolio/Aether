import { AlertTriangle, Trash2 } from 'lucide-react';
import type { SourcePurgePreview } from '../../services/sources';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface SourcePurgeDialogProps {
  preview: SourcePurgePreview | null;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}

function sourceTypeLabel(sourceType: SourcePurgePreview['sourceType']): string {
  if (sourceType === 'pasted-text') return 'Pasted text';
  if (sourceType === 'markdown') return 'Markdown';
  return sourceType.toUpperCase();
}

function assetExplanation(preview: SourcePurgePreview): string {
  if (preview.assetDisposition === 'no-managed-asset') {
    return 'This source has no managed physical file.';
  }
  if (preview.assetDisposition === 'retain-shared') {
    return 'The managed physical asset is shared. It will remain because another source version still references it.';
  }
  if (preview.assetDisposition === 'delete') {
    return 'The managed physical asset is not shared. It will be deleted after independent identity verification.';
  }
  return 'Shared managed assets will remain; only unreferenced managed assets will be deleted.';
}

export function SourcePurgeDialog({
  preview,
  busy,
  error,
  onClose,
  onConfirm,
}: SourcePurgeDialogProps) {
  return (
    <Modal
      isOpen={Boolean(preview)}
      onClose={() => { if (!busy) onClose(); }}
      title={<><Trash2 className="h-5 w-5 text-[var(--accent-rose)]" /> Permanently delete source</>}
      maxWidth="xl"
    >
      {preview && (
        <div className="space-y-5">
          <div className="rounded-xl border border-[var(--accent-rose)]/30 bg-[var(--accent-rose)]/10 p-4">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-5 w-5 text-[var(--accent-rose)]" />
              This source cannot be restored after deletion.
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Historical grounding excerpt snapshots will remain readable, but links to this source will show “Source deleted”.
            </p>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--text-muted)]">Source title</dt>
              <dd className="font-medium">{preview.displayTitle}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">Source type</dt>
              <dd className="font-medium">{sourceTypeLabel(preview.sourceType)}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">Versions</dt>
              <dd className="font-medium">{preview.versionCount}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">Durable segments</dt>
              <dd className="font-medium">{preview.segmentCount}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">Managed physical assets</dt>
              <dd className="font-medium">{preview.managedAssetCount}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">Shared asset</dt>
              <dd className="font-medium">{preview.sharedAsset ? 'Yes' : 'No'}</dd>
            </div>
          </dl>

          <p className="rounded-xl bg-[var(--bg-tertiary)] p-3 text-sm text-[var(--text-secondary)]">
            {assetExplanation(preview)}
          </p>
          {error && <p role="alert" className="text-sm text-[var(--accent-rose)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? 'Deleting safely…' : 'Permanently delete'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
