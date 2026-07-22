import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedInitialDataIfEmpty } from '../db/database';
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

export function useAetherStore() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [explainabilityModalOpen, setExplainabilityModalOpen] = useState<boolean>(false);
  
  // Active focus payload deep-linking state
  const [activeFocusTaskId, setActiveFocusTaskId] = useState<string | null>(null);

  // Seed DB on mount
  useEffect(() => {
    seedInitialDataIfEmpty();
  }, []);

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

  // Reactive Dexie Live Queries for 3NF normalized tables
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

  // Task Mutations
  const addTask = async (task: Omit<Task, 'id' | 'userId' | 'createdAt'>) => {
    const newTask: Task = {
      ...task,
      id: `task_${Date.now()}`,
      userId: 'default_user',
      createdAt: Date.now(),
    };
    await db.tasks.add(newTask);
  };

  const toggleTaskStatus = async (taskId: string) => {
    const task = await db.tasks.get(taskId);
    if (!task) return;
    const newStatus = task.status === 'completed' ? 'todo' : 'completed';
    await db.tasks.update(taskId, {
      status: newStatus,
      completedAt: newStatus === 'completed' ? Date.now() : undefined,
    });
  };

  const deleteTask = async (taskId: string) => {
    await db.tasks.delete(taskId);
  };

  // Subject Mutations
  const addSubject = async (subject: Omit<Subject, 'id' | 'userId' | 'createdAt'>) => {
    const newSubject: Subject = {
      ...subject,
      id: `sub_${Date.now()}`,
      userId: 'default_user',
      createdAt: Date.now(),
    };
    await db.subjects.add(newSubject);
  };

  // Note Mutations
  const addNote = async (note: Omit<Note, 'id' | 'userId' | 'updatedAt'>) => {
    const newNote: Note = {
      ...note,
      id: `note_${Date.now()}`,
      userId: 'default_user',
      updatedAt: Date.now(),
    };
    await db.notes.add(newNote);
  };

  const updateNote = async (id: string, content: string, title?: string) => {
    await db.notes.update(id, {
      content,
      title: title || undefined,
      updatedAt: Date.now(),
    });
  };

  // Focus Session Mutations
  const logFocusSession = async (session: Omit<Session, 'id' | 'userId' | 'completedAt'>) => {
    const newSession: Session = {
      ...session,
      id: `focus_${Date.now()}`,
      userId: 'default_user',
      completedAt: Date.now(),
    };
    await db.sessions.add(newSession);

    if (session.taskId) {
      const task = await db.tasks.get(session.taskId);
      if (task) {
        const updatedMinutes = (task.completedMinutes || 0) + session.durationMinutes;
        await db.tasks.update(session.taskId, {
          completedMinutes: updatedMinutes,
          status: updatedMinutes >= task.estimatedMinutes ? 'completed' : 'in_progress',
          completedAt: updatedMinutes >= task.estimatedMinutes ? Date.now() : undefined,
        });
      }
    }
  };

  // AI Chat Mutations
  const addAIMessage = async (msg: Omit<AIConversation, 'id' | 'userId' | 'timestamp'>) => {
    const newMsg: AIConversation = {
      ...msg,
      id: `ai_${Date.now()}`,
      userId: 'default_user',
      timestamp: Date.now(),
    };
    await db.ai_conversations.add(newMsg);
  };

  const clearAIChats = async () => {
    await db.ai_conversations.clear();
  };

  // Notification Mutations
  const markNotificationAsRead = async (id: string) => {
    await db.notifications.update(id, { read: true });
  };

  const markAllNotificationsAsRead = async () => {
    const all = await db.notifications.toArray();
    const unread = all.filter((n) => !n.read);
    await Promise.all(unread.map((n) => db.notifications.update(n.id, { read: true })));
  };

  // Profile & Settings Updates (1:1 split writing)
  const updateProfile = async (updates: Partial<UserProfile>) => {
    const now = Date.now();
    if (updates.name !== undefined || updates.email !== undefined || updates.academicLevel !== undefined) {
      await db.users.update('default_user', {
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
      await db.settings.update('default_settings', {
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
