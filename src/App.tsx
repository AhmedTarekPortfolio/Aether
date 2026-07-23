import { useState } from 'react';
import { useAetherStore } from './store/useAppStore';
import { useTheme } from './hooks/useTheme';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { CommandPalette } from './components/ui/CommandPalette';
import { ExplainabilityModal } from './components/common/ExplainabilityModal';
import { ToastProvider } from './components/ui/Toast';

import { HomeView } from './views/HomeView';
import { PlanView } from './views/PlanView';
import { WorkspaceView } from './views/WorkspaceView';
import { FocusView } from './views/FocusView';
import { AIAssistantView } from './views/AIAssistantView';
import { InsightsView } from './views/InsightsView';
import { SettingsView } from './views/SettingsView';

export function AppContent() {
  const store = useAetherStore();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Synchronize HTML class with active theme using extracted useTheme hook
  const { toggleTheme } = useTheme(store.userProfile || null, store.updateProfile);

  const handleStartFocusWithTask = (taskId?: string) => {
    if (taskId) store.setActiveFocusTaskId(taskId);
    store.setActiveTab('focus');
  };

  const totalFocusMinutesToday = store.focusSessions.reduce((acc, s) => acc + s.durationMinutes, 0);

  return (
    <div className="flex min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans transition-colors duration-200">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={store.activeTab}
        onSelectTab={store.setActiveTab}
        onOpenCommandPalette={() => store.setCommandPaletteOpen(true)}
        focusMinutesToday={totalFocusMinutesToday}
        userProfile={store.userProfile || null}
        onToggleTheme={toggleTheme}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          activeTab={store.activeTab}
          userProfile={store.userProfile || null}
          notifications={store.notifications}
          onOpenCommandPalette={() => store.setCommandPaletteOpen(true)}
          onQuickTask={() => store.setActiveTab('plan')}
          onToggleTheme={toggleTheme}
          onMarkNotificationRead={store.markNotificationAsRead}
          onMarkAllNotificationsRead={store.markAllNotificationsAsRead}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
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
              onStartFocusWithTask={handleStartFocusWithTask}
              onToggleTask={store.toggleTaskStatus}
            />
          )}

          {store.activeTab === 'plan' && (
            <PlanView
              tasks={store.tasks}
              subjects={store.subjects}
              onAddTask={store.addTask}
              onToggleTask={store.toggleTaskStatus}
              onUpdateTask={store.updateTask}
              onDeleteTask={store.deleteTask}
              onAddSubject={store.addSubject}
              onUpdateSubject={store.updateSubject}
              onDeleteSubject={store.deleteSubject}
            />
          )}

          {store.activeTab === 'workspace' && (
            <WorkspaceView
              subjects={store.subjects}
              topics={store.topics}
              notes={store.notes}
              flashcards={store.flashcards}
              onAddSubject={store.addSubject}
              onUpdateSubject={store.updateSubject}
              onDeleteSubject={store.deleteSubject}
              onAddNote={store.addNote}
              onUpdateNote={store.updateNote}
              onDeleteNote={store.deleteNote}
            />
          )}

          {store.activeTab === 'focus' && (
            <FocusView
              tasks={store.tasks}
              subjects={store.subjects}
              focusSessions={store.focusSessions}
              onLogFocusSession={store.logFocusSession}
              activeFocusTaskId={store.activeFocusTaskId}
            />
          )}

          {store.activeTab === 'assistant' && (
            <AIAssistantView
              aiChats={store.aiChats}
              subjects={store.subjects}
              userProfile={store.userProfile || null}
              onAddAIMessage={store.addAIMessage}
              onClearChats={store.clearAIChats}
            />
          )}

          {store.activeTab === 'insights' && (
            <InsightsView
              subjects={store.subjects}
              tasks={store.tasks}
              focusSessions={store.focusSessions}
              userProfile={store.userProfile || null}
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
        tasks={store.tasks}
        subjects={store.subjects}
        notes={store.notes}
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

export function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
