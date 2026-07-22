export type ActiveTab = 
  | 'home' 
  | 'plan' 
  | 'workspace' 
  | 'focus' 
  | 'assistant' 
  | 'insights' 
  | 'settings';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'completed';
export type GoalType = 'study_hours' | 'task_completion' | 'confidence' | 'custom';
export type GoalStatus = 'active' | 'completed' | 'abandoned';

export interface User {
  id: string;
  name: string;
  email: string;
  academicLevel: string;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  id: string;
  userId: string;
  theme: 'dark' | 'light';
  soundEnabled: boolean;
  aiProvider: 'local' | 'openai' | 'gemini' | 'anthropic';
  notificationsEnabled: boolean;
  studyGoalHoursWeekly: number;
  updatedAt: number;
}

export interface Subject {
  id: string;
  userId?: string;
  name: string;
  code?: string;
  color: string;
  confidenceRating: number; // 0 - 100
  targetGrade?: string;
  instructor?: string;
  createdAt: number;
}

export interface Topic {
  id: string;
  subjectId: string;
  title: string;
  masteryLevel: number; // 0 - 100
  lastReviewedAt?: number;
}

export interface Task {
  id: string;
  userId?: string;
  title: string;
  description?: string;
  subjectId?: string;
  dueDate?: number;
  priority: TaskPriority;
  estimatedMinutes: number;
  completedMinutes: number;
  status: TaskStatus;
  createdAt: number;
  completedAt?: number;
}

export interface Note {
  id: string;
  userId?: string;
  subjectId: string;
  topicId?: string;
  title: string;
  content: string; // Markdown & Math content
  tags: string[];
  updatedAt: number;
  isFavorite?: boolean;
}

export interface Flashcard {
  id: string;
  userId?: string;
  subjectId: string;
  topicId?: string;
  front: string;
  back: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: number;
}

export interface Session {
  id: string;
  userId?: string;
  subjectId?: string | null;
  taskId?: string | null;
  type: 'pomodoro' | 'deep_work' | 'stopwatch';
  durationMinutes: number;
  distractionCount: number;
  reflectionRating?: number; // 1 - 5 scale
  notes?: string;
  completedAt: number;
}

// Backward compatibility alias for UI views
export type FocusSession = Session;

export interface Goal {
  id: string;
  userId?: string;
  subjectId?: string | null;
  title: string;
  description: string;
  type: GoalType;
  targetValue: number;
  currentValue: number;
  unit: string;
  deadline?: number | null;
  status: GoalStatus;
  createdAt: number;
  completedAt?: number | null;
}

export interface AIConversation {
  id: string;
  userId?: string;
  subjectId?: string | null;
  taskId?: string | null;
  role: 'user' | 'assistant';
  mode: 'chat' | 'tutor' | 'writer' | 'code' | 'quiz';
  content: string;
  timestamp: number;
  explanation?: {
    confidence: number;
    factors: string[];
  };
}

// Backward compatibility alias for UI views
export type AIInteraction = AIConversation;

export interface Statistic {
  id: string;
  userId?: string;
  metricKey: string;
  periodStart: number;
  periodEnd: number;
  value: number;
  computedAt: number;
}

export interface AchievementDefinition {
  id: string;
  key: string;
  title: string;
  description: string;
  category: string;
  targetValue: number;
  icon: string;
}

export interface UserAchievement {
  id: string;
  userId?: string;
  achievementId: string;
  progress: number;
  unlockedAt?: number | null;
}

export interface NotificationItem {
  id: string;
  userId?: string;
  type: 'deadline' | 'confidence' | 'goal' | 'system';
  title: string;
  message: string;
  relatedTaskId?: string;
  relatedSubjectId?: string;
  read: boolean;
  createdAt: number;
}

export interface RecommendationFactor {
  name: string;
  weight: number; // Percentage 0 - 100
  description: string;
  category: 'deadline' | 'confidence' | 'priority' | 'energy';
}

export interface NextBestAction {
  id: string;
  taskId?: string;
  subjectId?: string;
  title: string;
  subtitle: string;
  reason: string;
  confidenceScore: number; // 0 - 100
  estimatedMinutes: number;
  factors: RecommendationFactor[];
  actionableSteps: string[];
  generatedAt: number;
}

// Combined legacy UserProfile for UI view compatibility
export interface UserProfile {
  name: string;
  email?: string;
  academicLevel: string;
  studyGoalHoursWeekly: number;
  theme: 'dark' | 'light';
  soundEnabled: boolean;
  aiProvider?: 'local' | 'openai' | 'gemini' | 'anthropic';
}
