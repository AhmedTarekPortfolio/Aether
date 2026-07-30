import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/Toast';
import { PrivacyPreviewModal } from '../../components/ai/PrivacyPreviewModal';
import { aiOrchestrator } from '../../services/ai';
import type { PreparedAIRequest } from '../../services/ai';
import { AIAssistantView } from '../AIAssistantView';

const subjects = [
  { id: 's1', userId: 'u1', name: 'Biology', color: '#fff', confidenceRating: 0, createdAt: 1 },
  { id: 's2', userId: 'u1', name: 'Physics', color: '#fff', confidenceRating: 0, createdAt: 1 },
];
const notes = [
  { id: 'n1', userId: 'u1', subjectId: 's1', title: 'Cells', content: 'ATP evidence', tags: [], updatedAt: 1 },
  { id: 'n2', userId: 'u1', subjectId: 's2', title: 'Waves', content: 'Wave evidence', tags: [], updatedAt: 1 },
];

function renderAssistant() {
  return render(<ToastProvider><AIAssistantView
    aiChats={[]}
    subjects={subjects}
    notes={notes}
    userProfile={{ id: 'u1', name: 'User', academicLevel: 'UG', studyGoalHoursWeekly: 5, theme: 'dark', soundEnabled: false }}
    onClearChats={vi.fn()}
  /></ToastProvider>);
}

describe('WP-02 Ask Resources UI', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('selects notes, removes them, and clears invalid selections on subject change', () => {
    renderAssistant();
    fireEvent.click(screen.getByRole('button', { name: /Ask Resources/i }));
    const cells = screen.getByRole('checkbox', { name: 'Cells' });
    fireEvent.click(cells);
    expect(cells).toBeChecked();
    expect(screen.getByRole('button', { name: /Cells ×/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Grounding subject'), { target: { value: 's2' } });
    expect(screen.queryByRole('button', { name: /Cells ×/i })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Waves' })).not.toBeChecked();
  });

  it('validates missing selection and shows no-evidence without duplicate writes', async () => {
    const prepare = vi.spyOn(aiOrchestrator, 'prepare');
    const persist = vi.spyOn(aiOrchestrator, 'persistLocalOnlyResult').mockResolvedValue(null);
    renderAssistant();
    fireEvent.click(screen.getByRole('button', { name: /Ask Resources/i }));
    fireEvent.change(screen.getByPlaceholderText(/Ask Aether AI/), { target: { value: 'Question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Select at least one resource')).toBeInTheDocument();
    expect(prepare).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Cells' }));
    prepare.mockResolvedValueOnce({
      type: 'local_only_result', requestId: 'r1', userId: 'u1', subjectId: 's1',
      prompt: 'Question', mode: 'ask_resources', excerpts: [], message: 'Insufficient evidence',
      isNoEvidenceWarning: true, outcome: 'no-evidence',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/do not contain enough evidence/i)).toBeInTheDocument();
    expect(persist).toHaveBeenCalledOnce();
  });

  it('privacy preview displays the exact prepared excerpt and payload metadata', () => {
    const prepared: PreparedAIRequest = {
      type: 'prepared_request', requestId: 'r1', userId: 'u1',
      normalizedRequest: { model: 'm1', messages: [{ role: 'user', content: 'Q' }], systemInstruction: 'payload' },
      profileConfig: { id: 'p1', name: 'Remote', type: 'openai_compatible', modelId: 'm1', temperature: 0, rememberApiKey: false, createdAt: 1, updatedAt: 1 },
      preview: {
        providerId: 'p1', providerName: 'Remote', modelId: 'm1', mode: 'ask_resources',
        historyMessageCount: 0, estimatedInputChars: 99, privacyMode: 'ask_before_sending',
        attachedResources: [{
          id: 'n1', evidenceType: 'note', label: 'R1', noteId: 'n1',
          importedSourceId: null, sourceVersionId: null, segmentId: null,
          subjectId: 's1', title: 'Cells', locator: 'Note',
          excerpt: 'Exact truncated excerpt', excerptHash: 'a'.repeat(64),
          contentHash: 'b'.repeat(64), score: 6, order: 1,
        }],
      },
      requiresConfirmation: true,
    };
    render(<PrivacyPreviewModal isOpen prepared={prepared} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Remote')).toBeInTheDocument();
    expect(screen.getByText('m1')).toBeInTheDocument();
    expect(screen.getByText('Exact truncated excerpt')).toBeInTheDocument();
    expect(screen.getByText(/~99 characters/)).toBeInTheDocument();
  });
});
