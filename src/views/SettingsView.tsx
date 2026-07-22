import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { UserProfile } from '../types';
import { db } from '../db/database';
import { User, Settings as SettingsIcon, Sun, Moon, Volume2, Database, Download, Key, ShieldCheck } from 'lucide-react';

interface SettingsViewProps {
  userProfile: UserProfile | null;
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  userProfile,
  onUpdateProfile,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'system'>('profile');

  // Profile Form State
  const [name, setName] = useState(userProfile?.name || 'Alex Rivera');
  const [email, setEmail] = useState(userProfile?.email || 'alex.rivera@university.edu');
  const [academicLevel, setAcademicLevel] = useState(userProfile?.academicLevel || 'B.S. Computer Science (Year 3)');
  const [studyGoalHoursWeekly, setStudyGoalHoursWeekly] = useState(userProfile?.studyGoalHoursWeekly || 25);

  // System Form State
  const [aiProvider, setAiProvider] = useState(userProfile?.aiProvider || 'local');
  const [apiKey, setApiKey] = useState(userProfile?.apiKey || '');
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

  const handleSystemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateProfile({
      aiProvider: aiProvider as any,
      apiKey,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleExportData = async () => {
    const exportData = {
      subjects: await db.subjects.toArray(),
      topics: await db.topics.toArray(),
      tasks: await db.tasks.toArray(),
      notes: await db.notes.toArray(),
      flashcards: await db.flashcards.toArray(),
      focusSessions: await db.focusSessions.toArray(),
      userProfile: await db.userProfile.toArray(),
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Aether_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
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
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Key className="w-5 h-5 text-[var(--accent-purple)]" />
                AI Model & Provider Configuration
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">Choose local heuristic AI or external LLM API provider.</p>
            </div>

            <form onSubmit={handleSystemSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">AI Provider</label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as any)}
                  className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-purple)]"
                >
                  <option value="local">Local Offline Synthesizer (Default)</option>
                  <option value="openai">OpenAI (GPT-4o / O3)</option>
                  <option value="gemini">Google Gemini 2.0 Flash</option>
                  <option value="anthropic">Anthropic Claude 3.5 Sonnet</option>
                </select>
              </div>

              {aiProvider !== 'local' && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-purple)] font-mono"
                  />
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <Button variant="purple" size="md" type="submit">
                  Save Provider Settings
                </Button>
              </div>
            </form>
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
            >
              Export JSON Backup
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
};
