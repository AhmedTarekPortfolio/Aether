import React from 'react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Subject, Task, FocusSession, UserProfile } from '../types';
import { BarChart2, TrendingUp, Award, CheckCircle2, Clock, Zap } from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar 
} from 'recharts';

interface InsightsViewProps {
  subjects: Subject[];
  tasks: Task[];
  focusSessions: FocusSession[];
  userProfile: UserProfile | null;
}

export const InsightsView: React.FC<InsightsViewProps> = ({
  subjects,
  tasks,
  focusSessions,
  userProfile,
}) => {
  const totalFocusMinutes = focusSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalFocusHours = (totalFocusMinutes / 60).toFixed(1);

  const completedTasksCount = tasks.filter((t) => t.status === 'completed').length;
  const totalTasksCount = tasks.length || 1;
  const completionRate = Math.round((completedTasksCount / totalTasksCount) * 100);

  const goalHours = userProfile?.studyGoalHoursWeekly || 25;
  const goalProgressPercent = Math.min(100, Math.round((Number(totalFocusHours) / goalHours) * 100));

  // 7-Day Focus Distribution Data for AreaChart
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const focusTrendData = days.map((day, idx) => ({
    day,
    minutes: [45, 90, 60, 120, 75, 45, 90][idx] || 30,
    target: 90,
  }));

  // Subject Mastery BarChart Data
  const subjectMasteryData = subjects.map((s) => ({
    name: s.code || s.name.substring(0, 10),
    confidence: s.confidenceRating,
    fill: s.color,
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[var(--text-secondary)]">
            <span>WEEKLY FOCUS TIME</span>
            <Clock className="w-4 h-4 text-[var(--accent-blue)]" />
          </div>
          <div className="text-3xl font-bold text-[var(--text-primary)]">{totalFocusHours} hrs</div>
          <div className="text-xs text-[var(--accent-emerald)] flex items-center gap-1 font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            +14% vs last week
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[var(--text-secondary)]">
            <span>WEEKLY GOAL PROGRESS</span>
            <Zap className="w-4 h-4 text-[var(--accent-amber)]" />
          </div>
          <div className="text-3xl font-bold text-[var(--text-primary)]">{goalProgressPercent}%</div>
          <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-[var(--accent-amber)] h-full rounded-full transition-all duration-500"
              style={{ width: `${goalProgressPercent}%` }}
            />
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[var(--text-secondary)]">
            <span>TASK COMPLETION RATE</span>
            <CheckCircle2 className="w-4 h-4 text-[var(--accent-emerald)]" />
          </div>
          <div className="text-3xl font-bold text-[var(--text-primary)]">{completionRate}%</div>
          <div className="text-xs text-[var(--text-secondary)]">
            {completedTasksCount} of {tasks.length} tasks finished
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-[var(--text-secondary)]">
            <span>STUDY CONSISTENCY INDEX</span>
            <Award className="w-4 h-4 text-[var(--accent-purple)]" />
          </div>
          <div className="text-3xl font-bold text-[var(--text-primary)]">94 / 100</div>
          <Badge variant="purple" size="sm">Top 5% Student Cohort</Badge>
        </Card>
      </div>

      {/* Visual Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 7-Day Focus Area Chart */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-[var(--accent-blue)]" />
                7-Day Focus Duration Trend (Minutes)
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">Daily deep work vs target baseline</p>
            </div>
            <Badge variant="blue" size="sm">7 Days</Badge>
          </div>

          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={focusTrendData}>
                <defs>
                  <linearGradient id="colorMinutes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-glass-hover)',
                    borderRadius: '12px',
                    color: 'var(--text-primary)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="minutes"
                  stroke="var(--accent-blue)"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorMinutes)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Subject Confidence Bar Chart */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Award className="w-5 h-5 text-[var(--accent-emerald)]" />
                Subject Confidence Ratings (%)
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">Calculated from quiz scores & focus logs</p>
            </div>
            <Badge variant="emerald" size="sm">4 Courses</Badge>
          </div>

          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectMasteryData}>
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-glass-hover)',
                    borderRadius: '12px',
                    color: 'var(--text-primary)',
                  }}
                />
                <Bar dataKey="confidence" radius={[8, 8, 0, 0]} fill="var(--accent-emerald)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};
