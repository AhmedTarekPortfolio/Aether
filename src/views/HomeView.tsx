import React from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { NextBestAction, Task, Subject, FocusSession } from '../types';
import { 
  Sparkles, 
  HelpCircle, 
  Play, 
  Clock, 
  CheckCircle2, 
  ArrowRight, 
  Calendar, 
  Target, 
  Zap, 
  BookOpen 
} from 'lucide-react';

interface HomeViewProps {
  nextBestAction: NextBestAction | null;
  tasks: Task[];
  subjects: Subject[];
  focusSessions: FocusSession[];
  onOpenExplainability: () => void;
  onSelectTab: (tab: any) => void;
  onToggleTask: (id: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  nextBestAction,
  tasks,
  subjects,
  focusSessions,
  onOpenExplainability,
  onSelectTab,
  onToggleTask,
}) => {
  const pendingTasks = tasks.filter((t) => t.status !== 'completed');
  const completedTasksToday = tasks.filter((t) => t.status === 'completed');
  const totalFocusMinutesToday = focusSessions.reduce((acc, s) => acc + s.durationMinutes, 0);

  // Subject lookup
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Banner: Next Best Study Action (Hero Card) */}
      {nextBestAction ? (
        <Card className="relative overflow-hidden bg-gradient-to-br from-[#111B2E] via-[#1B2842] to-[#0B1220] border-[#4F7CFF]/30 p-8 shadow-2xl">
          {/* Ambient Glow background */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#4F7CFF]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-[#8B5CF6]/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Badge variant="purple" size="md">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Recommended Action
                </Badge>
                <Badge variant="blue" size="md" className="font-mono">
                  Confidence Score: {nextBestAction.confidenceScore}%
                </Badge>
              </div>

              <Button
                variant="ghost"
                size="sm"
                icon={<HelpCircle className="w-4 h-4 text-[#8B5CF6]" />}
                onClick={onOpenExplainability}
                className="text-xs text-slate-300 hover:text-white"
              >
                Why was this suggested?
              </Button>
            </div>

            <div className="space-y-2 max-w-3xl">
              <h3 className="text-2xl font-bold text-white tracking-tight leading-snug">
                {nextBestAction.title}
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                {nextBestAction.reason}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-white/10">
              <Button
                variant="primary"
                size="lg"
                icon={<Play className="w-5 h-5 fill-current" />}
                onClick={() => onSelectTab('focus')}
              >
                Start Study Session ({nextBestAction.estimatedMinutes}m)
              </Button>

              <Button
                variant="secondary"
                size="lg"
                icon={<BookOpen className="w-5 h-5 text-[#8B5CF6]" />}
                onClick={() => onSelectTab('workspace')}
              >
                View Study Notes
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-8 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-[#2DD4BF] mx-auto" />
          <h3 className="text-xl font-bold text-white">All Caught Up!</h3>
          <p className="text-sm text-slate-400">You have zero pending tasks on your horizon. Enjoy your break or create a new learning objective!</p>
          <Button variant="primary" size="md" onClick={() => onSelectTab('plan')}>
            Add New Task
          </Button>
        </Card>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <Card className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-[#4F7CFF]/15 text-[#4F7CFF] border border-[#4F7CFF]/30">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-white font-mono">{totalFocusMinutesToday}m</div>
            <div className="text-xs text-slate-400 font-medium">Focus Time Today</div>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-[#2DD4BF]/15 text-[#2DD4BF] border border-[#2DD4BF]/30">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-white font-mono">{completedTasksToday.length}</div>
            <div className="text-xs text-slate-400 font-medium">Tasks Completed Today</div>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-[#8B5CF6]/15 text-[#8B5CF6] border border-[#8B5CF6]/30">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-white font-mono">{pendingTasks.length}</div>
            <div className="text-xs text-slate-400 font-medium">Upcoming Horizon Tasks</div>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-[#FBBF24]/15 text-[#FBBF24] border border-[#FBBF24]/30">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-white font-mono">{subjects.length}</div>
            <div className="text-xs text-slate-400 font-medium">Active Subjects</div>
          </div>
        </Card>
      </div>

      {/* Main Grid: Priority Deadlines + Subject Mastery Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Today's Priorities */}
        <div className="lg:col-span-2 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#4F7CFF]" />
              Priority Task Queue
            </h3>
            <button
              onClick={() => onSelectTab('plan')}
              className="text-xs text-[#4F7CFF] hover:underline font-medium flex items-center gap-1"
            >
              View All Tasks ({pendingTasks.length})
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {pendingTasks.slice(0, 4).map((task) => {
              const subject = task.subjectId ? subjectMap.get(task.subjectId) : undefined;
              return (
                <Card
                  key={task.id}
                  interactive
                  className="p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={task.status === 'completed'}
                      onChange={() => onToggleTask(task.id)}
                      className="w-5 h-5 rounded-md border-slate-700 bg-slate-800 text-[#4F7CFF] focus:ring-0 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-100 truncate">
                        {task.title}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                        {subject && (
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-medium"
                            style={{ backgroundColor: `${subject.color}20`, color: subject.color }}
                          >
                            {subject.code || subject.name}
                          </span>
                        )}
                        <span>{task.estimatedMinutes} mins</span>
                      </div>
                    </div>
                  </div>

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
                </Card>
              );
            })}
          </div>
        </div>

        {/* Right Col: Subject Confidence Ratings */}
        <div className="space-y-5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#8B5CF6]" />
            Subject Confidence Index
          </h3>

          <Card className="space-y-4">
            {subjects.map((sub) => (
              <div key={sub.id} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">{sub.code || sub.name}</span>
                  <span className="font-mono text-slate-400">{sub.confidenceRating}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${sub.confidenceRating}%`,
                      backgroundColor: sub.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
};
