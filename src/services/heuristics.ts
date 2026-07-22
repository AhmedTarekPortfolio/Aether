import { Task, Subject, NextBestAction, RecommendationFactor } from '../types';

export function calculateNextBestAction(tasks: Task[], subjects: Subject[]): NextBestAction | null {
  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  if (pendingTasks.length === 0) return null;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Map subjects by ID for quick lookup
  const subjectMap = new Map<string, Subject>();
  subjects.forEach(s => subjectMap.set(s.id, s));

  // Score each task
  let highestScore = -1;
  let topTask: Task = pendingTasks[0];
  let topFactors: RecommendationFactor[] = [];
  let topReason = '';

  for (const task of pendingTasks) {
    const subject = task.subjectId ? subjectMap.get(task.subjectId) : undefined;
    const confidenceRating = subject ? subject.confidenceRating : 70;

    // 1. Deadline score (40%)
    let deadlineWeight = 0;
    let deadlineDesc = 'No imminent deadline.';
    if (task.dueDate) {
      const hoursLeft = Math.max(0, (task.dueDate - now) / (1000 * 60 * 60));
      if (hoursLeft <= 24) {
        deadlineWeight = 100;
        deadlineDesc = `Due in ${Math.round(hoursLeft)} hours! Immediate attention required.`;
      } else if (hoursLeft <= 72) {
        deadlineWeight = 80;
        deadlineDesc = `Due in ${Math.round(hoursLeft / 24)} days. High priority queue.`;
      } else {
        deadlineWeight = 40;
        deadlineDesc = `Due in ${Math.round(hoursLeft / 24)} days.`;
      }
    }

    // 2. Confidence gap score (30%)
    const confidenceGapWeight = Math.max(0, 100 - confidenceRating);
    const confidenceDesc = subject 
      ? `Your current confidence in ${subject.code || subject.name} is ${confidenceRating}% (Gap: ${100 - confidenceRating}%).`
      : 'Unlinked task without subject baseline.';

    // 3. User Priority score (20%)
    let priorityWeight = 50;
    let priorityDesc = 'Standard priority assignment.';
    if (task.priority === 'urgent') {
      priorityWeight = 100;
      priorityDesc = 'Flagged as URGENT priority by user.';
    } else if (task.priority === 'high') {
      priorityWeight = 85;
      priorityDesc = 'Flagged as HIGH priority.';
    } else if (task.priority === 'medium') {
      priorityWeight = 60;
    }

    // 4. Peak Energy Window Match (10%)
    const currentHour = new Date().getHours();
    const isMorningPeak = currentHour >= 7 && currentHour <= 12;
    const energyWeight = isMorningPeak ? 90 : 60;
    const energyDesc = isMorningPeak 
      ? 'Current time matches your peak morning cognitive energy window.' 
      : 'Afternoon / Evening study block.';

    // Total weighted score formula
    const totalScore = Math.round(
      0.40 * deadlineWeight +
      0.30 * confidenceGapWeight +
      0.20 * priorityWeight +
      0.10 * energyWeight
    );

    if (totalScore > highestScore) {
      highestScore = totalScore;
      topTask = task;

      const factors: RecommendationFactor[] = [
        {
          name: 'Deadline Proximity',
          weight: Math.round((0.40 * deadlineWeight / Math.max(1, totalScore)) * 100),
          description: deadlineDesc,
          category: 'deadline',
        },
        {
          name: 'Subject Mastery Gap',
          weight: Math.round((0.30 * confidenceGapWeight / Math.max(1, totalScore)) * 100),
          description: confidenceDesc,
          category: 'confidence',
        },
        {
          name: 'Priority Elevation',
          weight: Math.round((0.20 * priorityWeight / Math.max(1, totalScore)) * 100),
          description: priorityDesc,
          category: 'priority',
        },
        {
          name: 'Energy Window Fit',
          weight: Math.round((0.10 * energyWeight / Math.max(1, totalScore)) * 100),
          description: energyDesc,
          category: 'energy',
        },
      ];

      topFactors = factors;
      topReason = `High-impact study recommended due to ${
        task.dueDate && (task.dueDate - now) < 3 * dayMs ? 'upcoming deadline and ' : ''
      }confidence gap in ${subject ? subject.name : 'this subject'}.`;
    }
  }

  const subject = topTask.subjectId ? subjectMap.get(topTask.subjectId) : undefined;

  return {
    id: `nba_${topTask.id}`,
    taskId: topTask.id,
    subjectId: topTask.subjectId,
    title: topTask.title,
    subtitle: subject ? `${subject.code || subject.name} — ${topTask.estimatedMinutes} min target` : `${topTask.estimatedMinutes} min target`,
    reason: topReason,
    confidenceScore: Math.min(98, Math.max(72, highestScore)),
    estimatedMinutes: topTask.estimatedMinutes || 45,
    factors: topFactors,
    actionableSteps: [
      `Review key concept notes for 10 minutes.`,
      `Complete ${Math.ceil((topTask.estimatedMinutes || 45) / 15)} target problems or section derivations.`,
      `Log a 25-minute Pomodoro focus session to lock in progress.`,
    ],
    generatedAt: now,
  };
}
