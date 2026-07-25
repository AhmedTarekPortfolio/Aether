import React, { useEffect, useRef, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { UserProfile } from '../types';
import { User, Settings as SettingsIcon, Database, Download, Key, ShieldCheck, Lock, Upload } from 'lucide-react';
import { ModelSettingsModal } from '../components/ai/ModelSettingsModal';
import {
  exportFullBackup,
  createPreRestoreSafetyBackup,
  getBackupErrorMessage,
  getLegacyImportErrorMessage,
  getReplaceRestoreErrorMessage,
  importLegacyBackup,
  parseBackupJson,
  prepareLegacyImport,
  prepareReplaceRestore,
  replaceRestore,
  type PreparedLegacyImport,
  type PreparedReplaceRestore,
  type SafetyBackupReceipt,
} from '../services/backupService';
import { desktopBridge } from '../desktop/desktopBridge';
import { isDesktop } from '../desktop/isDesktop';
import { REQUEST_SAFETY_BACKUP_RECOVERY_EVENT } from '../components/common/RestoreRecoveryWarning';
import { inspectRestoreVerificationMarker } from '../services/restoreVerificationState';

interface SettingsViewProps {
  userProfile: UserProfile | null;
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  refreshFromIndexedDb: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  userProfile,
  onUpdateProfile,
  refreshFromIndexedDb,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'system'>('profile');
  const [isModelSettingsOpen, setIsModelSettingsOpen] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);
  const [preparedLegacyImport, setPreparedLegacyImport] = useState<PreparedLegacyImport | null>(null);
  const [isPreparingLegacyImport, setIsPreparingLegacyImport] = useState(false);
  const [isImportingLegacy, setIsImportingLegacy] = useState(false);
  const [legacyImportStatus, setLegacyImportStatus] = useState<{
    kind: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const legacyFileInputRef = useRef<HTMLInputElement>(null);
  const [preparedRestore, setPreparedRestore] = useState<PreparedReplaceRestore | null>(null);
  const [safetyReceipt, setSafetyReceipt] = useState<SafetyBackupReceipt | null>(null);
  const [isPreparingRestore, setIsPreparingRestore] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<{
    kind: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const recoveryFileInputRef = useRef<HTMLInputElement>(null);
  const restoreOperationRef = useRef(false);
  const recoveryPending = inspectRestoreVerificationMarker().status !== 'none';

  // Profile Form State
  const [name, setName] = useState(userProfile?.name || 'Alex Rivera');
  const [email, setEmail] = useState(userProfile?.email || 'alex.rivera@university.edu');
  const [academicLevel, setAcademicLevel] = useState(userProfile?.academicLevel || 'B.S. Computer Science (Year 3)');
  const [studyGoalHoursWeekly, setStudyGoalHoursWeekly] = useState(userProfile?.studyGoalHoursWeekly || 25);

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateProfile({
      name,
      email,
      academicLevel,
      studyGoalHoursWeekly: Number(studyGoalHoursWeekly),
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleExportData = async () => {
    setIsExportingBackup(true);
    setBackupStatus(null);
    try {
      const result = await exportFullBackup();
      setBackupStatus({
        kind: 'success',
        message: [
          'Complete Version 2 backup download started.',
          ...result.warnings,
        ].join(' '),
      });
    } catch (error) {
      setBackupStatus({
        kind: 'error',
        message: getBackupErrorMessage(error),
      });
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleLegacyFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPreparedLegacyImport(null);
    setLegacyImportStatus(null);
    if (!file) return;

    setIsPreparingLegacyImport(true);
    try {
      const parsed = parseBackupJson(await file.text());
      const prepared = await prepareLegacyImport(parsed);
      setPreparedLegacyImport(prepared);
    } catch (error) {
      setLegacyImportStatus({
        kind: 'error',
        message: getLegacyImportErrorMessage(error),
      });
    } finally {
      setIsPreparingLegacyImport(false);
      if (legacyFileInputRef.current) legacyFileInputRef.current.value = '';
    }
  };

  const handleConfirmLegacyImport = async () => {
    if (!preparedLegacyImport) return;
    setIsImportingLegacy(true);
    setLegacyImportStatus(null);
    try {
      const result = await importLegacyBackup(preparedLegacyImport);
      setPreparedLegacyImport(null);
      setLegacyImportStatus({
        kind: 'success',
        message: [
          `Legacy workspace import verified for ${result.summary.totalIncoming} incoming records.`,
          ...result.warnings,
        ].join(' '),
      });
    } catch (error) {
      setLegacyImportStatus({
        kind: 'error',
        message: getLegacyImportErrorMessage(error),
      });
    } finally {
      setIsImportingLegacy(false);
    }
  };

  const handleCancelLegacyImport = () => {
    setPreparedLegacyImport(null);
    setLegacyImportStatus({
      kind: 'info',
      message: 'Legacy import cancelled. No data was changed.',
    });
  };

  const resetRestore = () => {
    setPreparedRestore(null);
    setSafetyReceipt(null);
    if (restoreFileInputRef.current) restoreFileInputRef.current.value = '';
    if (recoveryFileInputRef.current) recoveryFileInputRef.current.value = '';
  };

  const prepareSelectedRestoreText = async (text: string) => {
    setPreparedRestore(prepareReplaceRestore(parseBackupJson(text)));
  };

  const handleRestoreFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    resetRestore();
    setRestoreStatus(null);
    if (!file) return;
    setIsPreparingRestore(true);
    try {
      await prepareSelectedRestoreText(await file.text());
    } catch (error) {
      setRestoreStatus({ kind: 'error', message: getReplaceRestoreErrorMessage(error) });
    } finally {
      setIsPreparingRestore(false);
      if (restoreFileInputRef.current) restoreFileInputRef.current.value = '';
      if (recoveryFileInputRef.current) recoveryFileInputRef.current.value = '';
    }
  };

  const handleRecoverySelection = async () => {
    if (isPreparingRestore || isRestoring) return;
    resetRestore();
    setRestoreStatus(null);
    setActiveTab('system');
    if (!isDesktop()) {
      window.setTimeout(() => recoveryFileInputRef.current?.click(), 0);
      return;
    }
    setIsPreparingRestore(true);
    try {
      const selected = await desktopBridge.openFile({
        title: 'Select the pre-restore safety backup again',
        buttonLabel: 'Select Safety Backup',
      });
      if (selected.cancelled || typeof selected.content !== 'string') {
        setRestoreStatus({ kind: 'info', message: 'Recovery selection cancelled. No data was changed.' });
        return;
      }
      await prepareSelectedRestoreText(selected.content);
    } catch (error) {
      setRestoreStatus({ kind: 'error', message: getReplaceRestoreErrorMessage(error) });
    } finally {
      setIsPreparingRestore(false);
    }
  };

  useEffect(() => {
    const requestRecovery = () => void handleRecoverySelection();
    window.addEventListener(REQUEST_SAFETY_BACKUP_RECOVERY_EVENT, requestRecovery);
    return () => window.removeEventListener(REQUEST_SAFETY_BACKUP_RECOVERY_EVENT, requestRecovery);
  });

  const handleCreateRestoreSafetyBackup = async () => {
    if (!preparedRestore || isRestoring || restoreOperationRef.current) return;
    restoreOperationRef.current = true;
    setIsRestoring(true);
    setRestoreStatus(null);
    try {
      const desktop = isDesktop();
      const receipt = await createPreRestoreSafetyBackup({
        runtime: desktop ? 'electron' : 'browser',
        deliver: async (json, filename) => {
          if (!desktop) {
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            try {
              anchor.href = url;
              anchor.download = filename;
              document.body.appendChild(anchor);
              anchor.click();
            } finally {
              anchor.remove();
              URL.revokeObjectURL(url);
            }
            return true;
          }

          const saved = await desktopBridge.saveFile({
            content: json,
            title: 'Save required pre-restore safety backup',
            defaultPath: filename,
          });
          if (saved.cancelled || !saved.filePath) return false;
          const readback = await desktopBridge.openFile({
            title: 'Verify the saved safety backup',
            buttonLabel: 'Verify Safety Backup',
          });
          if (
            readback.cancelled
            || readback.filePath !== saved.filePath
            || typeof readback.content !== 'string'
            || readback.content !== json
          ) return false;
          prepareReplaceRestore(parseBackupJson(readback.content));
          return true;
        },
      });
      setSafetyReceipt(receipt);
      setRestoreStatus({
        kind: 'info',
        message: desktop
          ? 'Safety backup was written and verified. Confirm complete replacement to continue.'
          : 'Safety backup download was initiated. Confirm that you saved it before complete replacement.',
      });
    } catch (error) {
      setRestoreStatus({ kind: 'error', message: getReplaceRestoreErrorMessage(error) });
    } finally {
      restoreOperationRef.current = false;
      setIsRestoring(false);
    }
  };

  const handleConfirmReplaceRestore = async () => {
    if (!preparedRestore || !safetyReceipt || isRestoring || restoreOperationRef.current) return;
    restoreOperationRef.current = true;
    setIsRestoring(true);
    setRestoreStatus(null);
    try {
      await replaceRestore(preparedRestore, {
        safetyReceipt,
        confirmed: true,
        refresh: async () => refreshFromIndexedDb(),
      });
      resetRestore();
      setRestoreStatus({
        kind: 'success',
        message: 'Complete Version 2 replacement restore finished and verified.',
      });
    } catch (error) {
      setRestoreStatus({ kind: 'error', message: getReplaceRestoreErrorMessage(error) });
    } finally {
      restoreOperationRef.current = false;
      setIsRestoring(false);
    }
  };

  const handleCancelReplaceRestore = () => {
    resetRestore();
    setRestoreStatus({
      kind: 'info',
      message: 'Version 2 restore cancelled. No data was changed.',
    });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Settings Navigation Switcher */}
      <div className="flex items-center gap-2 border-b border-[var(--border-glass)] pb-2">
        <Button
          variant={activeTab === 'profile' ? 'primary' : 'ghost'}
          size="sm"
          icon={<User className="w-4 h-4" />}
          onClick={() => setActiveTab('profile')}
        >
          Student Profile
        </Button>
        <Button
          variant={activeTab === 'system' ? 'purple' : 'ghost'}
          size="sm"
          icon={<SettingsIcon className="w-4 h-4" />}
          onClick={() => setActiveTab('system')}
        >
          System Preferences & Data
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Key className="w-4 h-4" />}
          onClick={() => setIsModelSettingsOpen(true)}
        >
          API & Models
        </Button>
      </div>

      {savedSuccess && (
        <Card className="p-4 bg-[var(--accent-emerald)]/15 border-[var(--accent-emerald)]/30 text-[var(--accent-emerald)] text-xs font-semibold flex items-center justify-between">
          <span>Settings saved successfully to Dexie IndexedDB!</span>
          <ShieldCheck className="w-4 h-4" />
        </Card>
      )}

      {activeTab === 'profile' ? (
        /* Tab 1: Student Profile */
        <Card className="p-8 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Student Profile</h3>
            <p className="text-xs text-[var(--text-secondary)]">Manage your academic goal parameters and identity.</p>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">University Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Academic Program / Level</label>
              <input
                type="text"
                value={academicLevel}
                onChange={(e) => setAcademicLevel(e.target.value)}
                className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Weekly Study Goal ({studyGoalHoursWeekly} Hours)
              </label>
              <input
                type="range"
                min={5}
                max={60}
                value={studyGoalHoursWeekly}
                onChange={(e) => setStudyGoalHoursWeekly(Number(e.target.value))}
                className="w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-blue)]"
              />
            </div>

            <div className="pt-4 border-t border-[var(--border-glass)] flex justify-end">
              <Button variant="primary" size="md" type="submit">
                Save Profile
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        /* Tab 2: System Settings & Backup */
        <div className="space-y-6">
          <Card className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Key className="w-5 h-5 text-[var(--accent-purple)]" />
                  AI Intelligence Engine
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">Offline local-first heuristic intelligence engine active.</p>
              </div>
              <Badge variant="purple" size="sm">Local Active</Badge>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-primary)]">Active Provider</span>
                <span className="text-xs font-mono font-medium text-[var(--accent-emerald)]">Local Offline Synthesizer</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Aether currently uses an offline, explainable rule engine and Web Audio sound generator running 100% locally on your machine.
              </p>

              <div className="pt-2 border-t border-[var(--border-glass)] flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span className="flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  Cloud AI Integration (OpenAI / Gemini / Anthropic)
                </span>
                <Badge variant="gray" size="sm">Coming Soon</Badge>
              </div>
            </div>
          </Card>

          <Card className="p-8 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Database className="w-5 h-5 text-[var(--accent-emerald)]" />
                  Local-First Database & Export
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">Export your complete Dexie IndexedDB study dataset to JSON.</p>
              </div>
              <Badge variant="emerald" size="sm">IndexedDB Ready</Badge>
            </div>

            <Button
              variant="secondary"
              size="md"
              icon={<Download className="w-4 h-4" />}
              onClick={handleExportData}
              disabled={isExportingBackup}
            >
              {isExportingBackup ? 'Validating Complete Backup…' : 'Create Complete Backup (Version 2)'}
            </Button>

            {backupStatus && (
              <p
                role={backupStatus.kind === 'error' ? 'alert' : 'status'}
                className={
                  backupStatus.kind === 'error'
                    ? 'text-xs font-medium text-[var(--accent-rose)]'
                    : 'text-xs font-medium text-[var(--accent-emerald)]'
                }
              >
                {backupStatus.message}
              </p>
            )}
          </Card>

          <Card className="p-8 space-y-4">
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Upload className="w-5 h-5 text-[var(--accent-rose)]" />
                Restore Complete Backup (Version 2)
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Restore a versioned 14-table backup. This completely replaces all application data
                and requires a verified safety backup plus deliberate confirmation.
              </p>
              {recoveryPending && (
                <p className="mt-2 text-xs font-medium text-[var(--accent-amber)]">
                  Recovery mode is active. Select the previously saved safety backup again;
                  Aether does not retain an old browser file or desktop path.
                </p>
              )}
            </div>

            <input
              ref={recoveryFileInputRef}
              aria-label="Select safety backup for deliberate recovery"
              type="file"
              accept=".json,application/json"
              disabled={isPreparingRestore || isRestoring}
              onChange={handleRestoreFileSelection}
              className="sr-only"
            />

            <input
              ref={restoreFileInputRef}
              aria-label="Select Version 2 complete backup JSON"
              type="file"
              accept=".json,application/json"
              disabled={isPreparingRestore || isRestoring}
              onChange={handleRestoreFileSelection}
              className="block w-full text-xs text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--bg-tertiary)] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[var(--text-primary)]"
            />

            {isPreparingRestore && <p role="status" className="text-xs">Validating all 14 tables…</p>}

            {preparedRestore && (
              <div
                aria-label="Version 2 restore confirmation"
                className="space-y-3 rounded-xl border border-[var(--accent-rose)]/30 bg-[var(--accent-rose)]/10 p-4"
              >
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Warning: this replaces all application data
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Selected backup: {preparedRestore.backup.exportedAt}. It contains{' '}
                  {Object.values(preparedRestore.incomingCounts).reduce((sum, count) => sum + count, 0)}{' '}
                  records across 14 tables.
                </p>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(preparedRestore.incomingCounts).map(([table, count]) => (
                    <div key={table} className="rounded-lg bg-[var(--bg-tertiary)] px-3 py-2">
                      <dt className="text-[10px] uppercase text-[var(--text-muted)]">{table}</dt>
                      <dd className="text-sm font-semibold text-[var(--text-primary)]">{count}</dd>
                    </div>
                  ))}
                </dl>
                {!safetyReceipt ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isRestoring}
                    onClick={handleCreateRestoreSafetyBackup}
                  >
                    {isRestoring ? 'Creating Safety Backup…' : 'Create Required Safety Backup'}
                  </Button>
                ) : (
                  <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                    <input type="checkbox" required aria-label="I have saved my safety backup" />
                    I have saved my safety backup and understand that all application data will be replaced.
                  </label>
                )}
                <div className="flex gap-2">
                  {safetyReceipt && (
                    <Button
                      variant="amber"
                      size="sm"
                      disabled={isRestoring}
                      onClick={(event) => {
                        const checkbox = event.currentTarget.parentElement?.parentElement
                          ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
                        if (checkbox?.checked) void handleConfirmReplaceRestore();
                      }}
                    >
                      {isRestoring ? 'Replacing and Verifying…' : 'Confirm Complete Replacement'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isRestoring}
                    onClick={handleCancelReplaceRestore}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {restoreStatus && (
              <p
                role={restoreStatus.kind === 'error' ? 'alert' : 'status'}
                className={restoreStatus.kind === 'error'
                  ? 'text-xs text-[var(--accent-rose)]'
                  : restoreStatus.kind === 'success'
                    ? 'text-xs text-[var(--accent-emerald)]'
                    : 'text-xs text-[var(--text-secondary)]'}
              >
                {restoreStatus.message}
              </p>
            )}
          </Card>

          <Card className="p-8 space-y-4">
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Upload className="w-5 h-5 text-[var(--accent-amber)]" />
                Import Legacy Workspace
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Validate and merge a historical eight-table JSON export. This is not a complete restore.
              </p>
            </div>

            <input
              ref={legacyFileInputRef}
              aria-label="Select legacy workspace JSON"
              type="file"
              accept=".json,application/json"
              disabled={isPreparingLegacyImport || isImportingLegacy}
              onChange={handleLegacyFileSelection}
              className="block w-full text-xs text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--bg-tertiary)] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[var(--text-primary)]"
            />

            {isPreparingLegacyImport && (
              <p role="status" className="text-xs text-[var(--text-secondary)]">
                Validating legacy workspace…
              </p>
            )}

            {preparedLegacyImport && (
              <div
                aria-label="Legacy import confirmation"
                className="space-y-4 rounded-xl border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/10 p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    Confirm partial merge of {preparedLegacyImport.summary.totalIncoming} records
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Matching IDs will be replaced. Existing records absent from this file remain.
                    Goals, AI conversations, statistics, achievement definitions, user achievements,
                    and notifications are untouched.
                  </p>
                </div>

                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(preparedLegacyImport.summary.incomingCounts).map(([table, count]) => (
                    <div key={table} className="rounded-lg bg-[var(--bg-tertiary)] px-3 py-2">
                      <dt className="text-[10px] uppercase text-[var(--text-muted)]">{table}</dt>
                      <dd className="text-sm font-semibold text-[var(--text-primary)]">{count}</dd>
                    </div>
                  ))}
                </dl>

                {preparedLegacyImport.warnings.length > 0 && (
                  <ul className="space-y-1 text-xs text-[var(--accent-amber)]">
                    {preparedLegacyImport.warnings.map((warning, index) => (
                      <li key={`${index}-${warning}`}>{warning}</li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="amber"
                    size="sm"
                    disabled={isImportingLegacy}
                    onClick={handleConfirmLegacyImport}
                  >
                    {isImportingLegacy ? 'Importing and Verifying…' : 'Confirm Legacy Import'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isImportingLegacy}
                    onClick={handleCancelLegacyImport}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {legacyImportStatus && (
              <p
                role={legacyImportStatus.kind === 'error' ? 'alert' : 'status'}
                className={
                  legacyImportStatus.kind === 'error'
                    ? 'text-xs font-medium text-[var(--accent-rose)]'
                    : legacyImportStatus.kind === 'success'
                      ? 'text-xs font-medium text-[var(--accent-emerald)]'
                      : 'text-xs font-medium text-[var(--text-secondary)]'
                }
              >
                {legacyImportStatus.message}
              </p>
            )}
          </Card>
        </div>
      )}
      <ModelSettingsModal
        isOpen={isModelSettingsOpen}
        onClose={() => setIsModelSettingsOpen(false)}
      />
    </div>
  );
};
