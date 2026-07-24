import React, { useState, useEffect, useRef } from 'react';
import { motion, Variants } from 'framer-motion';
import { FocusSession, Task, Subject } from '../types';
import { soundService } from '../services/soundService';
import confetti from 'canvas-confetti';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import {
  calculateFocusSummary,
  sortFocusSessionsNewestFirst,
  formatFocusSessionType,
  formatDurationDisplay,
} from '../services/focusMetrics';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Sparkles,
  CheckCircle2,
  CloudRain,
  Waves,
  Radio,
  Tag,
  CheckSquare,
  AlertCircle,
  Clock,
  Award,
  Flame,
  Star,
  Plus,
  Minus,
  MessageSquare,
  HelpCircle,
} from 'lucide-react';

interface FocusViewProps {
  tasks: Task[];
  subjects: Subject[];
  focusSessions: FocusSession[];
  onLogFocusSession: (session: Omit<FocusSession, 'id' | 'completedAt'>) => Promise<void> | void;
  activeFocusTaskId?: string | null;
}

// Framer Motion Variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
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

export const FocusView: React.FC<FocusViewProps> = ({
  tasks,
  subjects,
  focusSessions,
  onLogFocusSession,
  activeFocusTaskId,
}) => {
  const { showToast } = useToast();

  // Mode & Duration Config
  const [timerType, setTimerType] = useState<'pomodoro' | 'deep_work' | 'stopwatch'>('pomodoro');
  const [targetMinutes, setTargetMinutes] = useState<number>(25);

  // Timer State Machine
  const [timerStatus, setTimerStatus] = useState<'idle' | 'running' | 'paused' | 'completing'>('idle');
  const [accumulatedElapsedMs, setAccumulatedElapsedMs] = useState<number>(0);
  const [lastResumeTimestamp, setLastResumeTimestamp] = useState<number | null>(null);
  const [currentTimeNow, setCurrentTimeNow] = useState<number>(Date.now());

  // Task & Subject Binding
  const [selectedTaskId, setSelectedTaskId] = useState<string>(activeFocusTaskId || '');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  // Ambient Sound State
  const [ambientSound, setAmbientSound] = useState<'none' | 'rain' | 'waves' | 'brown'>('none');

  // Distraction Tracking & Reflection Modal State
  const [distractionCount, setDistractionCount] = useState<number>(0);
  const [reflectionRating, setReflectionRating] = useState<number>(5);
  const [reflectionNotes, setReflectionNotes] = useState<string>('');
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState<boolean>(false);
  const [isResetConfirmModalOpen, setIsResetConfirmModalOpen] = useState<boolean>(false);
  const [isSavingSession, setIsSavingSession] = useState<boolean>(false);

  // Deep-link Task Inheritance
  useEffect(() => {
    if (activeFocusTaskId) {
      setSelectedTaskId(activeFocusTaskId);
      const t = tasks.find((tk) => tk.id === activeFocusTaskId);
      if (t?.subjectId) setSelectedSubjectId(t.subjectId);
    }
  }, [activeFocusTaskId, tasks]);

  // Clean up ambient audio on unmount
  useEffect(() => {
    return () => {
      soundService.stop();
    };
  }, []);

  // Update target minutes on mode change (when idle)
  useEffect(() => {
    if (timerStatus === 'idle') {
      if (timerType === 'pomodoro') setTargetMinutes(25);
      else if (timerType === 'deep_work') setTargetMinutes(45);
      else if (timerType === 'stopwatch') setTargetMinutes(0);
      setAccumulatedElapsedMs(0);
      setLastResumeTimestamp(null);
      setDistractionCount(0);
    }
  }, [timerType, timerStatus]);

  // High-precision Interval Loop for UI update
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (timerStatus === 'running') {
      interval = setInterval(() => {
        setCurrentTimeNow(Date.now());
      }, 250);
    } else {
      if (interval) clearInterval(interval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerStatus]);

  // Compute Authoritative Elapsed Time & Remaining Time
  const isRunning = timerStatus === 'running';
  const isPaused = timerStatus === 'paused';

  const currentSegmentMs = isRunning && lastResumeTimestamp ? Math.max(0, currentTimeNow - lastResumeTimestamp) : 0;
  const totalElapsedMs = accumulatedElapsedMs + currentSegmentMs;
  const elapsedSeconds = Math.floor(totalElapsedMs / 1000);

  const targetSeconds = targetMinutes * 60;
  const timeLeftSeconds =
    timerType === 'stopwatch'
      ? elapsedSeconds
      : Math.max(0, targetSeconds - elapsedSeconds);

  // Natural Countdown Completion Guard
  const naturalCompletionTriggered = useRef(false);

  useEffect(() => {
    if (
      timerType !== 'stopwatch' &&
      isRunning &&
      timeLeftSeconds <= 0 &&
      !naturalCompletionTriggered.current
    ) {
      naturalCompletionTriggered.current = true;
      // Pause timer
      setAccumulatedElapsedMs(targetSeconds * 1000);
      setLastResumeTimestamp(null);
      setTimerStatus('completing');

      soundService.playTimerCompletionBell();
      setIsCompletionModalOpen(true);
    }
  }, [timeLeftSeconds, isRunning, timerType, targetSeconds]);

  // Reset completion trigger when timer returns to idle
  useEffect(() => {
    if (timerStatus === 'idle') {
      naturalCompletionTriggered.current = false;
    }
  }, [timerStatus]);

  // Timer Actions
  const handleStartPause = () => {
    if (isRunning) {
      // Pause
      const now = Date.now();
      const currentSegment = lastResumeTimestamp ? Math.max(0, now - lastResumeTimestamp) : 0;
      setAccumulatedElapsedMs((prev) => prev + currentSegment);
      setLastResumeTimestamp(null);
      setTimerStatus('paused');
    } else {
      // Start / Resume
      setLastResumeTimestamp(Date.now());
      setCurrentTimeNow(Date.now());
      setTimerStatus('running');
    }
  };

  const handleResetClick = () => {
    if (elapsedSeconds >= 60 && (isRunning || isPaused)) {
      setIsResetConfirmModalOpen(true);
    } else {
      executeReset();
    }
  };

  const executeReset = () => {
    setTimerStatus('idle');
    setAccumulatedElapsedMs(0);
    setLastResumeTimestamp(null);
    setDistractionCount(0);
    setIsResetConfirmModalOpen(false);
  };

  const handleManualFinish = () => {
    const calcMinutes = Math.round(elapsedSeconds / 60);

    if (calcMinutes < 1) {
      showToast('Session Too Short', 'warning', 'Focus session must be at least 1 minute long to record progress.');
      return;
    }

    if (isRunning) {
      const now = Date.now();
      const currentSegment = lastResumeTimestamp ? Math.max(0, now - lastResumeTimestamp) : 0;
      setAccumulatedElapsedMs((prev) => prev + currentSegment);
      setLastResumeTimestamp(null);
    }

    setTimerStatus('completing');
    setIsCompletionModalOpen(true);
  };

  const handleLogDistraction = () => {
    setDistractionCount((prev) => prev + 1);
    showToast('Distraction Logged', 'info', `Recorded distraction #${distractionCount + 1}`);
  };

  const toggleAmbientSound = (sound: 'rain' | 'waves' | 'brown') => {
    if (ambientSound === sound) {
      soundService.stop();
      setAmbientSound('none');
    } else {
      soundService.playAmbient(sound);
      setAmbientSound(sound);
    }
  };

  const handleConfirmSaveSession = async () => {
    if (isSavingSession) return;
    setIsSavingSession(true);

    const actualDurationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));

    try {
      await onLogFocusSession({
        taskId: selectedTaskId || undefined,
        subjectId: selectedSubjectId || undefined,
        durationMinutes: actualDurationMinutes,
        type: timerType,
        distractionCount,
        reflectionRating,
        notes: reflectionNotes.trim() || undefined,
      });

      soundService.stop();
      setAmbientSound('none');

      try {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      } catch {
        // Safe fallback if confetti unavailable
      }

      showToast('Focus Session Logged!', 'success', `Recorded ${actualDurationMinutes} mins of focus time.`);

      executeReset();
      setReflectionNotes('');
      setIsCompletionModalOpen(false);
    } catch {
      showToast('Save Failed', 'error', 'Could not persist focus session to storage.');
    } finally {
      setIsSavingSession(false);
    }
  };

  const handleCancelCompletion = () => {
    setIsCompletionModalOpen(false);
    if (timerStatus === 'completing') {
      setTimerStatus('paused');
    }
  };

  // Metrics Derived Data
  const metricsSummary = calculateFocusSummary(focusSessions);
  const sortedSessions = sortFocusSessionsNewestFirst(focusSessions);

  // Time & Progress Formatting
  const formatTimeDisplay = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent =
    timerType === 'stopwatch'
      ? Math.min(100, Math.round((elapsedSeconds / 3600) * 100))
      : Math.min(100, Math.max(0, Math.round(((targetSeconds - timeLeftSeconds) / (targetSeconds || 1)) * 100)));

  const selectedTaskObj = tasks.find((t) => t.id === selectedTaskId);
  const selectedSubjectObj = subjects.find((s) => s.id === (selectedSubjectId || selectedTaskObj?.subjectId));

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 text-[var(--text-primary)]"
    >
      {/* 1. FOCUS HEADER */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Clock className="w-7 h-7 text-[var(--accent-blue)]" />
            Focus Room
          </h1>
          <p className="text-xs md:text-sm text-[var(--text-secondary)] mt-1">
            Start a structured study session, protect your attention, and record meaningful progress.
          </p>
        </div>

        {isRunning && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/30 text-xs font-semibold text-[var(--accent-blue)] self-start md:self-auto">
            <span className="w-2 h-2 rounded-full bg-[var(--accent-blue)] animate-pulse" />
            Session In Progress
          </div>
        )}
      </motion.div>

      {/* 2. FOCUS SUMMARY METRICS ROW */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Focus Today</span>
            <Clock className="w-4 h-4 text-[var(--accent-blue)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)] font-mono">
            {formatDurationDisplay(metricsSummary.minutesToday)}
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Completed focus time</p>
        </Card>

        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Sessions Today</span>
            <Flame className="w-4 h-4 text-[var(--accent-amber)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)] font-mono">
            {metricsSummary.sessionsToday}
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Logged focus sessions</p>
        </Card>

        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Avg Session</span>
            <Award className="w-4 h-4 text-[var(--accent-purple)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)] font-mono">
            {metricsSummary.averageDurationToday} <span className="text-xs font-normal text-[var(--text-muted)]">mins</span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Average session length</p>
        </Card>

        <Card className="p-5 space-y-2 border border-[var(--border-glass)]">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Focus Quality</span>
            <Star className="w-4 h-4 text-[var(--accent-emerald)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)] font-mono">
            {metricsSummary.averageRatingToday !== null ? `${metricsSummary.averageRatingToday} / 5` : 'N/A'}
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">
            {metricsSummary.distractionsToday} distraction(s) recorded
          </p>
        </Card>
      </motion.div>

      {/* 3. MAIN FOCUS WORKSPACE (2/3 Timer Area + 1/3 Config Panel) */}
      <motion.section variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Primary Timer Ring & Controls (2 Cols Desktop) */}
        <Card className="lg:col-span-2 p-6 md:p-10 text-center space-y-6 relative overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-glass)]">
          {/* Mode Selector Tabs */}
          <div className="flex flex-wrap justify-center items-center gap-2">
            <Button
              variant={timerType === 'pomodoro' ? 'primary' : 'ghost'}
              size="sm"
              disabled={isRunning || isPaused}
              onClick={() => setTimerType('pomodoro')}
            >
              Pomodoro (25m)
            </Button>
            <Button
              variant={timerType === 'deep_work' ? 'purple' : 'ghost'}
              size="sm"
              disabled={isRunning || isPaused}
              onClick={() => setTimerType('deep_work')}
            >
              Deep Work (45m)
            </Button>
            <Button
              variant={timerType === 'stopwatch' ? 'amber' : 'ghost'}
              size="sm"
              disabled={isRunning || isPaused}
              onClick={() => setTimerType('stopwatch')}
            >
              Stopwatch
            </Button>
          </div>

          {/* Duration Adjuster (Countdown Modes) */}
          {timerType !== 'stopwatch' && (
            <div className="flex justify-center items-center gap-3 text-xs text-[var(--text-secondary)]">
              <span>Target Duration:</span>
              <button
                disabled={isRunning || isPaused || targetMinutes <= 5}
                onClick={() => setTargetMinutes((m) => Math.max(1, m - 5))}
                className="p-1 rounded-lg hover:bg-[var(--border-glass)] text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Decrease duration by 5 minutes"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="font-bold font-mono text-[var(--text-primary)] px-2 py-0.5 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-glass)]">
                {targetMinutes} mins
              </span>
              <button
                disabled={isRunning || isPaused || targetMinutes >= 180}
                onClick={() => setTargetMinutes((m) => Math.min(180, m + 5))}
                className="p-1 rounded-lg hover:bg-[var(--border-glass)] text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Increase duration by 5 minutes"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* SVG Circular Timer Display */}
          <div className="relative w-56 h-56 md:w-64 md:h-64 mx-auto flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="50%"
                cy="50%"
                r="42%"
                className="stroke-[var(--bg-tertiary)]"
                strokeWidth="10"
                fill="transparent"
              />
              <circle
                cx="50%"
                cy="50%"
                r="42%"
                className={`${
                  timerType === 'deep_work'
                    ? 'stroke-[var(--accent-purple)]'
                    : timerType === 'stopwatch'
                    ? 'stroke-[var(--accent-amber)]'
                    : 'stroke-[var(--accent-blue)]'
                } transition-all duration-300`}
                strokeWidth="10"
                strokeDasharray={2 * Math.PI * 105}
                strokeDashoffset={2 * Math.PI * 105 * (1 - progressPercent / 100)}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
              <div className="text-4xl md:text-5xl font-extrabold font-mono text-[var(--text-primary)] tracking-wider">
                {formatTimeDisplay(timeLeftSeconds)}
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] font-semibold uppercase tracking-widest mt-2">
                {isRunning
                  ? 'Focus Session Active'
                  : isPaused
                  ? 'Session Paused'
                  : 'Ready to Focus'}
              </div>
            </div>
          </div>

          {/* Primary Controls */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              variant="ghost"
              size="md"
              icon={<RotateCcw className="w-5 h-5 text-[var(--text-secondary)]" />}
              onClick={handleResetClick}
              title="Reset Timer"
              aria-label="Reset Timer"
            />

            <Button
              variant={isRunning ? 'amber' : 'primary'}
              size="lg"
              className="w-44 shadow-xl"
              icon={isRunning ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              onClick={handleStartPause}
            >
              {isRunning ? 'Pause' : isPaused ? 'Resume' : 'Start Focus'}
            </Button>

            <Button
              variant="emerald"
              size="md"
              icon={<CheckCircle2 className="w-5 h-5" />}
              onClick={handleManualFinish}
              title="Finish & Log Session"
              aria-label="Finish & Log Session"
            />

            {(isRunning || isPaused) && (
              <Button
                variant="secondary"
                size="md"
                icon={<AlertCircle className="w-4 h-4 text-[var(--accent-rose)]" />}
                onClick={handleLogDistraction}
                title="Log a Distraction"
              >
                Distraction ({distractionCount})
              </Button>
            )}
          </div>
        </Card>

        {/* Configuration Panel (1 Col Desktop) */}
        <div className="space-y-6">
          <Card className="p-6 space-y-4 border border-[var(--border-glass)]">
            <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-[var(--accent-blue)]" />
              Session Configuration
            </h3>

            {/* Link Task Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                Linked Task
              </label>
              <select
                disabled={isRunning || isPaused}
                value={selectedTaskId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedTaskId(id);
                  const t = tasks.find((tk) => tk.id === id);
                  if (t?.subjectId) setSelectedSubjectId(t.subjectId);
                }}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">General focus — no linked task</option>
                {tasks.filter((t) => t.status !== 'completed').map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.estimatedMinutes}m)
                  </option>
                ))}
              </select>
            </div>

            {/* Link Subject Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                Linked Subject
              </label>
              <select
                disabled={isRunning || isPaused}
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">General study — no linked subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code || s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Current Active Selection Summary */}
            {(selectedTaskObj || selectedSubjectObj) && (
              <div className="p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] space-y-1.5 text-xs">
                {selectedTaskObj && (
                  <div className="flex items-center justify-between text-[var(--text-primary)] font-medium truncate">
                    <span>Task: {selectedTaskObj.title}</span>
                    <Badge variant="blue" size="sm">{selectedTaskObj.priority}</Badge>
                  </div>
                )}
                {selectedSubjectObj && (
                  <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono"
                      style={{ backgroundColor: `${selectedSubjectObj.color}20`, color: selectedSubjectObj.color }}
                    >
                      {selectedSubjectObj.code || selectedSubjectObj.name}
                    </span>
                    <span className="truncate">{selectedSubjectObj.name}</span>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Ambient Sound Synthesizer Panel */}
          <Card className="p-6 space-y-4 border border-[var(--border-glass)]">
            <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-[var(--accent-emerald)]" />
              Ambient Focus Audio
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2.5">
              <Button
                variant={ambientSound === 'rain' ? 'emerald' : 'secondary'}
                size="sm"
                icon={<CloudRain className="w-4 h-4" />}
                onClick={() => toggleAmbientSound('rain')}
                className="justify-start"
              >
                Soft Rain
              </Button>

              <Button
                variant={ambientSound === 'waves' ? 'primary' : 'secondary'}
                size="sm"
                icon={<Waves className="w-4 h-4" />}
                onClick={() => toggleAmbientSound('waves')}
                className="justify-start"
              >
                Ocean Waves
              </Button>

              <Button
                variant={ambientSound === 'brown' ? 'purple' : 'secondary'}
                size="sm"
                icon={<Radio className="w-4 h-4" />}
                onClick={() => toggleAmbientSound('brown')}
                className="justify-start"
              >
                Brown Noise
              </Button>
            </div>
          </Card>
        </div>
      </motion.section>

      {/* 4. RECENT FOCUS SESSIONS HISTORY */}
      <motion.section variants={itemVariants} className="space-y-4">
        <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[var(--accent-amber)]" />
          Recent Focus Sessions
        </h3>

        {sortedSessions.length === 0 ? (
          <Card className="p-12 text-center text-xs text-[var(--text-secondary)] border border-dashed border-[var(--border-glass)] space-y-2">
            <p className="text-sm font-semibold text-[var(--text-primary)]">No focus sessions recorded yet</p>
            <p className="text-xs text-[var(--text-muted)]">Complete a timer session above to build your study history.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedSessions.slice(0, 6).map((s) => {
              const linkedTask = s.taskId ? tasks.find((t) => t.id === s.taskId) : null;
              const linkedSub = s.subjectId ? subjects.find((sb) => sb.id === s.subjectId) : null;

              return (
                <Card key={s.id} className="p-5 space-y-3 border border-[var(--border-glass)]">
                  <div className="flex items-center justify-between">
                    <Badge variant={s.type === 'deep_work' ? 'purple' : s.type === 'stopwatch' ? 'amber' : 'blue'} size="sm">
                      {formatFocusSessionType(s.type)}
                    </Badge>
                    <span className="text-xs font-bold text-[var(--accent-emerald)] font-mono">
                      {s.durationMinutes} mins
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {linkedTask ? linkedTask.title : 'General Study Session'}
                    </div>
                    {linkedSub && (
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold font-mono mt-0.5"
                        style={{ backgroundColor: `${linkedSub.color}20`, color: linkedSub.color }}
                      >
                        {linkedSub.code || linkedSub.name}
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[var(--border-glass)] flex items-center justify-between text-[11px] text-[var(--text-secondary)] font-mono">
                    <span>
                      {new Date(s.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="flex items-center gap-2">
                      {s.distractionCount > 0 && (
                        <span className="text-[var(--accent-rose)] font-semibold">
                          {s.distractionCount} dist.
                        </span>
                      )}
                      {typeof s.reflectionRating === 'number' && (
                        <span className="text-[var(--accent-amber)] font-bold flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-current" />
                          {s.reflectionRating}/5
                        </span>
                      )}
                    </div>
                  </div>

                  {s.notes && (
                    <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 italic pt-1 border-t border-[var(--border-glass)]">
                      "{s.notes}"
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </motion.section>

      {/* 5. SESSION COMPLETION & REFLECTION MODAL */}
      <Modal
        isOpen={isCompletionModalOpen}
        onClose={handleCancelCompletion}
        title="Focus Session Complete!"
      >
        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] space-y-2 text-xs">
            <div className="flex justify-between items-center text-[var(--text-primary)] font-bold">
              <span>{formatFocusSessionType(timerType)} Session</span>
              <span className="text-sm text-[var(--accent-emerald)] font-mono">
                {Math.max(1, Math.round(elapsedSeconds / 60))} mins
              </span>
            </div>
            {selectedTaskObj && (
              <div className="text-[var(--text-secondary)] truncate">
                Linked Task: <span className="font-semibold text-[var(--text-primary)]">{selectedTaskObj.title}</span>
              </div>
            )}
            {selectedSubjectObj && (
              <div className="text-[var(--text-secondary)] truncate">
                Subject: <span className="font-semibold text-[var(--text-primary)]">{selectedSubjectObj.name}</span>
              </div>
            )}
          </div>

          {/* Distraction Counter */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">
              Distractions Recorded
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={distractionCount <= 0}
                onClick={() => setDistractionCount((d) => Math.max(0, d - 1))}
                className="p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-glass)] hover:bg-[var(--border-glass)] text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="font-mono text-base font-bold px-4 py-1.5 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl">
                {distractionCount}
              </span>
              <button
                type="button"
                onClick={() => setDistractionCount((d) => d + 1)}
                className="p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-glass)] hover:bg-[var(--border-glass)] text-[var(--text-primary)] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Star Rating */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">
              Session Quality Rating (1 to 5 Stars)
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReflectionRating(star)}
                  className="p-2 rounded-xl hover:bg-[var(--border-glass)] transition-transform active:scale-90 cursor-pointer"
                  title={`Rate ${star} star(s)`}
                >
                  <Star
                    className={`w-6 h-6 ${
                      star <= reflectionRating
                        ? 'text-[var(--accent-amber)] fill-current'
                        : 'text-[var(--text-muted)]'
                    }`}
                  />
                </button>
              ))}
              <span className="text-xs font-bold text-[var(--text-secondary)] ml-2 font-mono">
                {reflectionRating}/5
              </span>
            </div>
          </div>

          {/* Session Notes */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">
              Session Reflection Notes (Optional)
            </label>
            <textarea
              value={reflectionNotes}
              onChange={(e) => setReflectionNotes(e.target.value)}
              placeholder="What did you accomplish or learn during this session?"
              className="w-full h-24 p-3 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-glass)]">
            <Button variant="ghost" size="md" type="button" onClick={handleCancelCompletion}>
              Cancel
            </Button>
            <Button
              variant="emerald"
              size="md"
              disabled={isSavingSession}
              onClick={handleConfirmSaveSession}
            >
              {isSavingSession ? 'Saving...' : 'Save & Log Session'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 6. RESET CONFIRMATION MODAL */}
      <Modal
        isOpen={isResetConfirmModalOpen}
        onClose={() => setIsResetConfirmModalOpen(false)}
        title="Reset Active Timer?"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-primary)]">
            Are you sure you want to reset this session? Unsaved progress ({Math.round(elapsedSeconds / 60)} mins) will be lost.
          </p>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-glass)]">
            <Button variant="ghost" size="md" onClick={() => setIsResetConfirmModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="md" onClick={executeReset}>
              Reset Session
            </Button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
};
