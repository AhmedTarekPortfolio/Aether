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

export interface Subject {
  id: string;
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
  subjectId: string;
  topicId?: string;
  front: string;
  back: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: number;
}

export interface FocusSession {
  id: string;
  taskId?: string;
  subjectId?: string;
  durationMinutes: number;
  type: 'pomodoro' | 'deep_work' | 'stopwatch';
  distractionCount: number;
  reflectionRating?: number; // 1 - 5 scale
  completedAt: number;
  notes?: string;
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

export interface UserProfile {
  name: string;
  email?: string;
  academicLevel: string;
  studyGoalHoursWeekly: number;
  theme: 'dark' | 'light';
  soundEnabled: boolean;
  aiProvider?: 'local' | 'openai' | 'gemini' | 'anthropic';
  apiKey?: string;
}

export interface AIInteraction {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  mode: 'chat' | 'tutor' | 'writer' | 'code' | 'quiz';
  timestamp: number;
  contextSubjectId?: string;
  explanation?: {
    confidence: number;
    factors: string[];
  };
}

export interface NotificationItem {
  id: string;
  type: 'deadline' | 'confidence' | 'goal' | 'system';
  title: string;
  message: string;
  relatedTaskId?: string;
  relatedSubjectId?: string;
  read: boolean;
  createdAt: number;
}
