import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { UserProfile } from '../types';
import { db } from '../db/database';
import { Shield, Download, User, CheckCircle2 } from 'lucide-react';

interface SettingsViewProps {
  userProfile: UserProfile | null;
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  userProfile,
  onUpdateProfile,
}) => {
  const [name, setName] = useState(userProfile?.name || 'Alex Rivera');
  const [academicLevel, setAcademicLevel] = useState(userProfile?.academicLevel || 'B.S. Computer Science');
  const [weeklyGoal, setWeeklyGoal] = useState(userProfile?.studyGoalHoursWeekly || 25);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateProfile({
      name,
      academicLevel,
      studyGoalHoursWeekly: Number(weeklyGoal),
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleExportData = async () => {
    const data = {
      userProfile: await db.userProfile.toArray(),
      subjects: await db.subjects.toArray(),
      tasks: await db.tasks.toArray(),
      focusSessions: await db.focusSessions.toArray(),
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Aether_Phase1_Backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <form onSubmit={handleSave} className="space-y-6">
        {/* Profile Card */}
        <Card className="p-6 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-[#4F7CFF]" />
            Personal Student Profile
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 bg-[#0B1220] border border-white/10 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-[#4F7CFF]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Academic Degree / Focus</label>
              <input
                type="text"
                value={academicLevel}
                onChange={(e) => setAcademicLevel(e.target.value)}
                className="w-full px-3.5 py-2 bg-[#0B1220] border border-white/10 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-[#4F7CFF]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Weekly Target Study Hours</label>
            <input
              type="number"
              value={weeklyGoal}
              onChange={(e) => setWeeklyGoal(Number(e.target.value))}
              className="w-full px-3.5 py-2 bg-[#0B1220] border border-white/10 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-[#4F7CFF]"
            />
          </div>
        </Card>

        {/* Save Button */}
        <div className="flex items-center justify-between">
          {savedSuccess ? (
            <span className="text-xs text-[#2DD4BF] font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Settings Saved Successfully!
            </span>
          ) : (
            <span />
          )}

          <Button variant="primary" size="md" type="submit">
            Save Preferences
          </Button>
        </div>
      </form>

      {/* Offline Backup */}
      <Card className="p-6 space-y-4 border-white/15 bg-gradient-to-r from-[#111B2E] to-[#0B1220]">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#2DD4BF]" />
          Offline Data Ownership & Local Backups
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          Aether stores 100% of your subjects, tasks, and focus logs in your local browser database (IndexedDB). Your private data never leaves your device.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            variant="emerald"
            size="sm"
            icon={<Download className="w-4 h-4" />}
            onClick={handleExportData}
          >
            Export Complete Data Backup (.json)
          </Button>
        </div>
      </Card>
    </div>
  );
};
