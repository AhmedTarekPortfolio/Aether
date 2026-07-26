import React, { useState } from 'react';
import { Award, CheckCircle2, Clock, Plus, Trash2 } from 'lucide-react';
import { AchievementDefinition, FocusSession, Goal, Statistic, Subject, Task, UserAchievement, UserProfile } from '../types';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';

interface InsightsViewProps {
  subjects: Subject[];
  tasks: Task[];
  focusSessions: FocusSession[];
  userProfile: UserProfile | null;
  goals: Goal[];
  statistics: Statistic[];
  achievementDefinitions: AchievementDefinition[];
  userAchievements: UserAchievement[];
  onAddGoal: (goal: Omit<Goal, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  onUpdateGoal: (id: string, updates: Partial<Goal>) => Promise<void>;
  onDeleteGoal: (id: string) => Promise<void>;
}

export const InsightsView: React.FC<InsightsViewProps> = ({
  subjects, tasks, focusSessions, userProfile, goals, statistics,
  achievementDefinitions, userAchievements, onAddGoal, onUpdateGoal, onDeleteGoal,
}) => {
  const [goalModal, setGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState(1);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState('');
  const totalFocusMinutes = focusSessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  const completedTasks = tasks.filter((task) => task.status === 'completed').length;
  const completionRate = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const openGoal = (goal?: Goal) => {
    setEditingGoal(goal ?? null); setTitle(goal?.title ?? ''); setTarget(goal?.targetValue ?? 1);
    setCurrent(goal?.currentValue ?? 0); setError(''); setGoalModal(true);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card className="p-5"><Clock className="w-4 h-4 text-[var(--accent-blue)]" /><p className="text-xs text-[var(--text-secondary)]">PERSISTED FOCUS TIME</p><p className="text-3xl font-bold">{(totalFocusMinutes / 60).toFixed(1)} hrs</p></Card>
        <Card className="p-5"><CheckCircle2 className="w-4 h-4 text-[var(--accent-emerald)]" /><p className="text-xs text-[var(--text-secondary)]">TASK COMPLETION</p><p className="text-3xl font-bold">{completionRate}%</p><p className="text-xs text-[var(--text-secondary)]">{completedTasks} of {tasks.length} tasks</p></Card>
        <Card className="p-5"><Award className="w-4 h-4 text-[var(--accent-purple)]" /><p className="text-xs text-[var(--text-secondary)]">SAVED STATISTICS</p><p className="text-3xl font-bold">{statistics.length}</p><p className="text-xs text-[var(--text-secondary)]">persisted metric records</p></Card>
      </div>

      <section className="space-y-4">
        <div className="flex justify-between"><div><h2 className="font-bold">Goals</h2><p className="text-xs text-[var(--text-secondary)]">Active and completed goals are stored locally.</p></div><Button size="sm" onClick={() => openGoal()}><Plus className="w-4 h-4" /> Add Goal</Button></div>
        <div className="grid md:grid-cols-2 gap-4">
          {goals.length === 0 && <Card className="p-8 text-center text-sm text-[var(--text-secondary)]">No goals yet.</Card>}
          {goals.map((goal) => <Card key={goal.id} className="p-4 space-y-3">
            <div className="flex justify-between"><div><h3 className="font-bold">{goal.title}</h3><Badge variant={goal.status === 'completed' ? 'emerald' : 'blue'} size="sm">{goal.status}</Badge></div><Button variant="danger" size="sm" onClick={() => void onDeleteGoal(goal.id)}><Trash2 className="w-4 h-4" /></Button></div>
            <p className="text-xs text-[var(--text-secondary)]">{goal.currentValue} / {goal.targetValue} {goal.unit}</p>
            <input aria-label={`Progress for ${goal.title}`} type="range" min="0" max={goal.targetValue} value={Math.min(goal.currentValue, goal.targetValue)} onChange={(event) => void onUpdateGoal(goal.id, { currentValue: Number(event.target.value) })} className="w-full" />
            <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => openGoal(goal)}>Edit</Button><Button size="sm" variant="secondary" onClick={() => void onUpdateGoal(goal.id, { status: goal.status === 'completed' ? 'active' : 'completed' })}>{goal.status === 'completed' ? 'Reopen' : 'Complete'}</Button></div>
          </Card>)}
        </div>
      </section>

      <section className="space-y-4"><div><h2 className="font-bold">Achievements</h2><p className="text-xs text-[var(--text-secondary)]">Canonical definitions and your preserved progress.</p></div>
        <div className="grid md:grid-cols-2 gap-4">{achievementDefinitions.map((definition) => {
          const earned = userAchievements.find((item) => item.achievementId === definition.id);
          return <Card key={definition.id} className="p-4"><div className="flex justify-between"><h3 className="font-bold">{definition.title}</h3><Badge variant={earned?.unlockedAt ? 'emerald' : 'gray'} size="sm">{earned?.unlockedAt ? 'Earned' : 'Unearned'}</Badge></div><p className="text-xs text-[var(--text-secondary)]">{definition.description}</p><p className="text-xs mt-2">Progress: {earned?.progress ?? 0} / {definition.targetValue}</p></Card>;
        })}</div>
      </section>

      <section className="space-y-4"><h2 className="font-bold">Subject confidence</h2><div className="grid md:grid-cols-2 gap-3">{subjects.length === 0 && <p className="text-sm text-[var(--text-secondary)]">No subjects to summarize.</p>}{subjects.map((subject) => <Card key={subject.id} className="p-4 flex justify-between"><span>{subject.code || subject.name}</span><strong>{subject.confidenceRating}%</strong></Card>)}</div></section>

      <Modal isOpen={goalModal} onClose={() => setGoalModal(false)} title={editingGoal ? 'Edit Goal' : 'Create Goal'}>
        <form className="space-y-4" onSubmit={async (event) => {
          event.preventDefault(); setError('');
          try {
            const values = { title, targetValue: target, currentValue: current };
            if (editingGoal) await onUpdateGoal(editingGoal.id, values);
            else await onAddGoal({ ...values, description: '', type: 'custom', unit: 'units', status: 'active', subjectId: null, deadline: null, completedAt: null });
            setGoalModal(false);
          } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save goal.'); }
        }}>
          {error && <p role="alert" className="text-xs text-[var(--accent-rose)]">{error}</p>}
          <label className="block text-xs">Title *<input required value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full px-3 py-2 bg-[var(--bg-input)] rounded-xl border border-[var(--border-glass)]" /></label>
          <div className="grid grid-cols-2 gap-4"><label className="block text-xs">Target<input type="number" min="1" value={target} onChange={(event) => setTarget(Number(event.target.value))} className="mt-1 w-full px-3 py-2 bg-[var(--bg-input)] rounded-xl border border-[var(--border-glass)]" /></label><label className="block text-xs">Progress<input type="number" min="0" value={current} onChange={(event) => setCurrent(Number(event.target.value))} className="mt-1 w-full px-3 py-2 bg-[var(--bg-input)] rounded-xl border border-[var(--border-glass)]" /></label></div>
          <div className="flex justify-end gap-3"><Button type="button" variant="ghost" onClick={() => setGoalModal(false)}>Cancel</Button><Button type="submit">Save Goal</Button></div>
        </form>
      </Modal>
      <p className="text-[10px] text-[var(--text-muted)]">Weekly target: {userProfile?.studyGoalHoursWeekly ?? 0} hours. All metrics above derive from persisted local records.</p>
    </div>
  );
};
