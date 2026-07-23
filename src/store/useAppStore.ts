import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedInitialDataIfEmpty } from '../db/database';
import { logger } from '../services/logger';
import { 
  ActiveTab, 
  Subject, 
  Topic, 
  Task, 
  Note, 
  Flashcard, 
  Session, 
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

  // Seed DB on mount and log startup
  useEffect(() => {
    seedInitialDataIfEmpty().then(() => {
      logger.info('Database initialized and opened successfully.');
    });
  }, []);

  // Reactive Dexie Live Queries for 3NF normalized tables (read subscriptions)
  const subjects = useLiveQuery(() => db.subjects.toArray(), []) || [];
  const topics = useLiveQuery(() => db.topics.toArray(), []) || [];
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const notes = useLiveQuery(() => db.notes.orderBy('updatedAt').reverse().toArray(), []) || [];
  const flashcards = useLiveQuery(() => db.flashcards.toArray(), []) || [];
  const focusSessions = useLiveQuery(() => db.sessions.toArray(), []) || [];
  const aiChats = useLiveQuery(() => db.ai_conversations.orderBy('timestamp').toArray(), []) || [];
  const notifications = useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().toArray(), []) || [];

  // Synthesize userProfile from users & settings tables for UI compatibility
  const userProfile = useLiveQuery(async () => {
    const u = await db.users.get('default_user');
    const s = await db.settings.get('default_settings');
    if (!u) return null;
    return {
      name: u.name,
      email: u.email,
      academicLevel: u.academicLevel,
      studyGoalHoursWeekly: s?.studyGoalHoursWeekly || 25,
      theme: s?.theme || 'dark',
      soundEnabled: s?.soundEnabled ?? true,
      aiProvider: s?.aiProvider || 'local',
    } as UserProfile;
  }, []);

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

  const updateNote = async (id: string, content: string, title?: string) => {
    await api.updateNote(id, {
      content,
      title: title || undefined,
      updatedAt: Date.now(),
    });
  };

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

  // AI Chat Mutations via API layer
  const addAIMessage = async (msg: Omit<AIConversation, 'id' | 'userId' | 'timestamp'>) => {
    const newMsg: AIConversation = {
      ...msg,
      id: `ai_${Date.now()}`,
      userId: 'default_user',
      timestamp: Date.now(),
    };
    await api.addAIConversation(newMsg);
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
    userProfile,
    nextBestAction,

    addTask: addTask as (task: Omit<Task, 'id' | 'createdAt'>) => Promise<void>,
    toggleTaskStatus,
    deleteTask,
    addSubject: addSubject as (subject: Omit<Subject, 'id' | 'createdAt'>) => Promise<void>,
    deleteSubject,
    addNote: addNote as (note: Omit<Note, 'id' | 'updatedAt'>) => Promise<void>,
    updateNote,
    logFocusSession: logFocusSession as (session: Omit<Session, 'id' | 'completedAt'>) => Promise<void>,
    addAIMessage: addAIMessage as (msg: Omit<AIConversation, 'id' | 'timestamp'>) => Promise<void>,
    clearAIChats,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    updateProfile,
  };
}
