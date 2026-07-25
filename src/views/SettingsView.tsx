import React, { useRef, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { UserProfile } from '../types';
import { User, Settings as SettingsIcon, Database, Download, Key, ShieldCheck, Lock, Upload } from 'lucide-react';
import { ModelSettingsModal } from '../components/ai/ModelSettingsModal';
import {
  exportFullBackup,
  getBackupErrorMessage,
  getLegacyImportErrorMessage,
  importLegacyBackup,
  parseBackupJson,
  prepareLegacyImport,
  type PreparedLegacyImport,
} from '../services/backupService';

interface SettingsViewProps {
  userProfile: UserProfile | null;
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  userProfile,
  onUpdateProfile,
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
