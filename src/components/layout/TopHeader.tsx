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
    <header className="h-16 px-4 md:px-8 border-b border-[var(--border-glass)] flex items-center justify-between bg-[var(--bg-overlay)] backdrop-blur-md sticky top-0 z-20">
      {/* Title & Subtitle + Mobile Hamburger Trigger */}
      <div className="flex items-center gap-3">
        {onOpenMobileSidebar && (
          <button
            onClick={onOpenMobileSidebar}
            className="md:hidden p-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-glass)] text-[var(--text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:outline-none"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div>
          <h2 className="text-sm md:text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
            {currentTitle.main}
            {activeTab === 'home' && (
              <span className="p-1 rounded-md bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
            )}
          </h2>
          <p className="text-[11px] text-[var(--text-secondary)] font-medium hidden sm:block">{currentTitle.sub}</p>
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
          className="p-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-glass)] hover:border-[var(--border-glass-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:outline-none"
          title={`Switch to ${isLight ? 'Dark' : 'Light'} Mode`}
        >
          {isLight ? <Sun className="w-4 h-4 text-[var(--accent-amber)]" /> : <Moon className="w-4 h-4 text-[var(--accent-purple)]" />}
        </button>

        {/* Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="p-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-glass)] hover:border-[var(--border-glass-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:outline-none"
          title="Open Command Palette (Cmd+K)"
        >
          <Sparkles className="w-4 h-4 text-[var(--accent-purple)]" />
        </button>

        {/* Notifications */}
        <button className="p-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-glass)] hover:border-[var(--border-glass-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer relative focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:outline-none">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--accent-blue)]" />
        </button>

        {/* User Avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-[var(--border-glass)]">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[var(--accent-blue)] to-[var(--accent-purple)] p-0.5">
            <div className="w-full h-full bg-[var(--bg-primary)] rounded-[10px] flex items-center justify-center text-[var(--text-primary)]">
              <User className="w-4 h-4 text-[var(--accent-blue)]" />
            </div>
          </div>
          <div className="hidden lg:block text-left">
            <div className="text-xs font-semibold text-[var(--text-primary)]">{userProfile?.name || 'Alex'}</div>
            <div className="text-[10px] text-[var(--text-muted)] font-mono">Student Profile</div>
          </div>
        </div>
      </div>
    </header>
  );
};
