import React, { useState } from 'react';
import { ActiveTab, UserProfile, NotificationItem } from '../../types';
import { Sparkles, Plus, Bell, User, Menu, Sun, Moon, CheckCheck, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dropdown } from '../ui/Dropdown';

interface TopHeaderProps {
  activeTab: ActiveTab;
  userProfile: UserProfile | null;
  notifications: NotificationItem[];
  onOpenCommandPalette: () => void;
  onQuickTask: () => void;
  onToggleTheme: () => void;
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
  onOpenMobileSidebar?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  userProfile,
  notifications,
  onOpenCommandPalette,
  onQuickTask,
  onToggleTheme,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onOpenMobileSidebar,
}) => {
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const isLight = userProfile?.theme === 'light';

  const unreadCount = notifications.filter((n) => !n.read).length;

  const titles: Record<ActiveTab, { main: string; sub: string }> = {
    home: { main: `Welcome back, ${userProfile?.name || 'Scholar'}`, sub: "Here's your intelligent study orientation for today." },
    plan: { main: 'Planner & Tasks', sub: 'Organize deadlines, assignments, and study schedules.' },
    workspace: { main: 'Knowledge Workspace', sub: 'Course modules, lecture notes, and formula derivations.' },
    focus: { main: 'Deep Work Focus Room', sub: 'Distraction-free environment with Web Audio sound synthesis.' },
    assistant: { main: 'AI Study Coach', sub: 'Explain concepts, review writing, helper coding, and practice quizzes.' },
    insights: { main: 'Learning Analytics', sub: 'Track focus duration, subject mastery, and productivity velocity.' },
    settings: { main: 'System Settings & Profile', sub: 'Personal student profile and system preferences.' },
  };

  const currentTitle = titles[activeTab] || titles['home'];

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

        {/* Notifications Dropdown (Issue 2 Fixed) */}
        <div className="relative">
          <button
            onClick={() => setIsNotificationOpen(!isNotificationOpen)}
            className="p-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-glass)] hover:border-[var(--border-glass-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer relative focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:outline-none"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent-rose)] text-white text-[9px] font-bold font-mono flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {isNotificationOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-[var(--bg-secondary)] border border-[var(--border-glass-hover)] rounded-2xl shadow-2xl overflow-hidden z-50 p-3 space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-glass)]">
                <span className="text-xs font-bold text-[var(--text-primary)]">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllNotificationsRead}
                    className="text-[10px] text-[var(--accent-blue)] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <CheckCheck className="w-3 h-3" />
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1.5">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[var(--text-secondary)]">No new notifications.</div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => onMarkNotificationRead(n.id)}
                      className={`p-2.5 rounded-xl border transition-all text-xs cursor-pointer ${
                        n.read
                          ? 'bg-[var(--bg-primary)] border-[var(--border-glass)] opacity-60'
                          : 'bg-[var(--bg-tertiary)] border-[var(--border-glass-hover)] font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-primary)]">
                        {n.type === 'deadline' && <Clock className="w-3.5 h-3.5 text-[var(--accent-rose)] shrink-0" />}
                        {n.type === 'confidence' && <AlertTriangle className="w-3.5 h-3.5 text-[var(--accent-amber)] shrink-0" />}
                        <span>{n.title}</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-tight">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

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
