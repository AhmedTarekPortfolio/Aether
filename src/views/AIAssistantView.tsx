import React, { useState, useEffect, useRef } from 'react';
import { AIInteraction, UserProfile, Subject, Task, AIProviderProfile } from '../types';
import {
  getActiveProviderProfile,
  aiOrchestrator,
  PrivacyMode,
  PreparedAIRequest,
  normalizeAIError,
} from '../services/ai';
import { ModelSettingsModal } from '../components/ai/ModelSettingsModal';
import { PrivacyPreviewModal } from '../components/ai/PrivacyPreviewModal';
import { ReasoningPanel } from '../components/ai/ReasoningPanel';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import { sortMessagesChronologically, getStarterPromptsForMode } from '../services/aiConversationUtils';
import {
  Send,
  Square,
  BookOpen,
  HelpCircle,
  Code,
  PenTool,
  MessageSquare,
  Sliders,
  Trash2,
  Tag,
  ArrowDown,
  Copy,
  Check,
  RotateCcw,
  AlertTriangle,
  Cpu,
  Shield,
  ShieldAlert,
  Brain,
  Search,
  type LucideIcon,
} from 'lucide-react';

export type GenerationState =
  | 'idle'
  | 'preparing'
  | 'saving_user'
  | 'generating'
  | 'saving_assistant'
  | 'stopped'
  | 'failed';

const AI_MODE_OPTIONS: Array<{
  id: AIInteraction['mode'];
  label: string;
  icon: LucideIcon;
}> = [
  { id: 'tutor', label: 'Chat', icon: MessageSquare },
  { id: 'ask_resources', label: 'Ask Resources', icon: BookOpen },
  { id: 'explain', label: 'Explain', icon: HelpCircle },
  { id: 'summarize', label: 'Summarize', icon: PenTool },
];

interface AIAssistantViewProps {
  aiChats: AIInteraction[];
  subjects: Subject[];
  tasks?: Task[];
  userProfile: UserProfile | null;
  onClearChats: () => Promise<void>;
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  aiChats,
  subjects,
  tasks = [],
  userProfile,
  onClearChats,
}) => {
  const { showToast } = useToast();

  // Mode, Subject & Privacy State
  const [mode, setMode] = useState<AIInteraction['mode']>('tutor');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(subjects[0]?.id || '');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>('standard');

  // Active Provider Profile State
  const [activeProfile, setActiveProfile] = useState<AIProviderProfile>(getActiveProviderProfile());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Prepared Request & Privacy Preview State
  const [preparedRequest, setPreparedRequest] = useState<PreparedAIRequest | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Generation State Machine
  const [generationState, setGenerationState] = useState<GenerationState>('idle');
  const [prompt, setPrompt] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [pendingPrompt, setPendingPrompt] = useState('');
  const activeRequestIdRef = useRef<string | null>(null);

  // Unsaved assistant response recovery state
  const [unsavedAssistantText, setUnsavedAssistantText] = useState<string | null>(null);

  // Diagnostics & Errors
  const [providerError, setProviderError] = useState<{ title: string; message: string; actionRequired?: string } | null>(null);

  // Clear History Modal State
  const [isClearHistoryConfirmOpen, setIsClearHistoryConfirmOpen] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);

  // Copy Feedback State
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Scroll Management
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  useEffect(() => {
    setActiveProfile(getActiveProviderProfile());
  }, []);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 80;
    setIsUserScrolledUp(!isAtBottom);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (!isUserScrolledUp && (generationState === 'generating' || streamingText)) {
      scrollToBottom('smooth');
    }
  }, [streamingText, generationState, isUserScrolledUp]);

  const handleSend = async (customPrompt?: string) => {
    const textToSend = (customPrompt || prompt).trim();
    if (!textToSend || ['preparing', 'saving_user', 'generating', 'saving_assistant'].includes(generationState)) return;

    setProviderError(null);
    setStreamingText('');
    setStreamingReasoning('');
    setUnsavedAssistantText(null);
    setGenerationState('preparing');

    try {
      const preparedResult = await aiOrchestrator.prepare({
        prompt: textToSend,
        mode,
        userId: userProfile?.id || 'default_user',
        profileId: activeProfile.id,
        subjectId: selectedSubjectId || undefined,
        taskId: selectedTaskId || undefined,
        privacyMode,
        conversationHistory: aiChats,
      });

      if (preparedResult.type === 'local_only_result') {
        // Local Tools Only or No-Evidence Result
        setGenerationState('saving_user');
        await aiOrchestrator.persistLocalOnlyResult(preparedResult);
        setPrompt('');
        setGenerationState('idle');
        return;
      }

      setPreparedRequest(preparedResult);

      if (preparedResult.requiresConfirmation) {
        setIsPreviewOpen(true);
        setGenerationState('idle');
        return;
      }

      // Execute request immediately
      await executePreparedRequest(preparedResult, textToSend);
    } catch (err: any) {
      if (typeof err?.content === 'string' && err.content.trim()) {
        setUnsavedAssistantText(err.content);
        showToast('Save Warning', 'warning', 'Generated response received but failed to save to database.');
      }
      const norm = normalizeAIError(err);
      setProviderError({ title: norm.title, message: norm.message, actionRequired: norm.actionRequired });
      setGenerationState('failed');
    }
  };

  const executePreparedRequest = async (prepared: PreparedAIRequest, userPromptText: string) => {
    setIsPreviewOpen(false);
    activeRequestIdRef.current = prepared.requestId;
    setPendingPrompt(userPromptText);

    // Stream / generate first; persist one complete conversation only after the
    // provider finishes so placeholder records cannot survive failures.
    setGenerationState('generating');
    setPrompt('');

    try {
      const shouldStream = prepared.profileConfig.type !== 'local' && prepared.profileConfig.stream !== false;
      await aiOrchestrator.send(prepared, shouldStream ? {
        streamHandlers: {
          onToken: (token) => {
            if (activeRequestIdRef.current === prepared.requestId) {
              setStreamingText((prev) => prev + token);
            }
          },
          onReasoningToken: (token) => {
            if (activeRequestIdRef.current === prepared.requestId) {
              setStreamingReasoning((prev) => prev + token);
            }
          },
          onComplete: (content, reasoning) => {
            if (activeRequestIdRef.current === prepared.requestId) {
              setStreamingText(content);
              if (reasoning) setStreamingReasoning(reasoning);
            }
          },
          // The transport rejects its promise after this callback, so the
          // surrounding try/catch remains the single error-state transition.
          onError: () => {},
        },
      } : undefined);

      setGenerationState('idle');
      setStreamingText('');
      setStreamingReasoning('');
      setPendingPrompt('');
      activeRequestIdRef.current = null;
    } catch (err: any) {
      if (activeRequestIdRef.current === prepared.requestId) {
        if (typeof err?.content === 'string' && err.content.trim()) {
          setUnsavedAssistantText(err.content);
          showToast('Save Warning', 'warning', 'Generated response received but failed to save to database.');
        }
        const norm = normalizeAIError(err);
        setProviderError({ title: norm.title, message: norm.message, actionRequired: norm.actionRequired });
        setGenerationState(err.message?.includes('cancelled') ? 'stopped' : 'failed');
        setPrompt(userPromptText);
        setPendingPrompt('');
        activeRequestIdRef.current = null;
      }
    }
  };

  const handleStopGenerating = () => {
    if (activeRequestIdRef.current) {
      aiOrchestrator.cancel(activeRequestIdRef.current);
      setGenerationState('stopped');
      showToast('Generation Cancelled', 'info', 'Stopped response generation.');
    }
  };

  const handleClearHistory = async () => {
    setIsClearingHistory(true);
    try {
      await onClearChats();
      setIsClearHistoryConfirmOpen(false);
      showToast('History Cleared', 'success', 'All AI conversation history removed.');
    } catch {
      showToast('Clear Failed', 'error', 'Could not clear conversation history.');
    } finally {
      setIsClearingHistory(false);
    }
  };

  const handleCopyText = (text: string, msgId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const sortedChats = sortMessagesChronologically(aiChats);
  const isGenerating = generationState === 'generating'
    || generationState === 'saving_user'
    || generationState === 'saving_assistant'
    || generationState === 'preparing';

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] text-[var(--text-primary)] relative overflow-hidden">
      {/* Header Bar */}
      <header className="p-3 sm:p-4 border-b border-[var(--border-glass)] bg-[var(--bg-secondary)] flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Mode Selector */}
        <div className="flex items-center gap-1.5 bg-[var(--bg-tertiary)] p-1 rounded-xl border border-[var(--border-glass)]">
          {AI_MODE_OPTIONS.map((m) => {
            const Icon = m.icon;
            const isActive = mode === m.id;
            return (
              <button
                key={m.id}
                disabled={isGenerating}
                onClick={() => setMode(m.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[var(--accent-purple)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* Controls Right */}
        <div className="flex items-center gap-2">
          {/* Privacy Selector */}
          <select
            value={privacyMode}
            onChange={(e) => setPrivacyMode(e.target.value as PrivacyMode)}
            className="px-2.5 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-glass)] rounded-xl text-xs font-medium text-[var(--text-primary)] focus:outline-none"
          >
            <option value="standard">Standard Privacy</option>
            <option value="ask_before_sending">Ask Before Sending (Preview)</option>
            <option value="local_model_only">Local Model Only</option>
            <option value="local_tools_only">Local Tools Only (Offline)</option>
            <option value="sensitive_study_mode">Sensitive Study Mode</option>
          </select>

          {/* Provider Settings Trigger */}
          <Button
            variant="ghost"
            size="sm"
            disabled={isGenerating}
            icon={<Cpu className="w-4 h-4 text-[var(--accent-purple)]" />}
            onClick={() => setIsSettingsOpen(true)}
          >
            <span className="hidden sm:inline font-mono">{activeProfile.name}</span>
          </Button>

          {/* Clear History */}
          <Button
            variant="ghost"
            size="sm"
            disabled={isGenerating || sortedChats.length === 0}
            icon={<Trash2 className="w-4 h-4 text-[var(--accent-rose)]" />}
            onClick={() => setIsClearHistoryConfirmOpen(true)}
          />
        </div>
      </header>

      {/* Main Conversation Viewport */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {sortedChats.length === 0 && !streamingText && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] flex items-center justify-center border border-[var(--accent-purple)]/20">
              <Cpu className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="text-base font-bold">Aether AI Study Assistant</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Ask questions, explain concepts, or perform local searches across your study notes and subjects.
              </p>
            </div>

            {/* Starter Prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full pt-4">
              {getStarterPromptsForMode(mode).map((promptText, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setPrompt(promptText);
                    handleSend(promptText);
                  }}
                  className="p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-glass)] text-left hover:border-[var(--accent-purple)] transition-all text-xs font-medium cursor-pointer"
                >
                  "{promptText}"
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Render Conversation History */}
        {sortedChats.map((chat) => (
          <div key={chat.id} className="space-y-4 max-w-3xl mx-auto">
            {/* User Message */}
            <div className="flex justify-end">
              <div className="max-w-[85%] sm:max-w-[75%] p-3.5 rounded-2xl bg-[var(--accent-purple)] text-white text-xs leading-relaxed font-sans shadow-sm">
                {chat.prompt}
              </div>
            </div>

            {/* Assistant Response */}
            <div className="flex justify-start">
              <div className="max-w-[90%] sm:max-w-[85%] p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-glass)] space-y-3">
                {/* Reasoning Panel */}
                {chat.explanation?.factors?.[0] && (
                  <ReasoningPanel reasoning={chat.explanation.factors[0]} />
                )}

                {/* Main Content */}
                <div className="text-xs text-[var(--text-primary)] leading-relaxed font-sans whitespace-pre-wrap">
                  {chat.response}
                </div>

                {/* Message Footer Controls */}
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-glass)] text-[10px] text-[var(--text-muted)]">
                  <span>{new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <button
                    onClick={() => handleCopyText(chat.response || chat.content || '', chat.id)}
                    className="flex items-center gap-1 hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    {copiedMsgId === chat.id ? <Check className="w-3 h-3 text-[var(--accent-emerald)]" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedMsgId === chat.id ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {pendingPrompt && (
          <div className="max-w-3xl mx-auto flex justify-end">
            <div className="max-w-[85%] sm:max-w-[75%] p-3.5 rounded-2xl bg-[var(--accent-purple)] text-white text-xs leading-relaxed">
              {pendingPrompt}
            </div>
          </div>
        )}

        {/* Live Streaming Message Display */}
        {(streamingText || streamingReasoning) && (
          <div className="max-w-3xl mx-auto flex justify-start">
            <div className="max-w-[90%] sm:max-w-[85%] p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--accent-purple)]/40 space-y-3">
              {streamingReasoning && <ReasoningPanel reasoning={streamingReasoning} />}
              <div className="text-xs text-[var(--text-primary)] leading-relaxed font-sans whitespace-pre-wrap">
                {streamingText}
                <span className="inline-block w-2 h-4 ml-1 bg-[var(--accent-purple)] animate-pulse" />
              </div>
            </div>
          </div>
        )}

        {/* Provider Error Banner */}
        {providerError && (
          <div className="max-w-3xl mx-auto p-4 rounded-xl bg-[var(--accent-rose)]/10 border border-[var(--accent-rose)]/30 text-[var(--accent-rose)] text-xs space-y-1">
            <div className="font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>{providerError.title}</span>
            </div>
            <div>{providerError.message}</div>
            {providerError.actionRequired && <div className="font-medium pt-1">{providerError.actionRequired}</div>}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Jump to Bottom Button */}
      {isUserScrolledUp && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-20 right-6 p-2 rounded-full bg-[var(--accent-purple)] text-white shadow-lg cursor-pointer hover:scale-105 transition-all"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Composer Input Footer */}
      <footer className="p-3 sm:p-4 border-t border-[var(--border-glass)] bg-[var(--bg-secondary)] shrink-0">
        <div className="max-w-3xl mx-auto space-y-2">
          <div className="relative flex items-center">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask Aether AI a question, explain a topic, or search study notes..."
              rows={2}
              className="w-full pl-4 pr-24 py-3 bg-[var(--bg-input)] border border-[var(--border-glass)] rounded-2xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-purple)] resize-none"
            />

            <div className="absolute right-3 flex items-center gap-2">
              {isGenerating ? (
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Square className="w-3.5 h-3.5" />}
                  onClick={handleStopGenerating}
                >
                  Stop
                </Button>
              ) : (
                <Button
                  variant="purple"
                  size="sm"
                  disabled={!prompt.trim()}
                  icon={<Send className="w-3.5 h-3.5" />}
                  onClick={() => handleSend()}
                >
                  Send
                </Button>
              )}
            </div>
          </div>
        </div>
      </footer>

      {/* Settings Modal */}
      <ModelSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onActiveProfileChanged={(prof) => setActiveProfile(prof)}
      />

      {/* Privacy Preview Modal */}
      <PrivacyPreviewModal
        isOpen={isPreviewOpen}
        prepared={preparedRequest}
        onConfirm={() => {
          if (preparedRequest) {
            executePreparedRequest(preparedRequest, preparedRequest.normalizedRequest.messages[preparedRequest.normalizedRequest.messages.length - 1].content);
          }
        }}
        onCancel={() => {
          setIsPreviewOpen(false);
          setGenerationState('idle');
        }}
      />

      {/* Clear History Confirmation Modal */}
      <Modal
        isOpen={isClearHistoryConfirmOpen}
        onClose={() => setIsClearHistoryConfirmOpen(false)}
        title="Clear AI Conversation History?"
      >
        <div className="space-y-4 text-xs text-[var(--text-primary)]">
          <p>Are you sure you want to clear all conversation history? This action cannot be undone.</p>
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-glass)]">
            <Button variant="ghost" size="md" onClick={() => setIsClearHistoryConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="md" disabled={isClearingHistory} onClick={handleClearHistory}>
              {isClearingHistory ? 'Clearing...' : 'Clear History'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
