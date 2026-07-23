import React from 'react';
import { motion, Variants } from 'framer-motion';
import { NextBestAction, Task, Subject, FocusSession } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { 
  calculateStudyStreak, 
  getTodaysTasks, 
  getWeeklyFocusMinutes, 
  getDashboardOverviewMetrics, 
  getSecondaryRecommendations 
} from '../services/dashboardMetrics';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  BookOpen, 
  Flame, 
  Calendar, 
  ArrowRight, 
  PlusCircle, 
  BrainCircuit, 
  BarChart3, 
  HelpCircle,
  TrendingUp,
  AlertCircle
} from 'lucide-react';

interface HomeViewProps {
  nextBestAction: NextBestAction | null;
  tasks: Task[];
  subjects: Subject[];
  focusSessions: FocusSession[];
  onOpenExplainability: () => void;
  onSelectTab: (tab: any) => void;
  onStartFocusWithTask: (taskId?: string) => void;
  onToggleTask: (id: string) => void;
}

// Framer Motion Stagger Animation Variants (Local Scope)
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

export const HomeView: React.FC<HomeViewProps> = ({
  nextBestAction,
  tasks,
  subjects,
  focusSessions,
  onOpenExplainability,
  onSelectTab,
  onStartFocusWithTask,
  onToggleTask,
}) => {
  // Compute Dashboard Metrics
  const streakDays = calculateStudyStreak(focusSessions);
  const todaysTasks = getTodaysTasks(tasks);
  const weeklyData = getWeeklyFocusMinutes(focusSessions);
  const overview = getDashboardOverviewMetrics(tasks, subjects, focusSessions);
  const secondaryRecs = getSecondaryRecommendations(tasks, subjects);

  // Subject Map for fast name/badge resolution
  const subjectMap = new Map<string, Subject>();
  subjects.forEach((s) => subjectMap.set(s.id, s));

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="p-6 md:p-8 max-w-7xl mx-auto space-y-8"
    >
      {/* 1. HERO SECTION: Greeting & Next Best Action */}
      <motion.section variants={itemVariants} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
              Welcome back, Scholar
            </h1>
            <p className="text-xs md:text-sm text-[var(--text-secondary)] mt-1">
              Here is your AI-optimized learning companion roadmap for today.
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            icon={<HelpCircle className="w-4 h-4 text-[var(--accent-purple)]" />}
            onClick={onOpenExplainability}
            className="self-start sm:self-auto"
          >
            Why was this suggested?
          </Button>
        </div>

        {nextBestAction ? (
          <Card className="p-6 md:p-8 relative overflow-hidden bg-gradient-to-br from-[var(--bg-card)] via-[var(--bg-secondary)] to-[var(--bg-tertiary)] border border-[var(--accent-blue)]/30 shadow-lg">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-3 max-w-2xl">
                <div className="flex items-center gap-2">
                  <Badge variant="blue" size="sm">
                    <Sparkles className="w-3.5 h-3.5 inline mr-1" />
                    AI Recommendation • {nextBestAction.confidenceScore}% Match
                  </Badge>
                  {nextBestAction.subtitle && (
                    <span className="text-xs font-mono text-[var(--text-muted)]">
                      {nextBestAction.subtitle}
                    </span>
                  )}
                </div>

                <h2 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] leading-snug">
                  {nextBestAction.title}
                </h2>

                <p className="text-xs md:text-sm text-[var(--text-secondary)] leading-relaxed">
                  {nextBestAction.reason}
                </p>

                {nextBestAction.actionableSteps && nextBestAction.actionableSteps.length > 0 && (
                  <div className="pt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--accent-blue)]">Action Steps:</span>
                    {nextBestAction.actionableSteps.map((step, idx) => (
                      <span key={idx} className="flex items-center gap-1 bg-[var(--bg-tertiary)] px-2.5 py-1 rounded-lg border border-[var(--border-glass)]">
                        <CheckCircle2 className="w-3 h-3 text-[var(--accent-emerald)]" />
                        {step}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex sm:flex-row flex-col items-stretch sm:items-center gap-3 shrink-0">
                <Button
                  variant="primary"
                  size="md"
                  icon={<Clock className="w-4 h-4" />}
                  onClick={() => onStartFocusWithTask(nextBestAction.taskId)}
                >
                  Start Focus Session
                </Button>
                {nextBestAction.taskId && (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => onToggleTask(nextBestAction.taskId!)}
                  >
                    Mark Done
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-8 text-center space-y-3 bg-[var(--bg-card)] border border-[var(--border-glass)]">
            <div className="p-3 rounded-full bg-[var(--accent-emerald)]/10 text-[var(--accent-emerald)] w-fit mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">All Caught Up!</h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              You have no pressing high-priority tasks due right now. Enjoy your break or create a new study goal.
            </p>
            <Button
              variant="primary"
              size="sm"
              icon={<PlusCircle className="w-4 h-4" />}
              onClick={() => onSelectTab('plan')}
              className="mt-2"
            >
              Add New Task
            </Button>
          </Card>
        )}
      </motion.section>

      {/* 2. PROGRESS CARDS (4 Metric Row) */}
      <motion.section variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Focus Today</span>
            <Clock className="w-4 h-4 text-[var(--accent-blue)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {overview.focusMinutesToday} <span className="text-xs font-normal text-[var(--text-muted)]">mins</span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Logged deep work today</p>
        </Card>

        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Tasks Completed</span>
            <CheckCircle2 className="w-4 h-4 text-[var(--accent-emerald)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {overview.tasksCompletedToday}
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Tasks finished today</p>
        </Card>

        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Pending Tasks</span>
            <Calendar className="w-4 h-4 text-[var(--accent-amber)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {overview.pendingTasksCount}
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Active items in planner</p>
        </Card>

        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Active Subjects</span>
            <BookOpen className="w-4 h-4 text-[var(--accent-purple)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">
            {overview.activeSubjectsCount}
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Enrolled courses</p>
        </Card>
      </motion.section>

      {/* 3. STUDY STREAK & TODAY'S SCHEDULE GRID */}
      <motion.section variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Study Streak Card */}
        <Card className="p-6 space-y-4 border border-[var(--border-glass)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">Study Streak</h3>
                <p className="text-xs text-[var(--text-secondary)]">Daily focus consistency</p>
              </div>
            </div>
            <Badge variant="amber" size="sm">{streakDays} Days</Badge>
          </div>

          <div className="py-4 text-center space-y-1">
            <div className="text-4xl font-extrabold text-[var(--text-primary)] flex items-center justify-center gap-2">
              <Flame className="w-8 h-8 text-[var(--accent-amber)] fill-[var(--accent-amber)]/20" />
              {streakDays}
            </div>
            <p className="text-xs text-[var(--text-secondary)] font-medium">
              {streakDays > 0 ? 'Consecutive Active Study Days' : '0 Day Streak — Start Today!'}
            </p>
          </div>

          <p className="text-[11px] text-[var(--text-muted)] text-center leading-relaxed">
            Log at least 1 focus session daily to maintain your momentum.
          </p>
        </Card>

        {/* 4. Today's Schedule List */}
        <Card className="p-6 space-y-4 border border-[var(--border-glass)] lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">Today's Schedule</h3>
                <p className="text-xs text-[var(--text-secondary)]">Tasks due before midnight</p>
              </div>
            </div>
            <Badge variant="blue" size="sm">{todaysTasks.length} Due</Badge>
          </div>

          {todaysTasks.length > 0 ? (
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {todaysTasks.map((t) => {
                const subject = t.subjectId ? subjectMap.get(t.subjectId) : undefined;
                const dueTimeStr = t.dueDate
                  ? new Date(t.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'No due time';

                return (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] flex items-center justify-between gap-3 hover:border-[var(--border-glass-hover)] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={t.status === 'completed'}
                        onChange={() => onToggleTask(t.id)}
                        className="w-4 h-4 rounded text-[var(--accent-blue)] focus:ring-[var(--accent-blue)] cursor-pointer"
                      />
                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {t.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--text-muted)]">
                          <span>{dueTimeStr}</span>
                          <span>•</span>
                          <span>{t.estimatedMinutes} mins</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {subject && (
                        <Badge size="sm" variant="purple">
                          {subject.code || subject.name}
                        </Badge>
                      )}
                      <Badge
                        size="sm"
                        variant={
                          t.priority === 'urgent'
                            ? 'rose'
                            : t.priority === 'high'
                            ? 'amber'
                            : 'blue'
                        }
                      >
                        {t.priority}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center space-y-2 bg-[var(--bg-tertiary)]/50 rounded-xl border border-dashed border-[var(--border-glass)]">
              <p className="text-xs text-[var(--text-secondary)] font-medium">Nothing due today</p>
              <p className="text-[11px] text-[var(--text-muted)]">Check your planner for upcoming deadlines.</p>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowRight className="w-3.5 h-3.5" />}
              onClick={() => onSelectTab('plan')}
            >
              Open Full Planner
            </Button>
          </div>
        </Card>
      </motion.section>

      {/* 5. WEEKLY FOCUS CHART & 6. SECONDARY RECOMMENDATIONS */}
      <motion.section variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Focus Chart (Computed from Real Sessions) */}
        <Card className="p-6 space-y-4 border border-[var(--border-glass)] lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[var(--accent-emerald)]/10 text-[var(--accent-emerald)]">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">7-Day Focus Trend</h3>
                <p className="text-xs text-[var(--text-secondary)]">Actual logged duration (minutes per day)</p>
              </div>
            </div>
            <Badge variant="emerald" size="sm">Real Time</Badge>
          </div>

          <div className="h-56 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMinutes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
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
                  formatter={(val: number) => [`${val} mins`, 'Focus Duration']}
                />
                <Area
                  type="monotone"
                  dataKey="minutes"
                  stroke="var(--accent-blue)"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorMinutes)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 6. AI Secondary Insight Recommendations */}
        <Card className="p-6 space-y-4 border border-[var(--border-glass)] flex flex-col justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">Secondary Insights</h3>
              <p className="text-xs text-[var(--text-secondary)]">Data-driven study suggestions</p>
            </div>
          </div>

          {secondaryRecs.length > 0 ? (
            <div className="space-y-3">
              {secondaryRecs.map((rec) => (
                <div
                  key={rec.id}
                  className="p-3.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] space-y-2"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                    <AlertCircle className="w-4 h-4 text-[var(--accent-amber)] shrink-0" />
                    <span>{rec.title}</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    {rec.description}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelectTab(rec.tabTarget)}
                    className="p-0 h-auto text-xs text-[var(--accent-blue)] font-semibold"
                  >
                    {rec.actionText} →
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center space-y-2 bg-[var(--bg-tertiary)]/50 rounded-xl border border-dashed border-[var(--border-glass)]">
              <p className="text-xs text-[var(--text-secondary)] font-medium">Optimal Performance</p>
              <p className="text-[11px] text-[var(--text-muted)]">No pending risks or low-confidence alerts detected.</p>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowRight className="w-3.5 h-3.5" />}
              onClick={() => onSelectTab('insights')}
            >
              Full Analytics
            </Button>
          </div>
        </Card>
      </motion.section>

      {/* 7. QUICK ACTIONS */}
      <motion.section variants={itemVariants} className="space-y-3">
        <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider">
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card
            interactive
            onClick={() => onSelectTab('plan')}
            className="p-4 flex items-center gap-3 border border-[var(--border-glass)] cursor-pointer"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">Add New Task</h4>
              <p className="text-[10px] text-[var(--text-muted)]">Planner queue</p>
            </div>
          </Card>

          <Card
            interactive
            onClick={() => onStartFocusWithTask()}
            className="p-4 flex items-center gap-3 border border-[var(--border-glass)] cursor-pointer"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-emerald)]/15 text-[var(--accent-emerald)]">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">Start Focus</h4>
              <p className="text-[10px] text-[var(--text-muted)]">Pomodoro / Deep work</p>
            </div>
          </Card>

          <Card
            interactive
            onClick={() => onSelectTab('assistant')}
            className="p-4 flex items-center gap-3 border border-[var(--border-glass)] cursor-pointer"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">Ask AI Coach</h4>
              <p className="text-[10px] text-[var(--text-muted)]">Tutor & Practice Quiz</p>
            </div>
          </Card>

          <Card
            interactive
            onClick={() => onSelectTab('insights')}
            className="p-4 flex items-center gap-3 border border-[var(--border-glass)] cursor-pointer"
          >
            <div className="p-2.5 rounded-xl bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">View Analytics</h4>
              <p className="text-[10px] text-[var(--text-muted)]">Learning metrics</p>
            </div>
          </Card>
        </div>
      </motion.section>
    </motion.div>
  );
};

export default HomeView;
