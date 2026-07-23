import React, { useState } from 'react';
import { motion, Variants } from 'framer-motion';
import { Task, Subject, TaskPriority } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { 
  calculatePlanOverview, 
  calculateSubjectSummaries, 
  calculateWeeklyWorkload, 
  getPriorityHighlights, 
  formatDueDate, 
  getCalendarGridDays 
} from '../services/planMetrics';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Plus, 
  Calendar as CalendarIcon, 
  Clock, 
  Trash2, 
  Tag, 
  List, 
  Grid, 
  AlertTriangle, 
  TrendingUp, 
  CheckCircle2, 
  Layers, 
  Target, 
  BookOpen, 
  ArrowUpRight 
} from 'lucide-react';

interface PlanViewProps {
  tasks: Task[];
  subjects: Subject[];
  onAddTask: (task: Omit<Task, 'id' | 'createdAt'>) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onAddSubject: (subject: Omit<Subject, 'id' | 'createdAt'>) => void;
  onDeleteSubject?: (id: string) => Promise<void> | void;
}

// Framer Motion Animation Variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3 },
  },
};

export const PlanView: React.FC<PlanViewProps> = ({
  tasks,
  subjects,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onAddSubject,
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [filter, setFilter] = useState<'all' | 'todo' | 'completed'>('all');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);

  // Task Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(45);
  const [dueDate, setDueDate] = useState<string>(
    new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );

  // Subject Form State
  const [subName, setSubName] = useState('');
  const [subCode, setSubCode] = useState('');
  const [subColor, setSubColor] = useState('var(--accent-blue)');
  const [subConfidence, setSubConfidence] = useState<number>(70);

  // Derived Business Logic & Metrics
  const overview = calculatePlanOverview(tasks);
  const subjectSummaries = calculateSubjectSummaries(tasks, subjects);
  const weeklyWorkload = calculateWeeklyWorkload(tasks);
  const priorityHighlights = getPriorityHighlights(tasks);
  const calendarDays = getCalendarGridDays();

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'todo') return t.status !== 'completed';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  const handleTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onAddTask({
      title,
      description,
      subjectId: subjectId || undefined,
      priority,
      estimatedMinutes: Number(estimatedMinutes) || 30,
      completedMinutes: 0,
      status: 'todo',
      dueDate: dueDate ? new Date(`${dueDate}T23:59:59`).getTime() : undefined,
    });

    setTitle('');
    setDescription('');
    setSubjectId('');
    setDueDate(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    setIsTaskModalOpen(false);
  };

  const handleSubjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim()) return;

    onAddSubject({
      name: subName,
      code: subCode || undefined,
      color: subColor,
      confidenceRating: Number(subConfidence) || 70,
    });

    setSubName('');
    setSubCode('');
    setIsSubjectModalOpen(false);
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="p-6 md:p-8 max-w-7xl mx-auto space-y-8"
    >
      {/* 1. HERO SECTION: Header & Quick Statistics */}
      <motion.section variants={itemVariants} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
              Planner Workspace
            </h1>
            <p className="text-xs md:text-sm text-[var(--text-secondary)] mt-1">
              Organize, schedule, and track your academic task queue.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="md"
              icon={<BookOpen className="w-4 h-4" />}
              onClick={() => setIsSubjectModalOpen(true)}
            >
              Add Subject
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setIsTaskModalOpen(true)}
            >
              Add Task
            </Button>
          </div>
        </div>
      </motion.section>

      {/* 2. PLANNING OVERVIEW CARDS (4-Metric Row) */}
      <motion.section variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Pending Tasks</span>
            <Layers className="w-4 h-4 text-[var(--accent-blue)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {overview.pendingTasks} <span className="text-xs font-normal text-[var(--text-muted)]">/ {overview.totalTasks}</span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Active items in queue</p>
        </Card>

        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Upcoming Deadlines</span>
            <CalendarIcon className="w-4 h-4 text-[var(--accent-amber)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {overview.upcomingDeadlinesCount}
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Scheduled deadlines</p>
        </Card>

        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Completion Rate</span>
            <Target className="w-4 h-4 text-[var(--accent-emerald)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {overview.completionPercentage}%
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">{overview.completedTasks} tasks completed</p>
        </Card>

        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Pending Workload</span>
            <Clock className="w-4 h-4 text-[var(--accent-purple)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {overview.totalWorkloadMinutes} <span className="text-xs font-normal text-[var(--text-muted)]">mins</span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Estimated study duration</p>
        </Card>
      </motion.section>

      {/* 3. TIMELINE / SCHEDULE SECTION (List vs Calendar Grid) */}
      <motion.section variants={itemVariants} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'list' ? 'primary' : 'ghost'}
              size="sm"
              icon={<List className="w-4 h-4" />}
              onClick={() => setViewMode('list')}
            >
              List View
            </Button>
            <Button
              variant={viewMode === 'calendar' ? 'purple' : 'ghost'}
              size="sm"
              icon={<Grid className="w-4 h-4" />}
              onClick={() => setViewMode('calendar')}
            >
              7-Day Grid
            </Button>
          </div>

          {viewMode === 'list' && (
            <div className="flex items-center gap-1.5 bg-[var(--bg-secondary)] p-1 rounded-xl border border-[var(--border-glass)] text-xs">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  filter === 'all' ? 'bg-[var(--accent-blue)] text-white font-medium' : 'text-[var(--text-secondary)]'
                }`}
              >
                All ({tasks.length})
              </button>
              <button
                onClick={() => setFilter('todo')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  filter === 'todo' ? 'bg-[var(--accent-blue)] text-white font-medium' : 'text-[var(--text-secondary)]'
                }`}
              >
                To Do ({overview.pendingTasks})
              </button>
              <button
                onClick={() => setFilter('completed')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  filter === 'completed' ? 'bg-[var(--accent-blue)] text-white font-medium' : 'text-[var(--text-secondary)]'
                }`}
              >
                Completed ({overview.completedTasks})
              </button>
            </div>
          )}
        </div>

        {viewMode === 'list' ? (
          <div className="grid grid-cols-1 gap-3">
            {filteredTasks.length === 0 ? (
              <Card className="p-12 text-center text-[var(--text-secondary)] border border-dashed border-[var(--border-glass)] space-y-2">
                <p className="text-sm font-semibold text-[var(--text-primary)]">No tasks found</p>
                <p className="text-xs text-[var(--text-muted)]">No study tasks match your current filter.</p>
              </Card>
            ) : (
              filteredTasks.map((task) => {
                const subject = task.subjectId ? subjectMap.get(task.subjectId) : undefined;
                const isCompleted = task.status === 'completed';

                return (
                  <Card
                    key={task.id}
                    interactive
                    className={`p-5 flex items-center justify-between gap-4 transition-all border border-[var(--border-glass)] ${
                      isCompleted ? 'opacity-60 bg-[var(--bg-tertiary)]' : ''
                    }`}
                  >
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={isCompleted}
                        onChange={() => onToggleTask(task.id)}
                        className="w-5 h-5 mt-0.5 rounded-md border-[var(--border-glass-hover)] bg-[var(--bg-input)] text-[var(--accent-blue)] focus:ring-0 cursor-pointer"
                      />
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className={`text-sm md:text-base font-semibold text-[var(--text-primary)] ${isCompleted ? 'line-through text-[var(--text-muted)]' : ''}`}>
                          {task.title}
                        </div>
                        {task.description && (
                          <p className="text-xs text-[var(--text-secondary)] line-clamp-1">{task.description}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 pt-1.5 text-xs text-[var(--text-secondary)]">
                          {subject && (
                            <span
                              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-1"
                              style={{ backgroundColor: `${subject.color}20`, color: subject.color }}
                            >
                              <Tag className="w-3 h-3" />
                              {subject.code || subject.name}
                            </span>
                          )}

                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            {task.estimatedMinutes} mins
                          </span>

                          <span className="flex items-center gap-1 font-mono text-[11px]">
                            <CalendarIcon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            {formatDueDate(task.dueDate)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          task.priority === 'urgent'
                            ? 'rose'
                            : task.priority === 'high'
                            ? 'amber'
                            : 'gray'
                        }
                        size="sm"
                      >
                        {task.priority.toUpperCase()}
                      </Badge>

                      <button
                        onClick={() => onDeleteTask(task.id)}
                        className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-rose)] rounded-lg hover:bg-[var(--accent-rose)]/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        ) : (
          /* 7-Day Calendar Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-4">
            {calendarDays.map((cd) => {
              const dayTasks = tasks.filter((t) => {
                if (!t.dueDate) return false;
                const dStr = new Date(t.dueDate).toISOString().slice(0, 10);
                return dStr === cd.dateStr;
              });

              return (
                <Card key={cd.dateStr} className="p-4 space-y-3 min-h-[280px] border border-[var(--border-glass)]">
                  <div className="pb-2 border-b border-[var(--border-glass)] flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--text-primary)] font-mono">{cd.dayName}</span>
                    <span className="text-sm font-bold text-[var(--accent-purple)] font-mono">{cd.dayNum}</span>
                  </div>

                  <div className="space-y-2">
                    {dayTasks.length === 0 ? (
                      <div className="text-[11px] text-[var(--text-muted)] italic pt-4 text-center">No deadlines</div>
                    ) : (
                      dayTasks.map((t) => (
                        <div
                          key={t.id}
                          className="p-2.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] space-y-1 text-xs"
                        >
                          <div className="font-semibold text-[var(--text-primary)] line-clamp-2">{t.title}</div>
                          <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)] font-mono">
                            <span>{t.estimatedMinutes}m</span>
                            <span className="text-[var(--accent-amber)] font-bold">{t.priority}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </motion.section>

      {/* 4. SUBJECT PLANNING & 5. WEEKLY WORKLOAD VISUALIZATION */}
      <motion.section variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Subject Planning Cards */}
        <Card className="p-6 space-y-4 border border-[var(--border-glass)] lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">Subject Planning Summaries</h3>
                <p className="text-xs text-[var(--text-secondary)]">Task workload & completion by course</p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setIsSubjectModalOpen(true)}
            >
              New Subject
            </Button>
          </div>

          {subjectSummaries.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {subjectSummaries.map((summary) => (
                <div
                  key={summary.subjectId}
                  className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono"
                      style={{ backgroundColor: `${summary.color}20`, color: summary.color }}
                    >
                      {summary.code || summary.name}
                    </span>
                    <Badge variant="gray" size="sm">
                      {summary.confidenceRating}% Mastery
                    </Badge>
                  </div>

                  <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">
                    {summary.name}
                  </h4>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-[var(--text-secondary)]">
                      <span>{summary.completedTasks} / {summary.totalTasks} tasks done</span>
                      <span className="font-semibold">{summary.completionPercentage}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--bg-card)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${summary.completionPercentage}%`, backgroundColor: summary.color }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-1">
                    <span>{summary.remainingMinutes} mins remaining</span>
                    {summary.highestPriority !== 'none' && (
                      <span className="font-semibold text-[var(--accent-amber)] capitalize">
                        Priority: {summary.highestPriority}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center space-y-2 bg-[var(--bg-tertiary)]/50 rounded-xl border border-dashed border-[var(--border-glass)]">
              <p className="text-xs text-[var(--text-secondary)] font-medium">No subjects created</p>
              <p className="text-[11px] text-[var(--text-muted)]">Add your courses to group study tasks by subject.</p>
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setIsSubjectModalOpen(true)}
                className="mt-2"
              >
                Add First Subject
              </Button>
            </div>
          )}
        </Card>

        {/* 5. Weekly Workload Recharts Bar Chart */}
        <Card className="p-6 space-y-4 border border-[var(--border-glass)] flex flex-col justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[var(--accent-emerald)]/10 text-[var(--accent-emerald)]">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">7-Day Task Workload</h3>
              <p className="text-xs text-[var(--text-secondary)]">Scheduled study mins per day</p>
            </div>
          </div>

          <div className="h-52 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyWorkload} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-glass)',
                    borderRadius: '12px',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                  }}
                  formatter={(val: number) => [`${val} mins`, 'Workload']}
                />
                <Bar dataKey="totalMinutes" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </motion.section>

      {/* 6. PRIORITY PANEL */}
      <motion.section variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Next Recommended Task Deterministic Recommendation */}
        <Card className="p-6 space-y-3 border border-[var(--border-glass)] bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-secondary)]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">Next Recommended Task</h3>
              <p className="text-xs text-[var(--text-secondary)]">Highest priority pending item</p>
            </div>
          </div>

          {priorityHighlights.nextRecommendedTask ? (
            <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="amber" size="sm">
                  {priorityHighlights.nextRecommendedTask.priority.toUpperCase()}
                </Badge>
                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                  {formatDueDate(priorityHighlights.nextRecommendedTask.dueDate)}
                </span>
              </div>
              <h4 className="text-sm font-bold text-[var(--text-primary)]">
                {priorityHighlights.nextRecommendedTask.title}
              </h4>
              {priorityHighlights.nextRecommendedTask.description && (
                <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                  {priorityHighlights.nextRecommendedTask.description}
                </p>
              )}
              <div className="pt-2 flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onToggleTask(priorityHighlights.nextRecommendedTask!.id)}
                >
                  Complete Task
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-[var(--text-muted)] italic">
              No pending tasks available for recommendation.
            </div>
          )}
        </Card>

        {/* Overdue Work List */}
        <Card className="p-6 space-y-3 border border-[var(--border-glass)] lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[var(--accent-rose)]/10 text-[var(--accent-rose)]">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">Overdue & Urgent Work</h3>
                <p className="text-xs text-[var(--text-secondary)]">Tasks requiring immediate attention</p>
              </div>
            </div>
            <Badge variant="rose" size="sm">{priorityHighlights.overdueTasks.length} Overdue</Badge>
          </div>

          {priorityHighlights.overdueTasks.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {priorityHighlights.overdueTasks.map((t) => (
                <div
                  key={t.id}
                  className="p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={t.status === 'completed'}
                      onChange={() => onToggleTask(t.id)}
                      className="w-4 h-4 rounded text-[var(--accent-blue)] cursor-pointer"
                    />
                    <span className="font-semibold text-[var(--text-primary)] truncate">{t.title}</span>
                  </div>
                  <Badge variant="rose" size="sm">
                    {formatDueDate(t.dueDate)}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center space-y-1 bg-[var(--bg-tertiary)]/50 rounded-xl border border-dashed border-[var(--border-glass)]">
              <CheckCircle2 className="w-5 h-5 text-[var(--accent-emerald)] mx-auto" />
              <p className="text-xs text-[var(--text-secondary)] font-medium">No overdue tasks!</p>
              <p className="text-[11px] text-[var(--text-muted)]">Your deadline pipeline is completely healthy.</p>
            </div>
          )}
        </Card>
      </motion.section>

      {/* 7. QUICK ACTIONS */}
      <motion.section variants={itemVariants} className="space-y-3">
        <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider">
          Planning Actions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card
            interactive
            onClick={() => setIsTaskModalOpen(true)}
            className="p-4 flex items-center gap-3 border border-[var(--border-glass)] cursor-pointer"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">Add Task</h4>
              <p className="text-[10px] text-[var(--text-muted)]">Create task</p>
            </div>
          </Card>

          <Card
            interactive
            onClick={() => setIsSubjectModalOpen(true)}
            className="p-4 flex items-center gap-3 border border-[var(--border-glass)] cursor-pointer"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">Add Subject</h4>
              <p className="text-[10px] text-[var(--text-muted)]">New course</p>
            </div>
          </Card>

          <Card
            interactive
            onClick={() => setViewMode('list')}
            className="p-4 flex items-center gap-3 border border-[var(--border-glass)] cursor-pointer"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-emerald)]/15 text-[var(--accent-emerald)]">
              <List className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">List View</h4>
              <p className="text-[10px] text-[var(--text-muted)]">Task items</p>
            </div>
          </Card>

          <Card
            interactive
            onClick={() => setViewMode('calendar')}
            className="p-4 flex items-center gap-3 border border-[var(--border-glass)] cursor-pointer"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]">
              <Grid className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">7-Day Grid</h4>
              <p className="text-[10px] text-[var(--text-muted)]">Calendar view</p>
            </div>
          </Card>
        </div>
      </motion.section>

      {/* Task Creation Modal */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title="Create New Study Task"
      >
        <form onSubmit={handleTaskSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Task Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Complete Proof for Lemma 3.2"
              className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional problem numbers or key steps..."
              className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-blue)] h-20 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Subject</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
              >
                <option value="">Unlinked (General)</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code || s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Target Duration (Minutes)</label>
              <input
                type="number"
                min={10}
                max={300}
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-glass)]">
            <Button variant="ghost" size="md" type="button" onClick={() => setIsTaskModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit">
              Save Task
            </Button>
          </div>
        </form>
      </Modal>

      {/* Subject Creation Modal */}
      <Modal
        isOpen={isSubjectModalOpen}
        onClose={() => setIsSubjectModalOpen(false)}
        title="Add New Academic Subject"
      >
        <form onSubmit={handleSubjectSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Subject Name *</label>
            <input
              type="text"
              required
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              placeholder="e.g. Advanced Machine Learning"
              className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Course Code</label>
              <input
                type="text"
                value={subCode}
                onChange={(e) => setSubCode(e.target.value)}
                placeholder="e.g. CS 410"
                className="w-full px-3.5 py-2 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Confidence Rating ({subConfidence}%)</label>
              <input
                type="range"
                min={0}
                max={100}
                value={subConfidence}
                onChange={(e) => setSubConfidence(Number(e.target.value))}
                className="w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-purple)]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-glass)]">
            <Button variant="ghost" size="md" type="button" onClick={() => setIsSubjectModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit">
              Create Subject
            </Button>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
};
