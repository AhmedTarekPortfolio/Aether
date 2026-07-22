import React from 'react';
import { ActiveTab, UserProfile } from '../../types';
import { Sparkles, Plus, Bell, User, Menu, Sun, Moon } from 'lucide-react';
import { Button } from '../ui/Button';

interface TopHeaderProps {
  activeTab: ActiveTab;
  userProfile: UserProfile | null;
  onOpenCommandPalette: () => void;
  onQuickTask: () => void;
  onToggleTheme: () => void;
  onOpenMobileSidebar?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  userProfile,
  onOpenCommandPalette,
  onQuickTask,
  onToggleTheme,
  onOpenMobileSidebar,
}) => {
  const isLight = userProfile?.theme === 'light';

  const titles: Record<ActiveTab, { main: string; sub: string }> = {
    home: { main: `Welcome back, ${userProfile?.name || 'Scholar'}`, sub: "Here's your intelligent study orientation for today." },
    plan: { main: 'Planner & Tasks', sub: 'Organize deadlines, assignments, and study schedules.' },
    focus: { main: 'Deep Work Focus Room', sub: 'Distraction-free environment with Web Audio sound synthesis.' },
    settings: { main: 'System Settings', sub: 'Student profile preferences and local data export.' },
  };

  const currentTitle = titles[activeTab];

  return (
    <header className="h-16 px-4 md:px-8 border-b border-white/10 flex items-center justify-between bg-[#0B1220]/80 backdrop-blur-md sticky top-0 z-20">
      {/* Title & Subtitle + Mobile Hamburger Trigger */}
      <div className="flex items-center gap-3">
        {onOpenMobileSidebar && (
          <button
            onClick={onOpenMobileSidebar}
            className="md:hidden p-2 rounded-xl bg-[#111B2E] border border-white/10 text-slate-300"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div>
          <h2 className="text-sm md:text-base font-semibold text-white flex items-center gap-2">
            {currentTitle.main}
            {activeTab === 'home' && (
              <span className="p-1 rounded-md bg-[#8B5CF6]/15 text-[#8B5CF6]">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
            )}
          </h2>
          <p className="text-[11px] text-slate-400 font-medium hidden sm:block">{currentTitle.sub}</p>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          onClick={onQuickTask}
        >
          <span className="hidden sm:inline">New Task</span>
        </Button>

        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-xl bg-[#111B2E] border border-white/10 hover:border-white/20 text-slate-400 hover:text-white transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4F7CFF] focus-visible:outline-none"
          title={`Switch to ${isLight ? 'Dark' : 'Light'} Mode`}
        >
          {isLight ? <Sun className="w-4 h-4 text-[#FBBF24]" /> : <Moon className="w-4 h-4 text-[#8B5CF6]" />}
        </button>

        {/* Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="p-2 rounded-xl bg-[#111B2E] border border-white/10 hover:border-white/20 text-slate-400 hover:text-white transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4F7CFF] focus-visible:outline-none"
          title="Open Command Palette (Cmd+K)"
        >
          <Sparkles className="w-4 h-4 text-[#8B5CF6]" />
        </button>

        {/* Notifications */}
        <button className="p-2 rounded-xl bg-[#111B2E] border border-white/10 hover:border-white/20 text-slate-400 hover:text-white transition-all cursor-pointer relative focus-visible:ring-2 focus-visible:ring-[#4F7CFF] focus-visible:outline-none">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#4F7CFF]" />
        </button>

        {/* User Avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-white/10">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#4F7CFF] to-[#8B5CF6] p-0.5">
            <div className="w-full h-full bg-[#0B1220] rounded-[10px] flex items-center justify-center text-slate-200">
              <User className="w-4 h-4 text-[#4F7CFF]" />
            </div>
          </div>
          <div className="hidden lg:block text-left">
            <div className="text-xs font-semibold text-slate-200">{userProfile?.name || 'Alex'}</div>
            <div className="text-[10px] text-slate-500 font-mono">Student Profile</div>
          </div>
        </div>
      </div>
    </header>
  );
};
