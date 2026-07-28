import { AetherDatabase } from '../../../db/database';
import {
  createUniqueDatabaseName,
  deleteTestDatabase,
  openTestDatabase,
} from '../../../test/indexedDbHarness';

export async function createSourceTestDatabase(): Promise<AetherDatabase> {
  const database = await openTestDatabase(
    new AetherDatabase(createUniqueDatabaseName('wp-local-03')),
  );
  const now = 1_700_000_000_000;
  await database.users.bulkAdd([
    {
      id: 'user-a',
      name: 'User A',
      email: 'user-a@example.test',
      academicLevel: 'Test',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'user-b',
      name: 'User B',
      email: 'user-b@example.test',
      academicLevel: 'Test',
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await database.subjects.bulkAdd([
    {
      id: 'subject-a',
      userId: 'user-a',
      name: 'Physics',
      color: '#0000ff',
      confidenceRating: 50,
      createdAt: now,
    },
    {
      id: 'subject-b',
      userId: 'user-b',
      name: 'Private',
      color: '#ff0000',
      confidenceRating: 50,
      createdAt: now,
    },
  ]);
  await database.topics.bulkAdd([
    { id: 'topic-a', subjectId: 'subject-a', title: 'Motion', masteryLevel: 0 },
    { id: 'topic-b', subjectId: 'subject-b', title: 'Private topic', masteryLevel: 0 },
  ]);
  await database.tasks.bulkAdd([
    {
      id: 'task-a',
      userId: 'user-a',
      title: 'Study motion',
      subjectId: 'subject-a',
      priority: 'medium',
      estimatedMinutes: 30,
      completedMinutes: 0,
      status: 'todo',
      createdAt: now,
    },
    {
      id: 'task-b',
      userId: 'user-b',
      title: 'Private task',
      subjectId: 'subject-b',
      priority: 'medium',
      estimatedMinutes: 30,
      completedMinutes: 0,
      status: 'todo',
      createdAt: now,
    },
  ]);
  await database.notes.bulkAdd([
    {
      id: 'note-a',
      userId: 'user-a',
      subjectId: 'subject-a',
      topicId: 'topic-a',
      title: 'Motion note',
      content: '',
      tags: [],
      updatedAt: now,
    },
    {
      id: 'note-b',
      userId: 'user-b',
      subjectId: 'subject-b',
      title: 'Private note',
      content: '',
      tags: [],
      updatedAt: now,
    },
  ]);
  return database;
}

export async function deleteSourceTestDatabase(database: AetherDatabase): Promise<void> {
  await deleteTestDatabase(database);
}
