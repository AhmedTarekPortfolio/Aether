import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Task, Subject, TaskPriority } from '../types';
import { Plus, Calendar as CalendarIcon, Clock, Trash2, Tag, BookOpen } from 'lucide-react';

interface PlanViewProps {
  tasks: Task[];
  subjects: Subject[];
  onAddTask: (task: Omit<Task, 'id' | 'createdAt'>) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onAddSubject: (subject: Omit<Subject, 'id' | 'createdAt'>) => void;
}

export const PlanView: React.FC<PlanViewProps> = ({
  tasks,
  subjects,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onAddSubject,
}) => {
  const [filter, setFilter] = useState<'all' | 'todo' | 'completed'>('all');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);

  // Task form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(45);

  // Subject form state
  const [subName, setSubName] = useState('');
  const [subCode, setSubCode] = useState('');
  const [subColor, setSubColor] = useState('#4F7CFF');
  const [subConfidence, setSubConfidence] = useState(70);
  const [subTargetGrade, setSubTargetGrade] = useState('A');

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
      dueDate: Date.now() + 2 * 24 * 60 * 60 * 1000,
    });

    setTitle('');
    setDescription('');
    setSubjectId('');
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
      targetGrade: subTargetGrade,
    });

    setSubName('');
    setSubCode('');
    setIsSubjectModalOpen(false);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Subjects Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#4F7CFF]" />
            Academic Courses & Confidence Ratings
          </h3>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setIsSubjectModalOpen(true)}
          >
            Add Subject
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {subjects.map((sub) => (
            <Card key={sub.id} className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="w-3 h-3 rounded-full shadow-lg" style={{ backgroundColor: sub.color }} />
                <Badge variant="gray" size="sm">Target: {sub.targetGrade || 'A'}</Badge>
              </div>
              <h4 className="text-sm font-semibold text-slate-100 line-clamp-1">{sub.name}</h4>
              <div className="text-xs font-mono text-slate-400">{sub.code}</div>

              <div className="pt-2 border-t border-white/5 space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Confidence Index</span>
                  <span className="font-mono font-semibold text-slate-200">{sub.confidenceRating}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${sub.confidenceRating}%`, backgroundColor: sub.color }} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Tasks Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <Button
            variant={filter === 'all' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All Tasks ({tasks.length})
          </Button>
          <Button
            variant={filter === 'todo' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setFilter('todo')}
          >
            To Do ({tasks.filter((t) => t.status !== 'completed').length})
          </Button>
          <Button
            variant={filter === 'completed' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setFilter('completed')}
          >
            Completed ({tasks.filter((t) => t.status === 'completed').length})
          </Button>
        </div>

        <Button
          variant="primary"
          size="md"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setIsTaskModalOpen(true)}
        >
          Add Task
        </Button>
      </div>

      {/* Tasks List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredTasks.length === 0 ? (
          <Card className="p-12 text-center text-slate-400">
            No tasks found matching current filter.
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
                  isCompleted ? 'opacity-60 bg-slate-900/30' : ''
                }`}
              >
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={isCompleted}
                    onChange={() => onToggleTask(task.id)}
                    className="w-5 h-5 mt-0.5 rounded-md border-slate-700 bg-slate-800 text-[#4F7CFF] focus:ring-0 cursor-pointer"
                  />
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className={`text-base font-semibold text-slate-100 ${isCompleted ? 'line-through text-slate-400' : ''}`}>
                      {task.title}
                    </div>
                    {task.description && (
                      <p className="text-xs text-slate-400 line-clamp-1">{task.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-slate-400">
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
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {task.estimatedMinutes} mins
                      </span>

                      <span className="flex items-center gap-1">
                        <CalendarIcon className="w-3.5 h-3.5 text-slate-500" />
                        Due in 2 days
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
                    className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Task Creation Modal */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title="Create New Study Task"
      >
        <form onSubmit={handleTaskSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Task Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Complete Proof for Lemma 3.2"
              className="w-full px-3.5 py-2 bg-[#0B1220] border border-white/10 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#4F7CFF]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional problem numbers or key steps..."
              className="w-full px-3.5 py-2 bg-[#0B1220] border border-white/10 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#4F7CFF] h-20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Subject</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full px-3 py-2 bg-[#0B1220] border border-white/10 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-[#4F7CFF]"
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
              <label className="block text-xs font-medium text-slate-300 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 bg-[#0B1220] border border-white/10 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-[#4F7CFF]"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Target Duration (Minutes)</label>
            <input
              type="number"
              min={10}
              max={300}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
              className="w-full px-3.5 py-2 bg-[#0B1220] border border-white/10 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-[#4F7CFF]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
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
        title="Add Academic Subject"
      >
        <form onSubmit={handleSubjectSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Subject Name *</label>
            <input
              type="text"
              required
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              placeholder="e.g. Cognitive Neuroscience"
              className="w-full px-3.5 py-2 bg-[#0B1220] border border-white/10 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-[#4F7CFF]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Course Code</label>
              <input
                type="text"
                value={subCode}
                onChange={(e) => setSubCode(e.target.value)}
                placeholder="e.g. COGS 105"
                className="w-full px-3.5 py-2 bg-[#0B1220] border border-white/10 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-[#4F7CFF]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Target Grade</label>
              <input
                type="text"
                value={subTargetGrade}
                onChange={(e) => setSubTargetGrade(e.target.value)}
                placeholder="e.g. A+"
                className="w-full px-3.5 py-2 bg-[#0B1220] border border-white/10 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-[#4F7CFF]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Initial Confidence Index ({subConfidence}%)</label>
            <input
              type="range"
              min={10}
              max={100}
              value={subConfidence}
              onChange={(e) => setSubConfidence(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#4F7CFF]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <Button variant="ghost" size="md" type="button" onClick={() => setIsSubjectModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit">
              Save Subject
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
