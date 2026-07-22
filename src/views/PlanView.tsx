import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Task, Subject, TaskPriority } from '../types';
import { Plus, Calendar as CalendarIcon, Clock, Trash2, Tag, List, Grid } from 'lucide-react';

interface PlanViewProps {
  tasks: Task[];
  subjects: Subject[];
  onAddTask: (task: Omit<Task, 'id' | 'createdAt'>) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onAddSubject: (subject: Omit<Subject, 'id' | 'createdAt'>) => void;
}

function formatDueDate(dueDate?: number): string {
  if (!dueDate) return 'No due date';

  const msLeft = dueDate - Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  if (msLeft < 0) {
    const daysLate = Math.round(Math.abs(msLeft) / dayMs);
    return daysLate === 0 ? 'Overdue today' : `${daysLate}d overdue`;
  }

  const hoursLeft = msLeft / (60 * 60 * 1000);
  if (hoursLeft < 24) return `Due in ${Math.max(1, Math.round(hoursLeft))}h`;

  const daysLeft = Math.round(hoursLeft / 24);
  return `Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
}

export const PlanView: React.FC<PlanViewProps> = ({
  tasks,
  subjects,
  onAddTask,
  onToggleTask,
  onDeleteTask,
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [filter, setFilter] = useState<'all' | 'todo' | 'completed'>('all');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Task form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(45);
  const [dueDate, setDueDate] = useState<string>(
    new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );

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

  // 7-day calendar day slots calculation
  const calendarDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      dateStr: d.toISOString().slice(0, 10),
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
    };
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header & Controls */}
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
            Calendar Grid
          </Button>
        </div>

        <div className="flex items-center gap-3">
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
                To Do ({tasks.filter((t) => t.status !== 'completed').length})
              </button>
              <button
                onClick={() => setFilter('completed')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  filter === 'completed' ? 'bg-[var(--accent-blue)] text-white font-medium' : 'text-[var(--text-secondary)]'
                }`}
              >
                Completed ({tasks.filter((t) => t.status === 'completed').length})
              </button>
            </div>
          )}

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

      {/* Main Tasks Body: List vs Calendar */}
      {viewMode === 'list' ? (
        <div className="grid grid-cols-1 gap-4">
          {filteredTasks.length === 0 ? (
            <Card className="p-12 text-center text-[var(--text-secondary)]">
              No study tasks found matching the current filter.
            </Card>
          ) : (
            filteredTasks.map((task) => {
              const subject = task.subjectId ? subjectMap.get(task.subjectId) : undefined;
              const isCompleted = task.status === 'completed';

              return (
                <Card
                  key={task.id}
                  interactive
                  className={`p-5 flex items-center justify-between gap-4 transition-all ${
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
                      <div className={`text-base font-semibold text-[var(--text-primary)] ${isCompleted ? 'line-through text-[var(--text-muted)]' : ''}`}>
                        {task.title}
                      </div>
                      {task.description && (
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-1">{task.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-[var(--text-secondary)]">
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

                        <span className="flex items-center gap-1">
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
                      className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-rose)] rounded-lg hover:bg-[var(--accent-rose)]/10 transition-colors"
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
        /* Calendar 7-Day Grid View */
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          {calendarDays.map((cd) => {
            const dayTasks = tasks.filter((t) => {
              if (!t.dueDate) return false;
              const dStr = new Date(t.dueDate).toISOString().slice(0, 10);
              return dStr === cd.dateStr;
            });

            return (
              <Card key={cd.dateStr} className="p-4 space-y-3 min-h-[300px]">
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
    </div>
  );
};
