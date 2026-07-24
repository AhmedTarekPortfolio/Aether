import { getNotes } from '../../api/noteApi';
import { getSubjects } from '../../api/subjectApi';
import { PreparedResourceExcerpt } from './types';

/**
 * Perform local lexical search over notes and study resources.
 * Works 100% offline without contacting external AI providers.
 */
export async function performLocalRetrieval(
  query: string,
  selectedResourceIds?: string[]
): Promise<PreparedResourceExcerpt[]> {
  const notes = await getNotes().catch(() => []);
  const subjects = await getSubjects().catch(() => []);

  const excerpts: PreparedResourceExcerpt[] = [];
  const queryTokens = query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 2);

  let sourceIndex = 1;

  // Filter notes by explicitly selected resource IDs if specified
  const targetNotes = selectedResourceIds && selectedResourceIds.length > 0
    ? notes.filter((n) => selectedResourceIds.includes(n.id) || (n.subjectId && selectedResourceIds.includes(n.subjectId)))
    : notes;

  for (const note of targetNotes) {
    const subject = subjects.find((s) => s.id === note.subjectId);
    const fullText = `${note.title || ''}\n${note.content || ''}`;
    const lowerText = fullText.toLowerCase();

    // Calculate term frequency match score
    let score = 0;
    for (const token of queryTokens) {
      if (lowerText.includes(token)) {
        score += 1;
      }
    }

    // Include if explicit selection OR term match > 0
    if (selectedResourceIds?.includes(note.id) || score > 0 || queryTokens.length === 0) {
      const excerptLength = 300;
      const snippet = note.content ? note.content.slice(0, excerptLength) : note.title;

      excerpts.push({
        id: note.id,
        sourceId: `R${sourceIndex++}`,
        title: note.title || 'Untitled Note',
        section: subject ? subject.name : undefined,
        excerpt: snippet,
      });
    }
  }

  return excerpts;
}
