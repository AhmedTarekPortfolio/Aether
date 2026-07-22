import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AIInteraction, UserProfile, Subject } from '../types';
import { generateAIResponse } from '../services/aiService';
import { Bot, Send, Sparkles, Code, BookOpen, PenTool, HelpCircle, Trash2 } from 'lucide-react';

interface AIAssistantViewProps {
  aiChats: AIInteraction[];
  subjects: Subject[];
  userProfile: UserProfile | null;
  onAddAIMessage: (msg: Omit<AIInteraction, 'id' | 'timestamp'>) => Promise<void>;
  onClearChats: () => Promise<void>;
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  aiChats,
  subjects,
  userProfile,
  onAddAIMessage,
  onClearChats,
}) => {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<AIInteraction['mode']>('tutor');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(subjects[0]?.id || '');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    const userPrompt = prompt;
    setPrompt('');
    setIsGenerating(true);

    // Add User Message
    await onAddAIMessage({
      role: 'user',
      content: userPrompt,
      mode,
    });

    const activeSubject = subjects.find((s) => s.id === selectedSubjectId);
    const aiRes = await generateAIResponse(userPrompt, mode, userProfile || {
      name: 'Alex',
      academicLevel: 'B.S. CS',
      studyGoalHoursWeekly: 25,
      theme: 'dark',
      soundEnabled: true,
      aiProvider: 'local',
    }, { subject: activeSubject });

    // Add AI Response Message
    await onAddAIMessage({
      role: 'assistant',
      content: aiRes.content,
      mode,
      explanation: aiRes.explanation,
    });

    setIsGenerating(false);
  };

  const modeButtons: { id: AIInteraction['mode']; label: string; icon: React.ReactNode }[] = [
    { id: 'tutor', label: 'Concept Tutor', icon: <BookOpen className="w-4 h-4 text-[var(--accent-blue)]" /> },
    { id: 'quiz', label: 'Practice Quiz', icon: <HelpCircle className="w-4 h-4 text-[var(--accent-emerald)]" /> },
    { id: 'code', label: 'Code Helper', icon: <Code className="w-4 h-4 text-[var(--accent-purple)]" /> },
    { id: 'writer', label: 'Writing Reviewer', icon: <PenTool className="w-4 h-4 text-[var(--accent-amber)]" /> },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Mode Selection Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {modeButtons.map((m) => (
            <Button
              key={m.id}
              variant={mode === m.id ? 'primary' : 'ghost'}
              size="sm"
              icon={m.icon}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
            className="px-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-glass)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                Context: {s.code || s.name}
              </option>
            ))}
          </select>

          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="w-4 h-4 text-[var(--text-muted)]" />}
            onClick={onClearChats}
            title="Clear Chat History"
          />
        </div>
      </div>

      {/* Chat Messages Stream */}
      <Card className="p-6 h-[520px] flex flex-col justify-between space-y-4">
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {aiChats.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-[var(--text-secondary)] space-y-3">
              <div className="p-4 rounded-2xl bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]">
                <Bot className="w-8 h-8" />
              </div>
              <h4 className="text-base font-semibold text-[var(--text-primary)]">Aether AI Study Coach</h4>
              <p className="text-xs text-[var(--text-secondary)] max-w-md">
                Ask questions, generate practice quizzes, request code optimizations, or review essay drafts.
              </p>
            </div>
          ) : (
            aiChats.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isUser
                        ? 'bg-[var(--accent-blue)] text-white'
                        : 'bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] border border-[var(--accent-purple)]/30'
                    }`}
                  >
                    {isUser ? <Sparkles className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  <div className={`space-y-2 max-w-2xl ${isUser ? 'items-end' : ''}`}>
                    <div
                      className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                        isUser
                          ? 'bg-[var(--accent-blue)] text-white rounded-tr-none'
                          : 'bg-[var(--bg-primary)] border border-[var(--border-glass)] text-[var(--text-primary)] rounded-tl-none'
                      }`}
                    >
                      {msg.content}
                    </div>

                    {!isUser && msg.explanation && (
                      <div className="p-3 rounded-xl bg-[var(--border-glass)] border border-[var(--border-glass)] text-xs text-[var(--text-secondary)] space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono text-[var(--accent-purple)] font-semibold">
                          <span>EXPLAINABILITY MATRIX</span>
                          <span>{msg.explanation.confidence}% Confidence</span>
                        </div>
                        <ul className="list-disc list-inside space-y-0.5">
                          {msg.explanation.factors.map((f: string, i: number) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {isGenerating && (
            <div className="flex items-center gap-3 text-xs text-[var(--accent-purple)] animate-pulse font-medium">
              <Bot className="w-4 h-4" />
              <span>Aether AI is synthesizing explainable answer...</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} className="flex items-center gap-3 pt-3 border-t border-[var(--border-glass)]">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`Ask Aether AI (${mode.toUpperCase()} mode)...`}
            className="flex-1 px-4 py-3 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-purple)]"
          />

          <Button
            variant="purple"
            size="md"
            type="submit"
            disabled={!prompt.trim() || isGenerating}
            icon={<Send className="w-4 h-4" />}
          >
            Send
          </Button>
        </form>
      </Card>
    </div>
  );
};
