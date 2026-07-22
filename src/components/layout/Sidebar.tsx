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
    <aside className="w-64 shrink-0 bg-[#0B1220] border-r border-white/10 flex flex-col h-screen select-none sticky top-0 dark:bg-[#0B1220] dark:text-slate-100">
      {/* Brand Header */}
      <div className="p-6 pb-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4F7CFF] via-[#8B5CF6] to-[#2DD4BF] p-0.5 shadow-lg shadow-[#4F7CFF]/20">
            <div className="w-full h-full bg-[#0B1220] rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[#4F7CFF]" />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white font-sans flex items-center gap-1.5">
              Aether
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#4F7CFF]/20 text-[#4F7CFF] rounded border border-[#4F7CFF]/30">v1.0</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Learn Smarter. Achieve More.</p>
          </div>
        </div>

        {onCloseMobile && (
          <button onClick={onCloseMobile} className="md:hidden p-1 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Quick Command Trigger */}
      <div className="px-4 py-3">
        <button
          onClick={onOpenCommandPalette}
          className="w-full flex items-center justify-between px-3 py-2 bg-[#111B2E] border border-white/10 hover:border-white/20 rounded-xl text-slate-400 hover:text-slate-200 transition-all text-xs cursor-pointer group focus-visible:ring-2 focus-visible:ring-[#4F7CFF] focus-visible:outline-none"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-[#FBBF24] group-hover:scale-110 transition-transform" />
            <span>Search or command...</span>
          </div>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-white/5 text-slate-400 border border-white/10 rounded">
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
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4F7CFF] focus-visible:outline-none ${
                isActive
                  ? 'bg-gradient-to-r from-[#4F7CFF]/20 to-[#8B5CF6]/10 text-white border border-[#4F7CFF]/30 shadow-md shadow-[#4F7CFF]/10'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={isActive ? 'text-[#4F7CFF]' : 'text-slate-400'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-slate-400">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Theme Toggle & Offline Status Footer */}
      <div className="p-4 border-t border-white/5 bg-[#0B1220] space-y-2">
        <button
          onClick={onToggleTheme}
          className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[#111B2E] border border-white/10 hover:border-white/20 text-xs text-slate-300 transition-all cursor-pointer"
        >
          <span className="flex items-center gap-2">
            {isLight ? <Sun className="w-4 h-4 text-[#FBBF24]" /> : <Moon className="w-4 h-4 text-[#8B5CF6]" />}
            <span>{isLight ? 'Light Theme' : 'Dark Theme'}</span>
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400">Switch</span>
        </button>

        <div className="p-3 rounded-xl bg-[#111B2E] border border-white/5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#2DD4BF] animate-pulse" />
            <span className="text-slate-300 font-medium">Local-First Ready</span>
          </div>
          <Wifi className="w-3.5 h-3.5 text-[#2DD4BF]" />
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
