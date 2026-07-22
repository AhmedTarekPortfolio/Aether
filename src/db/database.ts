import Dexie, { Table } from 'dexie';
import { 
  User,
  Settings,
  Subject, 
  Topic, 
  Task, 
  Note, 
  Flashcard, 
  Session, 
  Goal,
  AIConversation, 
  Statistic,
  AchievementDefinition,
  UserAchievement,
  NotificationItem 
} from '../types';

export class AetherDatabase extends Dexie {
  users!: Table<User>;
  settings!: Table<Settings>;
  subjects!: Table<Subject>;
  topics!: Table<Topic>;
  tasks!: Table<Task>;
  notes!: Table<Note>;
  flashcards!: Table<Flashcard>;
  sessions!: Table<Session>;
  goals!: Table<Goal>;
  ai_conversations!: Table<AIConversation>;
  statistics!: Table<Statistic>;
  achievement_definitions!: Table<AchievementDefinition>;
  user_achievements!: Table<UserAchievement>;
  notifications!: Table<NotificationItem>;

  constructor() {
    super('AetherPhase1DB');

    // Original Phase 1 Schema (4 tables)
    this.version(1).stores({
      subjects: 'id, name, confidenceRating',
      tasks: 'id, subjectId, priority, status, dueDate',
      focusSessions: 'id, subjectId, taskId, completedAt, durationMinutes',
      userProfile: 'id',
    });

    // Version 2 Migration (Extends schema with 5 new tables)
    this.version(2).stores({
      subjects: 'id, name, confidenceRating',
      topics: 'id, subjectId, title, masteryLevel',
      tasks: 'id, subjectId, priority, status, dueDate',
      notes: 'id, subjectId, topicId, title, updatedAt',
      flashcards: 'id, subjectId, topicId, nextReviewDate',
      focusSessions: 'id, subjectId, taskId, completedAt, durationMinutes',
      aiInteractions: 'id, mode, timestamp',
      notifications: 'id, type, read, createdAt',
      userProfile: 'id',
    });

    // Version 3 Migration (3NF Normalized 14-Table Architecture)
    this.version(3).stores({
      users: 'id, &email',
      settings: 'id, &userId',
      subjects: 'id, userId, name, confidenceRating',
      topics: 'id, subjectId, title, masteryLevel',
      tasks: 'id, userId, subjectId, priority, status, dueDate',
      notes: 'id, userId, subjectId, topicId, title, updatedAt',
      flashcards: 'id, userId, subjectId, topicId, nextReviewDate',
      sessions: 'id, userId, subjectId, taskId, completedAt',
      goals: 'id, userId, subjectId, status',
      ai_conversations: 'id, userId, subjectId, mode, timestamp',
      statistics: 'id, userId, [userId+metricKey+periodStart]',
      achievement_definitions: 'id, &key',
      user_achievements: 'id, userId, [userId+achievementId]',
      notifications: 'id, userId, type, createdAt',
      // Old dropped tables marked null
      focusSessions: null,
      aiInteractions: null,
      userProfile: null,
    }).upgrade(async (tx) => {
      const now = Date.now();

      // 1. Migrate userProfile -> users & settings
      const oldProfiles = await tx.table('userProfile').toArray();
      if (oldProfiles.length > 0) {
        const p = oldProfiles[0];
        await tx.table('users').add({
          id: 'default_user',
          name: p.name || 'Alex Rivera',
          email: p.email || 'alex.rivera@university.edu',
          academicLevel: p.academicLevel || 'B.S. Computer Science',
          createdAt: now - 30 * 24 * 60 * 60 * 1000,
          updatedAt: now,
        });
        await tx.table('settings').add({
          id: 'default_settings',
          userId: 'default_user',
          theme: p.theme || 'dark',
          soundEnabled: p.soundEnabled ?? true,
          aiProvider: p.aiProvider || 'local',
          notificationsEnabled: true,
          studyGoalHoursWeekly: p.studyGoalHoursWeekly || 25,
          updatedAt: now,
        });
      } else {
        await tx.table('users').add({
          id: 'default_user',
          name: 'Alex Rivera',
          email: 'alex.rivera@university.edu',
          academicLevel: 'B.S. Computer Science',
          createdAt: now,
          updatedAt: now,
        });
        await tx.table('settings').add({
          id: 'default_settings',
          userId: 'default_user',
          theme: 'dark',
          soundEnabled: true,
          aiProvider: 'local',
          notificationsEnabled: true,
          studyGoalHoursWeekly: 25,
          updatedAt: now,
        });
      }

      // 2. Backfill userId = 'default_user' on existing tables
      await tx.table('subjects').toCollection().modify((s) => {
        if (!s.userId) s.userId = 'default_user';
      });
      await tx.table('tasks').toCollection().modify((t) => {
        if (!t.userId) t.userId = 'default_user';
      });
      await tx.table('flashcards').toCollection().modify((f) => {
        if (!f.userId) f.userId = 'default_user';
      });
      await tx.table('notes').toCollection().modify((n) => {
        if (!n.userId) n.userId = 'default_user';
      });
      await tx.table('notifications').toCollection().modify((n) => {
        if (!n.userId) n.userId = 'default_user';
      });

      // 3. Migrate focusSessions -> sessions
      const oldFocus = await tx.table('focusSessions').toArray();
      for (const f of oldFocus) {
        await tx.table('sessions').add({
          id: f.id,
          userId: 'default_user',
          subjectId: f.subjectId || null,
          taskId: f.taskId || null,
          type: f.type || 'pomodoro',
          durationMinutes: f.durationMinutes || 25,
          distractionCount: f.distractionCount || 0,
          reflectionRating: f.reflectionRating || 5,
          notes: f.notes || '',
          completedAt: f.completedAt || now,
        });
      }

      // 4. Migrate aiInteractions -> ai_conversations
      const oldAI = await tx.table('aiInteractions').toArray();
      for (const a of oldAI) {
        await tx.table('ai_conversations').add({
          id: a.id,
          userId: 'default_user',
          subjectId: a.contextSubjectId || null,
          taskId: null,
          role: a.role || 'assistant',
          mode: a.mode || 'tutor',
          content: a.content || '',
          timestamp: a.timestamp || now,
          explanation: a.explanation,
        });
      }

      // 5. Seed Achievement Definitions
      const starterAchievements: AchievementDefinition[] = [
        { id: 'ach_first_task', key: 'first_task_completed', title: 'First Steps', description: 'Complete your first study task', category: 'tasks', targetValue: 1, icon: 'CheckCircle2' },
        { id: 'ach_focus_5', key: 'five_focus_sessions', title: 'Deep Work Pioneer', description: 'Log 5 completed focus sessions', category: 'focus', targetValue: 5, icon: 'Timer' },
        { id: 'ach_mastery_100', key: 'topic_mastery_100', title: 'Subject Master', description: 'Reach 100% mastery on a topic', category: 'mastery', targetValue: 100, icon: 'Award' },
        { id: 'ach_notes_3', key: 'create_three_notes', title: 'Scholar Note-taker', description: 'Create 3 rich study notes', category: 'notes', targetValue: 3, icon: 'FileText' },
      ];
      for (const ach of starterAchievements) {
        await tx.table('achievement_definitions').add(ach);
      }
    });
  }
}

export const db = new AetherDatabase();

// Seed initial dataset if database is empty
export async function seedInitialDataIfEmpty() {
  const userCount = await db.users.count();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  if (userCount === 0) {
    await db.users.put({
      id: 'default_user',
      name: 'Alex Rivera',
      email: 'alex.rivera@university.edu',
      academicLevel: 'B.S. Computer Science & AI (Year 3)',
      createdAt: now - 30 * dayMs,
      updatedAt: now,
    });
    await db.settings.put({
      id: 'default_settings',
      userId: 'default_user',
      theme: 'dark',
      soundEnabled: true,
      aiProvider: 'local',
      notificationsEnabled: true,
      studyGoalHoursWeekly: 25,
      updatedAt: now,
    });
  }

  const subjectCount = await db.subjects.count();
  if (subjectCount > 0) return;

  // 1. Initial Subjects
  const subjects: Subject[] = [
    {
      id: 'sub_cs301',
      userId: 'default_user',
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
      userId: 'default_user',
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
      userId: 'default_user',
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
      userId: 'default_user',
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

  // 2. Initial Topics
  const topics: Topic[] = [
    { id: 'top_dp', subjectId: 'sub_cs301', title: 'Dynamic Programming & Memoization', masteryLevel: 45, lastReviewedAt: now - 2 * dayMs },
    { id: 'top_graphs', subjectId: 'sub_cs301', title: 'Graph Traversal & Shortest Paths', masteryLevel: 65, lastReviewedAt: now - 4 * dayMs },
    { id: 'top_wave', subjectId: 'sub_phys202', title: 'Schrödinger Wave Equation Derivations', masteryLevel: 35, lastReviewedAt: now - 1 * dayMs },
    { id: 'top_eigen', subjectId: 'sub_math210', title: 'Eigenvalues & Singular Value Decomposition (SVD)', masteryLevel: 88, lastReviewedAt: now - 5 * dayMs },
  ];
  await db.topics.bulkAdd(topics);

  // 3. Initial Tasks
  const tasks: Task[] = [
    {
      id: 'task_1',
      userId: 'default_user',
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
      userId: 'default_user',
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
      userId: 'default_user',
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

  // 4. Initial Notes
  const notes: Note[] = [
    {
      id: 'note_dp',
      userId: 'default_user',
      subjectId: 'sub_cs301',
      topicId: 'top_dp',
      title: 'Mastering Dynamic Programming Patterns',
      content: `# Dynamic Programming & Optimal Substructure

Dynamic programming is an optimization technique that breaks down complex recursive problems into overlapping subproblems.

## The 4-Step DP Framework
1. **Identify States**: Define parameters that uniquely represent subproblems (e.g. \`dp[i][j]\`).
2. **Formulate Recurrence Relation**: Express the state transition equation:
   $$\\text{dp}[i] = \\min_{j < i} (\\text{dp}[j] + \\text{cost}(j, i))$$
3. **Establish Base Cases**: Define starting conditions (e.g. \`dp[0] = 0\`).
4. **Determine Evaluation Order**: Bottom-up (iterative table) vs. Top-down (memoized recursion).

\`\`\`python
def fib_memo(n, memo={}):
    if n in memo: return memo[n]
    if n <= 1: return n
    memo[n] = fib_memo(n-1, memo) + fib_memo(n-2, memo)
    return memo[n]
\`\`\`

> **Pro Tip**: Use rolling arrays to reduce space complexity from $O(N)$ to $O(1)$ when only the previous row is needed.`,
      tags: ['algorithms', 'dp', 'interview-prep'],
      updatedAt: now - 1 * dayMs,
      isFavorite: true,
    },
    {
      id: 'note_wave',
      userId: 'default_user',
      subjectId: 'sub_phys202',
      topicId: 'top_wave',
      title: 'Quantum Wave Mechanics Summary',
      content: `# Quantum Wave Mechanics & Hilbert Spaces

The time-dependent Schrödinger equation describes how the quantum state of a physical system changes over time:

$$i\\hbar \\frac{\\partial}{\\partial t} \\Psi(\\mathbf{r},t) = \\hat{H} \\Psi(\\mathbf{r},t)$$

Where:
- $\\hat{H} = -\\frac{\\hbar^2}{2m} \\nabla^2 + V(\\mathbf{r},t)$ is the Hamiltonian operator.
- $|\\Psi(\\mathbf{r},t)|^2$ represents the probability density of finding the particle at coordinates $\\mathbf{r}$.`,
      tags: ['quantum', 'physics', 'equations'],
      updatedAt: now - 2 * dayMs,
      isFavorite: false,
    },
  ];
  await db.notes.bulkAdd(notes);

  // 5. Initial Sessions
  const sessions: Session[] = [
    {
      id: 'focus_1',
      userId: 'default_user',
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
      userId: 'default_user',
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
  await db.sessions.bulkAdd(sessions);

  // 6. Initial AI Conversations
  const aiChats: AIConversation[] = [
    {
      id: 'ai_1',
      userId: 'default_user',
      role: 'assistant',
      content: "Hello Alex! I've analyzed your schedule. You have a Quantum Physics exam derivation due tomorrow and a Dynamic Programming problem set in 2 days. Would you like me to generate a 5-question practice quiz or explain Schrödinger equation wave derivations?",
      mode: 'tutor',
      timestamp: now - 10 * 60 * 1000,
    },
  ];
  await db.ai_conversations.bulkAdd(aiChats);

  // 7. Initial Notifications
  const notifications: NotificationItem[] = [
    {
      id: 'notif_1',
      userId: 'default_user',
      type: 'deadline',
      title: 'Upcoming Urgent Deadline',
      message: 'Derive 3D Time-Dependent Schrödinger Wave Equation is due in 24 hours!',
      relatedTaskId: 'task_2',
      read: false,
      createdAt: now - 30 * 60 * 1000,
    },
    {
      id: 'notif_2',
      userId: 'default_user',
      type: 'confidence',
      title: 'Low Subject Confidence Warning',
      message: 'Your Quantum Mechanics confidence rating is currently at 42%. Practice quiz recommended.',
      relatedSubjectId: 'sub_phys202',
      read: false,
      createdAt: now - 2 * 60 * 60 * 1000,
    },
  ];
  await db.notifications.bulkAdd(notifications);

  // 8. Initial Achievement Definitions
  const achDefs: AchievementDefinition[] = [
    { id: 'ach_first_task', key: 'first_task_completed', title: 'First Steps', description: 'Complete your first study task', category: 'tasks', targetValue: 1, icon: 'CheckCircle2' },
    { id: 'ach_focus_5', key: 'five_focus_sessions', title: 'Deep Work Pioneer', description: 'Log 5 completed focus sessions', category: 'focus', targetValue: 5, icon: 'Timer' },
    { id: 'ach_mastery_100', key: 'topic_mastery_100', title: 'Subject Master', description: 'Reach 100% mastery on a topic', category: 'mastery', targetValue: 100, icon: 'Award' },
    { id: 'ach_notes_3', key: 'create_three_notes', title: 'Scholar Note-taker', description: 'Create 3 rich study notes', category: 'notes', targetValue: 3, icon: 'FileText' },
  ];
  const existingAch = await db.achievement_definitions.count();
  if (existingAch === 0) {
    await db.achievement_definitions.bulkAdd(achDefs);
  }
}
