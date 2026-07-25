import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../App';
import { db, CANONICAL_ACHIEVEMENT_DEFINITIONS } from '../../db/database';
import { createBackupSnapshotFixture } from '../../test/backupFixtures';
import { PERSISTENCE_TABLES, type AetherBackupDataV2 } from '../../types';
import { buildBackupV2 } from '../backupService';
import { digestIncomingBackup, digestNormalizedState } from '../integrityService';
import {
  RESTORE_VERIFICATION_STORAGE_KEY,
  buildRestoreVerificationMarker,
  parseRestoreVerificationMarker,
  writeRestoreVerificationMarker,
} from '../restoreVerificationState';

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

function applicationSnapshot(): AetherBackupDataV2 {
  const data = createBackupSnapshotFixture('rendered-recovery');
  data.users[0].id = 'default_user';
  data.users[0].name = 'Recovered Learner';
  data.users[0].email = 'recovered@example.test';
  data.settings[0].id = 'default_settings';
  data.settings[0].userId = 'default_user';
  data.subjects[0].userId = 'default_user';
  data.tasks[0].userId = 'default_user';
  data.notes[0].userId = 'default_user';
  data.flashcards[0].userId = 'default_user';
  data.sessions[0].userId = 'default_user';
  data.goals[0].userId = 'default_user';
  data.ai_conversations[0].userId = 'default_user';
  data.statistics[0].userId = 'default_user';
  data.user_achievements[0].userId = 'default_user';
  data.notifications[0].userId = 'default_user';
  return data;
}

async function seed(data: AetherBackupDataV2): Promise<void> {
  await db.open();
  await db.transaction('rw', PERSISTENCE_TABLES.map((table) => db.table(table)), async () => {
    for (const table of PERSISTENCE_TABLES) {
      await db.table(table).clear();
      if (data[table].length > 0) await db.table(table).bulkAdd(data[table]);
    }
  });
}

async function pendingMarker(data: AetherBackupDataV2) {
  const backup = buildBackupV2(data, '2026-07-26T01:00:00.000Z');
  return buildRestoreVerificationMarker({
    runtime: 'browser',
    expectedPostRestoreCounts: {
      ...backup.recordCounts,
      achievement_definitions: CANONICAL_ACHIEVEMENT_DEFINITIONS.length,
    },
    incomingBackupDigest: await digestIncomingBackup(backup),
    expectedStateDigest: await digestNormalizedState(data),
    startedAt: '2026-07-26T01:00:01.000Z',
  });
}

afterEach(async () => {
  cleanup();
  localStorage.clear();
  db.close();
  await db.delete();
});

describe('WP-08 production startup and store hydration', () => {
  it('clears a valid marker only after rendered live-query stores show actual IndexedDB data', async () => {
    const data = applicationSnapshot();
    await seed(data);
    writeRestoreVerificationMarker(await pendingMarker(data));

    render(<StrictMode><MemoryRouter><App /></MemoryRouter></StrictMode>);
    expect(screen.getByRole('status')).toHaveTextContent(/verifying local data/i);

    expect(await screen.findByText('Recovered Learner')).toBeInTheDocument();
    await waitFor(() => {
      expect(localStorage.getItem(RESTORE_VERIFICATION_STORAGE_KEY)).toBeNull();
    });
    expect(screen.queryByLabelText(/restore verification warning/i)).not.toBeInTheDocument();
  });

  it('keeps a persistent warning when rendered startup verification fails', async () => {
    const data = applicationSnapshot();
    await seed(data);
    const marker = await pendingMarker(data);
    marker.expectedStateDigest = '0'.repeat(64);
    writeRestoreVerificationMarker(marker);

    render(<StrictMode><MemoryRouter><App /></MemoryRouter></StrictMode>);

    expect(await screen.findByLabelText(/restore verification warning/i)).toBeInTheDocument();
    expect(await db.users.get('default_user')).toMatchObject({ name: 'Recovered Learner' });
    const stored = localStorage.getItem(RESTORE_VERIFICATION_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(parseRestoreVerificationMarker(stored!)).toMatchObject({ state: 'verification-failed' });
  });

  it('surfaces malformed state without seeding or mutating the database', async () => {
    const data = applicationSnapshot();
    await seed(data);
    localStorage.setItem(RESTORE_VERIFICATION_STORAGE_KEY, '{"state":"unsupported"}');

    render(<StrictMode><MemoryRouter><App /></MemoryRouter></StrictMode>);

    expect(await screen.findByText(/marker is malformed/i)).toBeInTheDocument();
    expect(await db.users.get('default_user')).toMatchObject({ name: 'Recovered Learner' });
    expect(localStorage.getItem(RESTORE_VERIFICATION_STORAGE_KEY))
      .toBe('{"state":"unsupported"}');
  });
});
