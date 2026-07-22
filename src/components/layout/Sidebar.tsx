import React from 'react';
import { Home, Calendar, Timer, Settings, Zap, Sparkles, Wifi, Sun, Moon, X } from 'lucide-react';
import { ActiveTab, UserProfile } from '../../types';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenCommandPalette: () => void;
  focusMinutesToday: number;
  userProfile: UserProfile | null;
  onToggleTheme: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  onOpenCommandPalette,
  focusMinutesToday,
  userProfile,
  onToggleTheme,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const isLight = userProfile?.theme === 'light';

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'home', label: 'Home', icon: <Home className="w-5 h-5" /> },
    { id: 'plan', label: 'Plan & Tasks', icon: <Calendar className="w-5 h-5" /> },
    { id: 'focus', label: 'Focus Room', icon: <Timer className="w-5 h-5" />, badge: `${focusMinutesToday}m` },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  ];

  const content = (
    <aside className="w-64 shrink-0 bg-[var(--bg-primary)] text-[var(--text-primary)] border-r border-[var(--border-glass)] flex flex-col h-screen select-none sticky top-0">
      {/* Brand Header */}
      <div className="p-6 pb-4 flex items-center justify-between border-b border-[var(--border-glass)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent-blue)] via-[var(--accent-purple)] to-[var(--accent-emerald)] p-0.5 shadow-lg shadow-[var(--accent-blue)]/20">
            <div className="w-full h-full bg-[var(--bg-primary)] rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[var(--accent-blue)]" />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)] font-sans flex items-center gap-1.5">
              Aether
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] rounded border border-[var(--accent-blue)]/30">v1.0</span>
            </h1>
            <p className="text-[11px] text-[var(--text-secondary)] font-medium">Learn Smarter. Achieve More.</p>
          </div>
        </div>

        {onCloseMobile && (
          <button onClick={onCloseMobile} className="md:hidden p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Quick Command Trigger */}
      <div className="px-4 py-3">
        <button
          onClick={onOpenCommandPalette}
          className="w-full flex items-center justify-between px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-glass)] hover:border-[var(--border-glass-hover)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all text-xs cursor-pointer group focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:outline-none"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-[var(--accent-amber)] group-hover:scale-110 transition-transform" />
            <span>Search or command...</span>
          </div>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-[var(--border-glass)] text-[var(--text-secondary)] border border-[var(--border-glass)] rounded">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Main Navigation Links */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onSelectTab(item.id);
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:outline-none ${
                isActive
                  ? 'bg-gradient-to-r from-[var(--accent-blue)]/20 to-[var(--accent-purple)]/10 text-[var(--text-primary)] border border-[var(--accent-blue)]/30 shadow-md shadow-[var(--accent-blue)]/10'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-glass)]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={isActive ? 'text-[var(--accent-blue)]' : 'text-[var(--text-secondary)]'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--border-glass)] text-[var(--text-secondary)]">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Theme Toggle & Offline Status Footer */}
      <div className="p-4 border-t border-[var(--border-glass)] bg-[var(--bg-primary)] space-y-2">
        <button
          onClick={onToggleTheme}
          className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-glass)] hover:border-[var(--border-glass-hover)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:outline-none"
        >
          <span className="flex items-center gap-2">
            {isLight ? <Sun className="w-4 h-4 text-[var(--accent-amber)]" /> : <Moon className="w-4 h-4 text-[var(--accent-purple)]" />}
            <span>{isLight ? 'Light Theme' : 'Dark Theme'}</span>
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--border-glass)] text-[var(--text-secondary)]">Switch</span>
        </button>

        <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-glass)] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--accent-emerald)] animate-pulse" />
            <span className="text-[var(--text-secondary)] font-medium">Local-First Ready</span>
          </div>
          <Wifi className="w-3.5 h-3.5 text-[var(--accent-emerald)]" />
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <div className="hidden md:block">{content}</div>

      {/* Mobile Drawer */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onCloseMobile} />
          <div className="relative z-10">{content}</div>
        </div>
      )}
    </>
  );
};
