import React from 'react';
import { useAetherStore } from './store/useAppStore';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { CommandPalette } from './components/ui/CommandPalette';
import { ExplainabilityModal } from './components/common/ExplainabilityModal';

import { HomeView } from './views/HomeView';
import { PlanView } from './views/PlanView';
import { FocusView } from './views/FocusView';
import { SettingsView } from './views/SettingsView';

export function App() {
  const store = useAetherStore();

  const totalFocusMinutesToday = store.focusSessions.reduce((acc, s) => acc + s.durationMinutes, 0);

  return (
    <div className="flex min-h-screen bg-[#0B1220] text-slate-100 font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={store.activeTab}
        onSelectTab={store.setActiveTab}
        onOpenCommandPalette={() => store.setCommandPaletteOpen(true)}
        focusMinutesToday={totalFocusMinutesToday}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          activeTab={store.activeTab}
          userProfile={store.userProfile || null}
          onOpenCommandPalette={() => store.setCommandPaletteOpen(true)}
          onQuickTask={() => store.setActiveTab('plan')}
        />

        <main className="flex-1 overflow-y-auto pb-12">
          {store.activeTab === 'home' && (
            <HomeView
              nextBestAction={store.nextBestAction}
              tasks={store.tasks}
              subjects={store.subjects}
              focusSessions={store.focusSessions}
              onOpenExplainability={() => store.setExplainabilityModalOpen(true)}
              onSelectTab={store.setActiveTab}
              onToggleTask={store.toggleTaskStatus}
            />
          )}

          {store.activeTab === 'plan' && (
            <PlanView
              tasks={store.tasks}
              subjects={store.subjects}
              onAddTask={store.addTask}
              onToggleTask={store.toggleTaskStatus}
              onDeleteTask={store.deleteTask}
              onAddSubject={store.addSubject}
            />
          )}

          {store.activeTab === 'focus' && (
            <FocusView
              tasks={store.tasks}
              subjects={store.subjects}
              focusSessions={store.focusSessions}
              onLogFocusSession={store.logFocusSession}
            />
          )}

          {store.activeTab === 'settings' && (
            <SettingsView
              userProfile={store.userProfile || null}
              onUpdateProfile={store.updateProfile}
            />
          )}
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={store.commandPaletteOpen}
        onClose={() => store.setCommandPaletteOpen(false)}
        onSelectTab={store.setActiveTab}
        onQuickTask={() => store.setActiveTab('plan')}
        onStartFocus={() => store.setActiveTab('focus')}
      />

      {/* Explainability Reasoning Modal */}
      <ExplainabilityModal
        isOpen={store.explainabilityModalOpen}
        onClose={() => store.setExplainabilityModalOpen(false)}
        nextAction={store.nextBestAction}
      />
    </div>
  );
}

export default App;
