import React from 'react';
import { ActiveTab, UserProfile } from '../../types';
import { Sparkles, Plus, Bell, User } from 'lucide-react';
import { Button } from '../ui/Button';

interface TopHeaderProps {
  activeTab: ActiveTab;
  userProfile: UserProfile | null;
  onOpenCommandPalette: () => void;
  onQuickTask: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  userProfile,
  onOpenCommandPalette,
  onQuickTask,
}) => {
  const titles: Record<ActiveTab, { main: string; sub: string }> = {
    home: { main: `Welcome back, ${userProfile?.name || 'Scholar'}`, sub: "Here's your intelligent study orientation for today." },
    plan: { main: 'Planner & Tasks', sub: 'Organize deadlines, assignments, and study schedules.' },
    focus: { main: 'Deep Work Focus Room', sub: 'Distraction-free environment with Web Audio sound synthesis.' },
    settings: { main: 'System Settings', sub: 'Student profile preferences and local data export.' },
  };

  const currentTitle = titles[activeTab];

  return (
    <header className="h-16 px-8 border-b border-white/10 flex items-center justify-between bg-[#0B1220]/80 backdrop-blur-md sticky top-0 z-20">
      {/* Title & Subtitle */}
      <div>
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          {currentTitle.main}
          {activeTab === 'home' && (
            <span className="p-1 rounded-md bg-[#8B5CF6]/15 text-[#8B5CF6]">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
          )}
        </h2>
        <p className="text-xs text-slate-400 font-medium">{currentTitle.sub}</p>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          onClick={onQuickTask}
        >
          New Task
        </Button>

        <button
          onClick={onOpenCommandPalette}
          className="p-2 rounded-xl bg-[#111B2E] border border-white/10 hover:border-white/20 text-slate-400 hover:text-white transition-all cursor-pointer"
          title="Open Command Palette (Cmd+K)"
        >
          <Sparkles className="w-4 h-4 text-[#8B5CF6]" />
        </button>

        <button className="p-2 rounded-xl bg-[#111B2E] border border-white/10 hover:border-white/20 text-slate-400 hover:text-white transition-all cursor-pointer relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#4F7CFF]" />
        </button>

        <div className="flex items-center gap-2 pl-2 border-l border-white/10">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#4F7CFF] to-[#8B5CF6] p-0.5">
            <div className="w-full h-full bg-[#0B1220] rounded-[10px] flex items-center justify-center text-slate-200">
              <User className="w-4 h-4 text-[#4F7CFF]" />
            </div>
          </div>
          <div className="hidden md:block text-left">
            <div className="text-xs font-semibold text-slate-200">{userProfile?.name || 'Alex'}</div>
            <div className="text-[10px] text-slate-500 font-mono">Student Profile</div>
          </div>
        </div>
      </div>
    </header>
  );
};
