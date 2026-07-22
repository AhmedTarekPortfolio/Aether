import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Home, Calendar, Timer, Settings, Plus, Play, Sparkles } from 'lucide-react';
import { ActiveTab } from '../../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: ActiveTab) => void;
  onQuickTask: () => void;
  onStartFocus: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  onQuickTask,
  onStartFocus,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const items = [
    { id: 'nav-home', label: 'Go to Home Dashboard', category: 'Navigation', icon: <Home className="w-4 h-4 text-[#4F7CFF]" />, action: () => onSelectTab('home') },
    { id: 'nav-plan', label: 'Go to Planner & Tasks', category: 'Navigation', icon: <Calendar className="w-4 h-4 text-[#2DD4BF]" />, action: () => onSelectTab('plan') },
    { id: 'nav-focus', label: 'Go to Focus Room', category: 'Navigation', icon: <Timer className="w-4 h-4 text-[#FBBF24]" />, action: () => onSelectTab('focus') },
    { id: 'nav-settings', label: 'Open Settings', category: 'Navigation', icon: <Settings className="w-4 h-4 text-slate-400" />, action: () => onSelectTab('settings') },
    
    { id: 'act-task', label: 'Create New Task', category: 'Quick Action', icon: <Plus className="w-4 h-4 text-[#2DD4BF]" />, action: () => { onSelectTab('plan'); onQuickTask(); } },
    { id: 'act-focus', label: 'Launch 25-Min Pomodoro Session', category: 'Quick Action', icon: <Play className="w-4 h-4 text-[#FBBF24]" />, action: () => { onSelectTab('focus'); onStartFocus(); } },
  ];

  const filteredItems = items.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#0B1220]/80 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-xl bg-[#111B2E] border border-white/15 rounded-2xl shadow-2xl overflow-hidden z-10"
          >
            {/* Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command or search workspace... (Esc to close)"
                autoFocus
                className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-sm focus:outline-none"
              />
              <kbd className="px-2 py-0.5 text-xs font-semibold text-slate-400 bg-white/5 border border-white/10 rounded-md">
                ESC
              </kbd>
            </div>

            {/* Command List */}
            <div className="p-2 max-h-80 overflow-y-auto space-y-1">
              {filteredItems.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-sm">
                  No matching commands found for "{query}".
                </div>
              ) : (
                filteredItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      item.action();
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 text-slate-200 hover:text-white transition-colors group text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-white/5 border border-white/5 group-hover:border-white/10">
                        {item.icon}
                      </div>
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">{item.category}</span>
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-white/5 bg-[#0B1220]/50 flex items-center justify-between text-xs text-slate-500">
              <span>Aether Command Bar</span>
              <div className="flex items-center gap-2">
                <span>Select</span>
                <kbd className="px-1.5 py-0.5 bg-white/5 rounded">↵</kbd>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
