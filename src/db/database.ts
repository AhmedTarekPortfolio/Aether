import Dexie, { Table } from 'dexie';
import { 
  Subject, 
  Topic, 
  Task, 
  Note, 
  Flashcard, 
  FocusSession, 
  AIInteraction, 
  NotificationItem, 
  UserProfile 
} from '../types';

export class AetherDatabase extends Dexie {
  subjects!: Table<Subject>;
  topics!: Table<Topic>;
  tasks!: Table<Task>;
  notes!: Table<Note>;
  flashcards!: Table<Flashcard>;
  focusSessions!: Table<FocusSession>;
  aiInteractions!: Table<AIInteraction>;
  notifications!: Table<NotificationItem>;
  userProfile!: Table<UserProfile & { id: string }>;

  constructor() {
    super('AetherPhase3DB');
    this.version(1).stores({
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
    email: 'alex.rivera@university.edu',
    academicLevel: 'B.S. Computer Science & AI (Year 3)',
    studyGoalHoursWeekly: 25,
    theme: 'dark',
    soundEnabled: true,
    aiProvider: 'local',
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

  // 3. Initial Topics
  const topics: Topic[] = [
    { id: 'top_dp', subjectId: 'sub_cs301', title: 'Dynamic Programming & Memoization', masteryLevel: 45, lastReviewedAt: now - 2 * dayMs },
    { id: 'top_graphs', subjectId: 'sub_cs301', title: 'Graph Traversal & Shortest Paths', masteryLevel: 65, lastReviewedAt: now - 4 * dayMs },
    { id: 'top_wave', subjectId: 'sub_phys202', title: 'Schrödinger Wave Equation Derivations', masteryLevel: 35, lastReviewedAt: now - 1 * dayMs },
    { id: 'top_eigen', subjectId: 'sub_math210', title: 'Eigenvalues & Singular Value Decomposition (SVD)', masteryLevel: 88, lastReviewedAt: now - 5 * dayMs },
  ];
  await db.topics.bulkAdd(topics);

  // 4. Initial Tasks
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

  // 5. Initial Notes
  const notes: Note[] = [
    {
      id: 'note_dp',
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

  // 6. Initial Focus Sessions
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

  // 7. Initial AI Chats
  const aiChats: AIInteraction[] = [
    {
      id: 'ai_1',
      role: 'assistant',
      content: "Hello Alex! I've analyzed your schedule. You have a Quantum Physics exam derivation due tomorrow and a Dynamic Programming problem set in 2 days. Would you like me to generate a 5-question practice quiz or explain Schrödinger equation wave derivations?",
      mode: 'tutor',
      timestamp: now - 10 * 60 * 1000,
    },
  ];
  await db.aiInteractions.bulkAdd(aiChats);

  // 8. Initial Notifications
  const notifications: NotificationItem[] = [
    {
      id: 'notif_1',
      type: 'deadline',
      title: 'Upcoming Urgent Deadline',
      message: 'Derive 3D Time-Dependent Schrödinger Wave Equation is due in 24 hours!',
      relatedTaskId: 'task_2',
      read: false,
      createdAt: now - 30 * 60 * 1000,
    },
    {
      id: 'notif_2',
      type: 'confidence',
      title: 'Low Subject Confidence Warning',
      message: 'Your Quantum Mechanics confidence rating is currently at 42%. Practice quiz recommended.',
      relatedSubjectId: 'sub_phys202',
      read: false,
      createdAt: now - 2 * 60 * 60 * 1000,
    },
  ];
  await db.notifications.bulkAdd(notifications);
}
