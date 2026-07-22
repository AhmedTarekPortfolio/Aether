import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Home, Calendar, BookOpen, Timer, Bot, BarChart2, Settings, Plus, Play, Sparkles, FileText, Tag } from 'lucide-react';
import { ActiveTab, Task, Subject, Note } from '../../types';
import { MOTION_PRESETS } from '../../constants/motion';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: ActiveTab) => void;
  onQuickTask: () => void;
  onStartFocus: () => void;
  tasks?: Task[];
  subjects?: Subject[];
  notes?: Note[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  onQuickTask,
  onStartFocus,
  tasks = [],
  subjects = [],
  notes = [],
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const navItems = [
    { id: 'nav-home', label: 'Go to Home Dashboard', category: 'Navigation', icon: <Home className="w-4 h-4 text-[var(--accent-blue)]" />, action: () => onSelectTab('home') },
    { id: 'nav-plan', label: 'Go to Planner & Tasks', category: 'Navigation', icon: <Calendar className="w-4 h-4 text-[var(--accent-emerald)]" />, action: () => onSelectTab('plan') },
    { id: 'nav-workspace', label: 'Go to Knowledge Workspace', category: 'Navigation', icon: <BookOpen className="w-4 h-4 text-[var(--accent-purple)]" />, action: () => onSelectTab('workspace') },
    { id: 'nav-focus', label: 'Go to Focus Room', category: 'Navigation', icon: <Timer className="w-4 h-4 text-[var(--accent-amber)]" />, action: () => onSelectTab('focus') },
    { id: 'nav-assistant', label: 'Open AI Study Coach', category: 'Navigation', icon: <Bot className="w-4 h-4 text-[var(--accent-blue)]" />, action: () => onSelectTab('assistant') },
    { id: 'nav-insights', label: 'View Learning Analytics', category: 'Navigation', icon: <BarChart2 className="w-4 h-4 text-[var(--accent-emerald)]" />, action: () => onSelectTab('insights') },
    { id: 'nav-settings', label: 'Open Settings & Profile', category: 'Navigation', icon: <Settings className="w-4 h-4 text-[var(--text-secondary)]" />, action: () => onSelectTab('settings') },
    
    { id: 'act-task', label: 'Create New Task', category: 'Quick Action', icon: <Plus className="w-4 h-4 text-[var(--accent-emerald)]" />, action: () => { onSelectTab('plan'); onQuickTask(); } },
    { id: 'act-focus', label: 'Launch 25-Min Pomodoro Session', category: 'Quick Action', icon: <Play className="w-4 h-4 text-[var(--accent-amber)]" />, action: () => { onSelectTab('focus'); onStartFocus(); } },
  ];

  // Dynamic Content Search over tasks, subjects, and notes
  const taskItems = tasks.map((t) => ({
    id: `task-${t.id}`,
    label: `Task: ${t.title}`,
    category: 'Tasks',
    icon: <Calendar className="w-4 h-4 text-[var(--accent-blue)]" />,
    action: () => onSelectTab('plan'),
  }));

  const subjectItems = subjects.map((s) => ({
    id: `sub-${s.id}`,
    label: `Subject: ${s.name} (${s.code || ''})`,
    category: 'Subjects',
    icon: <Tag className="w-4 h-4 text-[var(--accent-emerald)]" />,
    action: () => onSelectTab('workspace'),
  }));

  const noteItems = notes.map((n) => ({
    id: `note-${n.id}`,
    label: `Note: ${n.title}`,
    category: 'Notes',
    icon: <FileText className="w-4 h-4 text-[var(--accent-purple)]" />,
    action: () => onSelectTab('workspace'),
  }));

  const allItems = [...navItems, ...taskItems, ...subjectItems, ...noteItems];

  const filteredItems = allItems.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4">
          <motion.div
            {...MOTION_PRESETS.backdrop}
            onClick={onClose}
            className="fixed inset-0 bg-[var(--bg-overlay)] backdrop-blur-md"
          />

          <motion.div
            {...MOTION_PRESETS.modal}
            className="relative w-full max-w-xl bg-[var(--bg-secondary)] border border-[var(--border-glass-hover)] rounded-2xl shadow-2xl overflow-hidden z-10 text-[var(--text-primary)]"
          >
            {/* Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border-glass)]">
              <Search className="w-5 h-5 text-[var(--text-secondary)] shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks, subjects, notes or commands... (Esc to close)"
                autoFocus
                className="w-full bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] text-sm focus:outline-none"
              />
              <kbd className="px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)] bg-[var(--border-glass)] border border-[var(--border-glass)] rounded-md">
                ESC
              </kbd>
            </div>

            {/* Command & Content Search List */}
            <div className="p-2 max-h-80 overflow-y-auto space-y-1">
              {filteredItems.length === 0 ? (
                <div className="p-6 text-center text-[var(--text-secondary)] text-sm">
                  No matching results found for "{query}".
                </div>
              ) : (
                filteredItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      item.action();
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-[var(--border-glass)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group text-left cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] focus-visible:outline-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-1.5 rounded-lg bg-[var(--border-glass)] border border-[var(--border-glass)] shrink-0">
                        {item.icon}
                      </div>
                      <span className="text-sm font-medium truncate">{item.label}</span>
                    </div>
                    <span className="text-xs text-[var(--text-muted)] font-mono shrink-0 ml-2">{item.category}</span>
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-[var(--border-glass)] bg-[var(--bg-tertiary)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Aether Search & Command Bar</span>
              <div className="flex items-center gap-2">
                <span>Select</span>
                <kbd className="px-1.5 py-0.5 bg-[var(--border-glass)] rounded">↵</kbd>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
