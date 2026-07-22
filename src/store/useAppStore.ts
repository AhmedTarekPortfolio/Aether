import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedInitialDataIfEmpty } from '../db/database';
import { ActiveTab, Subject, Task, FocusSession, UserProfile } from '../types';
import { calculateNextBestAction } from '../services/heuristics';

export function useAetherStore() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [explainabilityModalOpen, setExplainabilityModalOpen] = useState<boolean>(false);

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

  // Reactive Dexie Live Queries
  const subjects = useLiveQuery(() => db.subjects.toArray(), []) || [];
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const focusSessions = useLiveQuery(() => db.focusSessions.toArray(), []) || [];
  const userProfile = useLiveQuery(async () => {
    const profile = await db.userProfile.get('default_user');
    return profile || null;
  }, []);

  // Compute Next Best Action using explainable heuristics engine
  const nextBestAction = calculateNextBestAction(tasks, subjects);

  // Task Mutations
  const addTask = async (task: Omit<Task, 'id' | 'createdAt'>) => {
    const newTask: Task = {
      ...task,
      id: `task_${Date.now()}`,
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
  const addSubject = async (subject: Omit<Subject, 'id' | 'createdAt'>) => {
    const newSubject: Subject = {
      ...subject,
      id: `sub_${Date.now()}`,
      createdAt: Date.now(),
    };
    await db.subjects.add(newSubject);
  };

  // Focus Session Mutations
  const logFocusSession = async (session: Omit<FocusSession, 'id' | 'completedAt'>) => {
    const newSession: FocusSession = {
      ...session,
      id: `focus_${Date.now()}`,
      completedAt: Date.now(),
    };
    await db.focusSessions.add(newSession);

    // Update linked task completed minutes if applicable
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

  // Profile Updates
  const updateProfile = async (updates: Partial<UserProfile>) => {
    await db.userProfile.update('default_user', updates);
  };

  return {
    activeTab,
    setActiveTab,
    commandPaletteOpen,
    setCommandPaletteOpen,
    explainabilityModalOpen,
    setExplainabilityModalOpen,

    subjects,
    tasks,
    focusSessions,
    userProfile,
    nextBestAction,

    addTask,
    toggleTaskStatus,
    deleteTask,
    addSubject,
    logFocusSession,
    updateProfile,
  };
}
