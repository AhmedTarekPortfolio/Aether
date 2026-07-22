import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { FocusSession, Task, Subject } from '../types';
import { soundService } from '../services/soundService';
import confetti from 'canvas-confetti';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Sparkles, CheckCircle2, CloudRain, Waves, Radio } from 'lucide-react';

interface FocusViewProps {
  tasks: Task[];
  subjects: Subject[];
  focusSessions: FocusSession[];
  onLogFocusSession: (session: Omit<FocusSession, 'id' | 'completedAt'>) => void;
}

export const FocusView: React.FC<FocusViewProps> = ({
  tasks,
  subjects,
  focusSessions,
  onLogFocusSession,
}) => {
  const [timerType, setTimerType] = useState<'pomodoro' | 'deep_work' | 'stopwatch'>('pomodoro');
  const [targetMinutes, setTargetMinutes] = useState<number>(25);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(25 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Selected task / subject link
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  // Ambient sound state
  const [ambientSound, setAmbientSound] = useState<'none' | 'rain' | 'waves' | 'brown'>('none');

  // Distraction & Rating logger state
  const [distractionCount, setDistractionCount] = useState<number>(0);
  const [reflectionRating, setReflectionRating] = useState<number>(5);

  // Stop ambient audio if the user navigates away from Focus while it's playing.
  // soundService is a module-level singleton, so without this the noise node
  // keeps looping in the background after this component unmounts.
  useEffect(() => {
    return () => {
      soundService.stop();
    };
  }, []);

  // Sync target minutes when mode changes
  useEffect(() => {
    if (timerType === 'pomodoro') setTargetMinutes(25);
    else if (timerType === 'deep_work') setTargetMinutes(45);
    else if (timerType === 'stopwatch') setTargetMinutes(0);
    setTimeLeftSeconds(timerType === 'stopwatch' ? 0 : (timerType === 'deep_work' ? 45 : 25) * 60);
    setIsRunning(false);
  }, [timerType]);

  // Main countdown / count-up effect
  useEffect(() => {
    let interval: any = null;
    if (isRunning) {
      interval = setInterval(() => {
        setTimeLeftSeconds((prev) => {
          if (timerType === 'stopwatch') return prev + 1;
          if (prev <= 1) {
            clearInterval(interval);
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRunning, timerType]);

  const handleTimerComplete = () => {
    setIsRunning(false);

    // Compute actual elapsed time rather than assuming the full target was reached.
    // Stopwatch counts up, so timeLeftSeconds already IS the elapsed time.
    // Countdown modes count down from targetMinutes*60, so elapsed = target - remaining.
    const elapsedSeconds =
      timerType === 'stopwatch' ? timeLeftSeconds : targetMinutes * 60 - timeLeftSeconds;
    const actualDurationMinutes = Math.round(elapsedSeconds / 60);

    // Guard against logging a session for an accidental instant "complete" click.
    if (actualDurationMinutes < 1) return;

    soundService.playTimerCompletionBell();
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });

    onLogFocusSession({
      taskId: selectedTaskId || undefined,
      subjectId: selectedSubjectId || undefined,
      durationMinutes: actualDurationMinutes,
      type: timerType,
      distractionCount,
      reflectionRating,
    });
  };

  const toggleSound = (sound: 'rain' | 'waves' | 'brown') => {
    if (ambientSound === sound) {
      soundService.stop();
      setAmbientSound('none');
    } else {
      soundService.playAmbient(sound);
      setAmbientSound(sound);
    }
  };

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent =
    timerType === 'stopwatch'
      ? 100
      : Math.min(100, Math.round(((targetMinutes * 60 - timeLeftSeconds) / (targetMinutes * 60)) * 100));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Timer Type Selector */}
      <div className="flex justify-center">
        <div className="p-1.5 bg-[#111B2E] border border-white/10 rounded-2xl flex items-center gap-2">
          <Button
            variant={timerType === 'pomodoro' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setTimerType('pomodoro')}
          >
            Pomodoro (25m)
          </Button>
          <Button
            variant={timerType === 'deep_work' ? 'purple' : 'ghost'}
            size="sm"
            onClick={() => setTimerType('deep_work')}
          >
            Deep Work (45m)
          </Button>
          <Button
            variant={timerType === 'stopwatch' ? 'amber' : 'ghost'}
            size="sm"
            onClick={() => setTimerType('stopwatch')}
          >
            Stopwatch
          </Button>
        </div>
      </div>

      {/* Main Focus Ring Card */}
      <Card className="max-w-xl mx-auto p-10 text-center space-y-8 relative overflow-hidden bg-gradient-to-b from-[#111B2E] to-[#0B1220]">
        {/* Ring Graphic */}
        <div className="relative w-64 h-64 mx-auto flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="128"
              cy="128"
              r="110"
              className="stroke-slate-800"
              strokeWidth="10"
              fill="transparent"
            />
            <circle
              cx="128"
              cy="128"
              r="110"
              className="stroke-[#4F7CFF] transition-all duration-1000"
              strokeWidth="10"
              strokeDasharray={2 * Math.PI * 110}
              strokeDashoffset={2 * Math.PI * 110 * (1 - progressPercent / 100)}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-5xl font-extrabold font-mono text-white tracking-wider">
              {formatTime(timeLeftSeconds)}
            </div>
            <div className="text-xs text-slate-400 font-medium uppercase tracking-widest mt-1">
              {isRunning ? 'FOCUS SESSION ACTIVE' : 'READY TO START'}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="ghost"
            size="md"
            icon={<RotateCcw className="w-5 h-5 text-slate-400" />}
            onClick={() => {
              setIsRunning(false);
              setTimeLeftSeconds(targetMinutes * 60);
            }}
          />

          <Button
            variant={isRunning ? 'amber' : 'primary'}
            size="lg"
            className="w-40"
            icon={isRunning ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
            onClick={() => setIsRunning(!isRunning)}
          >
            {isRunning ? 'Pause' : 'Start Focus'}
          </Button>

          <Button
            variant="emerald"
            size="md"
            icon={<CheckCircle2 className="w-5 h-5" />}
            onClick={handleTimerComplete}
            title="Complete & Log Session"
          />
        </div>

        {/* Ambient Audio Generator controls */}
        <div className="pt-6 border-t border-white/10 space-y-3">
          <div className="text-xs font-mono text-slate-400 flex items-center justify-center gap-1.5">
            <Volume2 className="w-4 h-4 text-[#2DD4BF]" />
            Synthesize Ambient Focus Audio (Web Audio API)
          </div>

          <div className="flex justify-center items-center gap-3">
            <Button
              variant={ambientSound === 'rain' ? 'emerald' : 'secondary'}
              size="sm"
              icon={<CloudRain className="w-4 h-4" />}
              onClick={() => toggleSound('rain')}
            >
              Soft Rain
            </Button>

            <Button
              variant={ambientSound === 'waves' ? 'primary' : 'secondary'}
              size="sm"
              icon={<Waves className="w-4 h-4" />}
              onClick={() => toggleSound('waves')}
            >
              Ocean Waves
            </Button>

            <Button
              variant={ambientSound === 'brown' ? 'purple' : 'secondary'}
              size="sm"
              icon={<Radio className="w-4 h-4" />}
              onClick={() => toggleSound('brown')}
            >
              Brown Noise
            </Button>
          </div>
        </div>
      </Card>

      {/* Focus History & Logs */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#FBBF24]" />
          Recent Completed Focus Sessions
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {focusSessions.slice(0, 4).map((s) => (
            <Card key={s.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-100 capitalize">
                  {s.type.replace('_', ' ')} Session ({s.durationMinutes}m)
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Completed {new Date(s.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <Badge variant="emerald" size="sm">
                Rating: {s.reflectionRating || 5}/5 ⭐
              </Badge>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
