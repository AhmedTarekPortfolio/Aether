import Dexie, { Table } from 'dexie';
import { Subject, Task, FocusSession, UserProfile } from '../types';

export class AetherDatabase extends Dexie {
  subjects!: Table<Subject>;
  tasks!: Table<Task>;
  focusSessions!: Table<FocusSession>;
  userProfile!: Table<UserProfile & { id: string }>;

  constructor() {
    super('AetherPhase1DB');
    this.version(1).stores({
      subjects: 'id, name, confidenceRating',
      tasks: 'id, subjectId, priority, status, dueDate',
      focusSessions: 'id, subjectId, taskId, completedAt, durationMinutes',
      userProfile: 'id',
    });
  }
}

export const db = new AetherDatabase();

// Seed initial dataset if database is empty
export async function seedInitialDataIfEmpty() {
  const count = await db.subjects.count();
  if (count > 0) return;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // 1. Initial User Profile
  await db.userProfile.put({
    id: 'default_user',
    name: 'Alex Rivera',
    academicLevel: 'B.S. Computer Science & AI (Year 3)',
    studyGoalHoursWeekly: 25,
    theme: 'dark',
    soundEnabled: true,
  });

  // 2. Initial Subjects
  const subjects: Subject[] = [
    {
      id: 'sub_cs301',
      name: 'Advanced Algorithms & Data Structures',
      code: 'CS 301',
      color: '#4F7CFF',
      confidenceRating: 58,
      targetGrade: 'A',
      instructor: 'Dr. Elena Rostova',
      createdAt: now - 30 * dayMs,
    },
    {
      id: 'sub_phys202',
      name: 'Quantum Mechanics & Field Theory',
      code: 'PHYS 202',
      color: '#8B5CF6',
      confidenceRating: 42,
      targetGrade: 'A-',
      instructor: 'Prof. Marcus Vance',
      createdAt: now - 30 * dayMs,
    },
    {
      id: 'sub_math210',
      name: 'Linear Algebra & Optimization',
      code: 'MATH 210',
      color: '#2DD4BF',
      confidenceRating: 82,
      targetGrade: 'A+',
      instructor: 'Dr. Sarah Lin',
      createdAt: now - 30 * dayMs,
    },
    {
      id: 'sub_cog105',
      name: 'Cognitive Neuroscience & Learning',
      code: 'COGS 105',
      color: '#FBBF24',
      confidenceRating: 75,
      targetGrade: 'A',
      instructor: 'Dr. Aris Thorne',
      createdAt: now - 30 * dayMs,
    },
  ];
  await db.subjects.bulkAdd(subjects);

  // 3. Initial Tasks
  const tasks: Task[] = [
    {
      id: 'task_1',
      title: 'Complete CS 301 Dynamic Programming Problem Set #4',
      description: 'Implement Knapsack, Matrix Chain Multiplication, and Edit Distance in Python.',
      subjectId: 'sub_cs301',
      dueDate: now + 2 * dayMs,
      priority: 'high',
      estimatedMinutes: 90,
      completedMinutes: 30,
      status: 'in_progress',
      createdAt: now - 1 * dayMs,
    },
    {
      id: 'task_2',
      title: 'Derive 3D Time-Dependent Schrödinger Wave Equation',
      description: 'Prepare step-by-step mathematical proof for Thursday recitation session.',
      subjectId: 'sub_phys202',
      dueDate: now + 1 * dayMs,
      priority: 'urgent',
      estimatedMinutes: 60,
      completedMinutes: 0,
      status: 'todo',
      createdAt: now - 2 * dayMs,
    },
    {
      id: 'task_3',
      title: 'Review SVD Decomposition Applications in Image Compression',
      description: 'Read Chapter 7 in Strang textbook & implement mini-lab in Python.',
      subjectId: 'sub_math210',
      dueDate: now + 5 * dayMs,
      priority: 'medium',
      estimatedMinutes: 45,
      completedMinutes: 45,
      status: 'completed',
      createdAt: now - 3 * dayMs,
      completedAt: now - 1 * dayMs,
    },
  ];
  await db.tasks.bulkAdd(tasks);

  // 4. Initial Focus Sessions
  const focusSessions: FocusSession[] = [
    {
      id: 'focus_1',
      taskId: 'task_3',
      subjectId: 'sub_math210',
      durationMinutes: 45,
      type: 'pomodoro',
      distractionCount: 1,
      reflectionRating: 5,
      completedAt: now - 1 * dayMs,
      notes: 'Maintained high focus while deriving SVD matrices.',
    },
    {
      id: 'focus_2',
      taskId: 'task_1',
      subjectId: 'sub_cs301',
      durationMinutes: 30,
      type: 'deep_work',
      distractionCount: 2,
      reflectionRating: 4,
      completedAt: now - 5 * 60 * 60 * 1000,
      notes: 'Implemented Edit Distance DP table.',
    },
  ];
  await db.focusSessions.bulkAdd(focusSessions);
}
