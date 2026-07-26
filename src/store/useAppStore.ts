import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedInitialDataIfEmpty } from '../db/database';
import { logger } from '../services/logger';
import { readBackupSnapshot, validateBackupSnapshot } from '../services/backupService';
import {
  inspectRestoreVerificationMarker,
  verifyPendingRestore,
} from '../services/restoreVerificationState';
import { 
  ActiveTab, 
  Subject, 
  Topic, 
  Task, 
  Note, 
  Flashcard, 
  Session, 
  Goal,
  Statistic,
  AchievementDefinition,
  UserAchievement,
  AIConversation, 
  NotificationItem, 
  UserProfile 
} from '../types';
import { calculateNextBestAction } from '../services/heuristics';
import * as api from '../api';

const PATH_TO_TAB_MAP: Record<string, ActiveTab> = {
  '/': 'home',
  '/plan': 'plan',
  '/workspace': 'workspace',
  '/focus': 'focus',
  '/assistant': 'assistant',
  '/insights': 'insights',
  '/settings': 'settings',
};

const TAB_TO_PATH_MAP: Record<ActiveTab, string> = {
  home: '/',
  plan: '/plan',
  workspace: '/workspace',
  focus: '/focus',
  assistant: '/assistant',
  insights: '/insights',
  settings: '/settings',
};

export function useAetherStore() {
  const location = useLocation();
  const navigate = useNavigate();

  // Derive activeTab from URL location (defaults to 'home')
  const activeTab: ActiveTab = PATH_TO_TAB_MAP[location.pathname] || 'home';

  const setActiveTab = (tab: string) => {
    const targetPath = TAB_TO_PATH_MAP[tab as ActiveTab] || '/';
    navigate(targetPath);
  };

  // Modals & Active focus payload deep-linking state
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [explainabilityModalOpen, setExplainabilityModalOpen] = useState<boolean>(false);
  const [activeFocusTaskId, setActiveFocusTaskId] = useState<string | null>(null);
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const pendingRefreshRef = useRef<{
    generation: number;
    resolve: () => void;
  } | null>(null);
  const startupPromiseRef = useRef<Promise<void> | null>(null);

  // Cmd/Ctrl + K shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reactive Dexie Live Queries for 3NF normalized tables (read subscriptions)
  const subjectsQuery = useLiveQuery(async () => ({
    generation: refreshGeneration,
    rows: await db.subjects.toArray(),
  }), [refreshGeneration]);
  const topicsQuery = useLiveQuery(async () => ({
    generation: refreshGeneration,
    rows: await db.topics.toArray(),
  }), [refreshGeneration]);
  const tasksQuery = useLiveQuery(async () => ({
    generation: refreshGeneration,
    rows: await db.tasks.toArray(),
  }), [refreshGeneration]);
  const notesQuery = useLiveQuery(async () => ({
    generation: refreshGeneration,
    rows: await db.notes.orderBy('updatedAt').reverse().toArray(),
  }), [refreshGeneration]);
  const flashcardsQuery = useLiveQuery(async () => ({
    generation: refreshGeneration,
    rows: await db.flashcards.toArray(),
  }), [refreshGeneration]);
  const focusSessionsQuery = useLiveQuery(async () => ({
    generation: refreshGeneration,
    rows: await db.sessions.toArray(),
  }), [refreshGeneration]);
  const aiChatsQuery = useLiveQuery(async () => ({
    generation: refreshGeneration,
    rows: await db.ai_conversations.orderBy('timestamp').toArray(),
  }), [refreshGeneration]);
  const notificationsQuery = useLiveQuery(async () => ({
    generation: refreshGeneration,
    rows: await db.notifications.orderBy('createdAt').reverse().toArray(),
  }), [refreshGeneration]);
  const goalsQuery = useLiveQuery(async () => ({
    generation: refreshGeneration,
    rows: await db.goals.toArray(),
  }), [refreshGeneration]);
  const statisticsQuery = useLiveQuery(async () => ({
    generation: refreshGeneration,
    rows: await db.statistics.toArray(),
  }), [refreshGeneration]);
  const achievementDefinitionsQuery = useLiveQuery(async () => ({
    generation: refreshGeneration,
    rows: await api.getAchievementDefinitions(),
  }), [refreshGeneration]);
  const userAchievementsQuery = useLiveQuery(async () => ({
    generation: refreshGeneration,
    rows: await db.user_achievements.where('userId').equals('default_user').toArray(),
  }), [refreshGeneration]);

  // Synthesize userProfile from users & settings tables for UI compatibility
  const userProfileQuery = useLiveQuery(async () => {
    const u = await db.users.get('default_user');
    const s = await db.settings.get('default_settings');
    return {
      generation: refreshGeneration,
      value: u
        ? {
          id: u.id,
          name: u.name,
          email: u.email,
          academicLevel: u.academicLevel,
          studyGoalHoursWeekly: s?.studyGoalHoursWeekly || 25,
          theme: s?.theme || 'dark',
          soundEnabled: s?.soundEnabled ?? true,
          aiProvider: s?.aiProvider || 'local',
        } as UserProfile
        : null,
    };
  }, [refreshGeneration]);

  const refreshFromIndexedDb = async () => {
    if (pendingRefreshRef.current) {
      throw new Error('An application-store refresh is already in progress.');
    }
    const snapshot = await readBackupSnapshot(db);
    validateBackupSnapshot(snapshot);
    const nextGeneration = refreshGeneration + 1;
    await new Promise<void>((resolve) => {
      pendingRefreshRef.current = { generation: nextGeneration, resolve };
      setRefreshGeneration(nextGeneration);
    });
  };

  useEffect(() => {
    const pending = pendingRefreshRef.current;
    if (!pending) return;
    const queryGenerations = [
      subjectsQuery?.generation,
      topicsQuery?.generation,
      tasksQuery?.generation,
      notesQuery?.generation,
      flashcardsQuery?.generation,
      focusSessionsQuery?.generation,
      aiChatsQuery?.generation,
      notificationsQuery?.generation,
      goalsQuery?.generation,
      statisticsQuery?.generation,
      achievementDefinitionsQuery?.generation,
      userAchievementsQuery?.generation,
      userProfileQuery?.generation,
    ];
    if (queryGenerations.every((generation) => generation === pending.generation)) {
      pendingRefreshRef.current = null;
      pending.resolve();
    }
  }, [
    subjectsQuery,
    topicsQuery,
    tasksQuery,
    notesQuery,
    flashcardsQuery,
    focusSessionsQuery,
    aiChatsQuery,
    notificationsQuery,
    goalsQuery,
    statisticsQuery,
    achievementDefinitionsQuery,
    userAchievementsQuery,
    userProfileQuery,
  ]);

  useEffect(() => {
    let active = true;
    if (!startupPromiseRef.current) {
      startupPromiseRef.current = (async () => {
        try {
          const marker = inspectRestoreVerificationMarker();
          if (marker.status === 'none') {
            await seedInitialDataIfEmpty();
            await refreshFromIndexedDb();
          } else if (marker.status === 'pending') {
            await verifyPendingRestore({
              database: db,
              refresh: async () => refreshFromIndexedDb(),
            });
          }
          logger.info('Database initialized and application stores hydrated successfully.');
        } catch {
          logger.error('Database initialization or application-store hydration failed.');
        }
      })();
    }
    void startupPromiseRef.current.finally(() => {
      if (active) setInitialized(true);
    });
    return () => {
      active = false;
    };
    // Startup runs once; refreshFromIndexedDb intentionally uses generation 0.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subjects = subjectsQuery?.rows ?? [];
  const topics = topicsQuery?.rows ?? [];
  const tasks = tasksQuery?.rows ?? [];
  const notes = notesQuery?.rows ?? [];
  const flashcards = flashcardsQuery?.rows ?? [];
  const focusSessions = focusSessionsQuery?.rows ?? [];
  const aiChats = aiChatsQuery?.rows ?? [];
  const notifications = notificationsQuery?.rows ?? [];
  const goals: Goal[] = goalsQuery?.rows ?? [];
  const statistics: Statistic[] = statisticsQuery?.rows ?? [];
  const achievementDefinitions: AchievementDefinition[] = achievementDefinitionsQuery?.rows ?? [];
  const userAchievements: UserAchievement[] = userAchievementsQuery?.rows ?? [];
  const userProfile = userProfileQuery?.value ?? null;

  // Compute Next Best Action using explainable heuristics engine
  const nextBestAction = calculateNextBestAction(tasks, subjects);

  // Task Mutations via API layer
  const addTask = async (task: Omit<Task, 'id' | 'userId' | 'createdAt'>) => {
    const newTask: Task = {
      ...task,
      id: `task_${Date.now()}`,
      userId: 'default_user',
      createdAt: Date.now(),
    };
    await api.addTask(newTask);
  };

  const toggleTaskStatus = async (taskId: string) => {
    const task = await api.getTaskById(taskId);
    if (!task) return;
    const newStatus = task.status === 'completed' ? 'todo' : 'completed';
    await api.updateTask(taskId, {
      status: newStatus,
      completedAt: newStatus === 'completed' ? Date.now() : undefined,
    });
  };

  const updateTask = async (taskId: string, updates: Partial<Task>) => {
    await api.updateTask(taskId, updates);
  };

  const deleteTask = async (taskId: string) => {
    await api.deleteTask(taskId);
  };

  // Subject Mutations via API layer
  const addSubject = async (subject: Omit<Subject, 'id' | 'userId' | 'createdAt'>) => {
    const newSubject: Subject = {
      ...subject,
      id: `sub_${Date.now()}`,
      userId: 'default_user',
      createdAt: Date.now(),
    };
    await api.addSubject(newSubject);
  };

  const updateSubject = async (subjectId: string, updates: Partial<Subject>) => {
    await api.updateSubject(subjectId, updates);
  };

  const deleteSubject = async (subjectId: string) => {
    await api.deleteSubject(subjectId);
  };

  // Note Mutations via API layer
  const addNote = async (note: Omit<Note, 'id' | 'userId' | 'updatedAt'>) => {
    const newNote: Note = {
      ...note,
      id: `note_${Date.now()}`,
      userId: 'default_user',
      updatedAt: Date.now(),
    };
    await api.addNote(newNote);
  };

  const updateNote = async (id: string, updates: Partial<Note>) => {
    await api.updateNote(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  };

  const deleteNote = async (id: string) => {
    await api.deleteNote(id);
  };

  const addTopic = async (topic: Omit<Topic, 'id'>) => {
    await api.addTopic({ ...topic, id: `topic_${Date.now()}` });
  };
  const updateTopic = async (id: string, updates: Partial<Topic>) => api.updateTopic(id, updates);
  const deleteTopic = async (id: string) => api.deleteTopic(id);

  const addFlashcard = async (card: Omit<Flashcard, 'id' | 'userId'>) => {
    await api.addFlashcard({ ...card, id: `card_${Date.now()}`, userId: 'default_user' });
  };
  const updateFlashcard = async (id: string, updates: Partial<Flashcard>) => api.updateFlashcard(id, updates);
  const deleteFlashcard = async (id: string) => api.deleteFlashcard(id);

  const addGoal = async (goal: Omit<Goal, 'id' | 'userId' | 'createdAt'>) => {
    await api.addGoal({ ...goal, id: `goal_${Date.now()}`, userId: 'default_user', createdAt: Date.now() });
  };
  const updateGoal = async (id: string, updates: Partial<Goal>) => api.updateGoal(id, updates);
  const deleteGoal = async (id: string) => api.deleteGoal(id);

  // Focus Session Mutations via API layer
  const logFocusSession = async (session: Omit<Session, 'id' | 'userId' | 'completedAt'>) => {
    const newSession: Session = {
      ...session,
      id: `focus_${Date.now()}`,
      userId: 'default_user',
      completedAt: Date.now(),
    };
    await api.addSession(newSession);

    if (session.taskId) {
      const task = await api.getTaskById(session.taskId);
      if (task) {
        const updatedMinutes = (task.completedMinutes || 0) + session.durationMinutes;
        await api.updateTask(session.taskId, {
          completedMinutes: updatedMinutes,
          status: updatedMinutes >= task.estimatedMinutes ? 'completed' : 'in_progress',
          completedAt: updatedMinutes >= task.estimatedMinutes ? Date.now() : undefined,
        });
      }
    }
  };

  const clearAIChats = async () => {
    await api.clearAIConversations();
  };

  // Notification Mutations via API layer
  const markNotificationAsRead = async (id: string) => {
    await api.markNotificationAsRead(id);
  };

  const markAllNotificationsAsRead = async () => {
    await api.markAllNotificationsAsRead();
  };

  // Profile & Settings Updates via API layer
  const updateProfile = async (updates: Partial<UserProfile>) => {
    const now = Date.now();
    if (updates.name !== undefined || updates.email !== undefined || updates.academicLevel !== undefined) {
      await api.updateUser('default_user', {
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.email !== undefined && { email: updates.email }),
        ...(updates.academicLevel !== undefined && { academicLevel: updates.academicLevel }),
        updatedAt: now,
      });
    }

    if (
      updates.theme !== undefined ||
      updates.soundEnabled !== undefined ||
      updates.aiProvider !== undefined ||
      updates.studyGoalHoursWeekly !== undefined
    ) {
      await api.updateSettings('default_settings', {
        ...(updates.theme !== undefined && { theme: updates.theme }),
        ...(updates.soundEnabled !== undefined && { soundEnabled: updates.soundEnabled }),
        ...(updates.aiProvider !== undefined && { aiProvider: updates.aiProvider }),
        ...(updates.studyGoalHoursWeekly !== undefined && { studyGoalHoursWeekly: updates.studyGoalHoursWeekly }),
        updatedAt: now,
      });
    }
  };

  return {
    activeTab,
    setActiveTab,
    commandPaletteOpen,
    setCommandPaletteOpen,
    explainabilityModalOpen,
    setExplainabilityModalOpen,
    activeFocusTaskId,
    setActiveFocusTaskId,

    subjects,
    topics,
    tasks,
    notes,
    flashcards,
    focusSessions,
    aiChats,
    notifications,
    goals,
    statistics,
    achievementDefinitions,
    userAchievements,
    userProfile,
    nextBestAction,

    addTask: addTask as (task: Omit<Task, 'id' | 'createdAt'>) => Promise<void>,
    toggleTaskStatus,
    updateTask,
    deleteTask,
    addSubject: addSubject as (subject: Omit<Subject, 'id' | 'createdAt'>) => Promise<void>,
    updateSubject,
    deleteSubject,
    addNote: addNote as (note: Omit<Note, 'id' | 'userId' | 'updatedAt'>) => Promise<void>,
    updateNote,
    deleteNote,
    addTopic,
    updateTopic,
    deleteTopic,
    addFlashcard,
    updateFlashcard,
    deleteFlashcard,
    addGoal,
    updateGoal,
    deleteGoal,
    logFocusSession: logFocusSession as (session: Omit<Session, 'id' | 'completedAt'>) => Promise<void>,
    clearAIChats,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    updateProfile,
    refreshFromIndexedDb,
    initialized,
  };
}
