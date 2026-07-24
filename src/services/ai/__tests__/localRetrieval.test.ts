import { describe, it, expect, vi } from 'vitest';
import { performLocalRetrieval } from '../localRetrieval';
import * as noteApi from '../../../api/noteApi';
import * as subjectApi from '../../../api/subjectApi';

describe('Local Resource Retrieval (FocusForge Architecture - src/services/ai/localRetrieval.ts)', () => {
  it('extracts matching study notes offline and formats source identifiers', async () => {
    vi.spyOn(noteApi, 'getNotes').mockResolvedValueOnce([
      { id: 'note_1', userId: 'u1', subjectId: 'subj_1', title: 'Cell Biology Notes', content: 'Mitochondria is the powerhouse of the cell.', tags: [], updatedAt: Date.now() },
      { id: 'note_2', userId: 'u1', subjectId: 'subj_1', title: 'Calculus Derivatives', content: 'Derivative of x^2 is 2x.', tags: [], updatedAt: Date.now() },
    ]);

    vi.spyOn(subjectApi, 'getSubjects').mockResolvedValueOnce([
      { id: 'subj_1', userId: 'u1', name: 'Biology', confidenceRating: 4, color: '#4F46E5', createdAt: Date.now() },
    ]);

    const excerpts = await performLocalRetrieval('mitochondria powerhouse');
    expect(excerpts).toHaveLength(1);
    expect(excerpts[0].sourceId).toBe('R1');
    expect(excerpts[0].title).toBe('Cell Biology Notes');
    expect(excerpts[0].excerpt).toContain('Mitochondria is the powerhouse');
  });
});
