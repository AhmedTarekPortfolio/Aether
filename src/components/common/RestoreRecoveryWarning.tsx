import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Upload } from 'lucide-react';
import { db } from '../../db/database';
import {
  inspectRestoreVerificationMarker,
  RESTORE_VERIFICATION_CHANGED_EVENT,
  verifyPendingRestore,
} from '../../services/restoreVerificationState';
import { Button } from '../ui/Button';

export const REQUEST_SAFETY_BACKUP_RECOVERY_EVENT = 'aether-request-safety-backup-recovery';

interface RestoreRecoveryWarningProps {
  onOpenRecovery: () => void;
  refreshFromIndexedDb: () => Promise<void>;
}

export function RestoreRecoveryWarning({
  onOpenRecovery,
  refreshFromIndexedDb,
}: RestoreRecoveryWarningProps) {
  const [inspectionVersion, setInspectionVersion] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inspection = inspectRestoreVerificationMarker();

  useEffect(() => {
    const update = () => setInspectionVersion((version) => version + 1);
    window.addEventListener(RESTORE_VERIFICATION_CHANGED_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(RESTORE_VERIFICATION_CHANGED_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  void inspectionVersion;

  if (inspection.status === 'none') return null;

  const retry = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    setMessage(null);
    const result = await verifyPendingRestore({
      database: db,
      refresh: async () => refreshFromIndexedDb(),
    });
    setMessage(result.status === 'verified'
      ? 'Restore verification completed successfully.'
      : 'Aether could not verify the restored data. No data was modified.');
    setInspectionVersion((version) => version + 1);
    setIsRetrying(false);
  };

  const openRecovery = () => {
    onOpenRecovery();
    window.setTimeout(() => {
      window.dispatchEvent(new Event(REQUEST_SAFETY_BACKUP_RECOVERY_EVENT));
    }, 0);
  };

  return (
    <section
      role="alert"
      aria-label="Restore verification warning"
      className="mx-4 mt-4 rounded-xl border border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10 p-4 text-sm"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-amber)]" />
        <div className="space-y-3">
          <div>
            <p className="font-semibold text-[var(--text-primary)]">Restore verification needs attention</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              A previous restore was interrupted or could not be verified. Aether will not
              automatically modify your data. Retry performs read-only verification; recovery
              requires selecting the safety backup again and deliberate confirmation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              disabled={isRetrying || inspection.status === 'invalid'}
              onClick={() => void retry()}
            >
              {isRetrying ? 'Verifying…' : 'Retry Verification'}
            </Button>
            <Button
              variant="amber"
              size="sm"
              icon={<Upload className="h-3.5 w-3.5" />}
              onClick={openRecovery}
            >
              Restore from Safety Backup
            </Button>
          </div>
          {inspection.status === 'invalid' && (
            <p className="text-xs text-[var(--accent-rose)]">
              The verification marker is malformed. Read-only retry is unavailable; select a
              safety backup to recover deliberately.
            </p>
          )}
          {message && <p role="status" className="text-xs text-[var(--text-secondary)]">{message}</p>}
        </div>
      </div>
    </section>
  );
}
