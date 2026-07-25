import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AetherDatabase, CANONICAL_ACHIEVEMENT_DEFINITIONS } from '../../db/database';
import {
  createUniqueDatabaseName,
  deleteTestDatabase,
  openTestDatabase,
} from '../../test/indexedDbHarness';
import { createBackupSnapshotFixture } from '../../test/backupFixtures';
import {
  PERSISTENCE_TABLES,
  RELATIONSHIP_CONTRACTS,
  type AetherBackupDataV2,
  type PersistenceTableName,
} from '../../types';
import {
  BackupValidationError,
  buildBackupV2,
  createPreRestoreSafetyBackup,
  prepareReplaceRestore,
  readBackupSnapshot,
  replaceRestore,
  validateBackupSnapshot,
  validateLegacyRelationships,
} from '../backupService';
import {
  digestIncomingBackup,
  digestNormalizedState,
  normalizePostRestoreState,
  serializeCanonicalJson,
} from '../integrityService';
import {
  RESTORE_VERIFICATION_STORAGE_KEY,
  buildRestoreVerificationMarker,
  inspectRestoreVerificationMarker,
  parseRestoreVerificationMarker,
  verifyPendingRestore,
  writeRestoreVerificationMarker,
  type MarkerStorage,
} from '../restoreVerificationState';

const cleanup = new Set<string>();

class MemoryStorage implements MarkerStorage {
  value: string | null = null;
  failSet = false;
  failReadAfterSet = false;
  private wasSet = false;

  getItem(): string | null {
    if (this.failReadAfterSet && this.wasSet) throw new Error('injected read failure');
    return this.value;
  }

  setItem(_key: string, value: string): void {
    if (this.failSet) throw new Error('injected write failure');
    this.value = value;
    this.wasSet = true;
  }

  removeItem(): void {
    this.value = null;
  }
}

async function database(label: string): Promise<AetherDatabase> {
  const metadata = new AetherDatabase();
  const stores = Object.fromEntries(metadata.tables.map((table) => [
    table.name,
    [table.schema.primKey.src, ...table.schema.indexes.map((index) => index.src)].join(', '),
  ]));
  const name = createUniqueDatabaseName(label);
  cleanup.add(name);
  const testDb = new Dexie(name);
  testDb.version(metadata.verno).stores(stores);
  await openTestDatabase(testDb);
  return testDb as unknown as AetherDatabase;
}

async function seed(database: AetherDatabase, data: AetherBackupDataV2): Promise<void> {
  await database.transaction('rw', PERSISTENCE_TABLES.map((table) => database.table(table)), async () => {
    for (const table of PERSISTENCE_TABLES) {
      if (data[table].length > 0) await database.table(table).bulkAdd(data[table]);
    }
  });
}

function mutableRecord(
  snapshot: AetherBackupDataV2,
  table: PersistenceTableName,
): Record<string, unknown> {
  return snapshot[table][0] as unknown as Record<string, unknown>;
}

async function markerFor(snapshot: AetherBackupDataV2) {
  const backup = buildBackupV2(snapshot, '2026-07-26T00:00:00.000Z');
  return buildRestoreVerificationMarker({
    runtime: 'browser',
    expectedPostRestoreCounts: {
      ...backup.recordCounts,
      achievement_definitions: CANONICAL_ACHIEVEMENT_DEFINITIONS.length,
    },
    incomingBackupDigest: await digestIncomingBackup(backup),
    expectedStateDigest: await digestNormalizedState(snapshot),
    startedAt: '2026-07-26T00:00:01.000Z',
  });
}

afterEach(async () => {
  localStorage.clear();
  for (const name of cleanup) await deleteTestDatabase(name);
  cleanup.clear();
});

describe('WP-08 relationship integrity', () => {
  it.each(RELATIONSHIP_CONTRACTS)(
    'accepts a valid parent and rejects dangling or empty $childTable.$childField',
    (relationship) => {
      const valid = createBackupSnapshotFixture(`valid-${relationship.childTable}-${String(relationship.childField)}`);
      expect(() => validateBackupSnapshot(valid)).not.toThrow();

      const dangling = structuredClone(valid);
      mutableRecord(dangling, relationship.childTable)[String(relationship.childField)] = 'missing-parent';
      expect(() => validateBackupSnapshot(dangling)).toThrow(/dangling/i);

      const empty = structuredClone(valid);
      mutableRecord(empty, relationship.childTable)[String(relationship.childField)] = '';
      expect(() => validateBackupSnapshot(empty)).toThrow(BackupValidationError);
      expect(mutableRecord(empty, relationship.childTable)[String(relationship.childField)]).toBe('');
    },
  );

  it.each(RELATIONSHIP_CONTRACTS.filter((relationship) => !relationship.required))(
    'preserves supported omitted/undefined absence for $childTable.$childField',
    (relationship) => {
      const omitted = createBackupSnapshotFixture(`omitted-${relationship.childTable}-${String(relationship.childField)}`);
      delete mutableRecord(omitted, relationship.childTable)[String(relationship.childField)];
      expect(() => validateBackupSnapshot(omitted)).not.toThrow();

      const undefinedValue = createBackupSnapshotFixture(`undefined-${relationship.childTable}-${String(relationship.childField)}`);
      mutableRecord(undefinedValue, relationship.childTable)[String(relationship.childField)] = undefined;
      expect(() => validateBackupSnapshot(undefinedValue)).not.toThrow();
    },
  );

  it.each(RELATIONSHIP_CONTRACTS)(
    'accepts only contractually supported null for $childTable.$childField',
    (relationship) => {
      const data = createBackupSnapshotFixture(`null-${relationship.childTable}-${String(relationship.childField)}`);
      mutableRecord(data, relationship.childTable)[String(relationship.childField)] = null;
      if (relationship.serializedAbsence === 'omitted-or-null') {
        expect(() => validateBackupSnapshot(data)).not.toThrow();
      } else {
        expect(() => validateBackupSnapshot(data)).toThrow(BackupValidationError);
      }
    },
  );

  it('uses incoming-only parents for V2 and the computed incoming-plus-current view for legacy', () => {
    const incoming = createBackupSnapshotFixture('incoming-only');
    incoming.users = [];
    expect(() => validateBackupSnapshot(incoming)).toThrow(/dangling/i);

    const legacy = createBackupSnapshotFixture('legacy-scope');
    const represented = Object.fromEntries(
      ['users', 'settings', 'subjects', 'topics', 'tasks', 'notes', 'flashcards', 'sessions']
        .map((table) => [table, structuredClone(legacy[table as PersistenceTableName])]),
    ) as Parameters<typeof validateLegacyRelationships>[0];
    const currentParent = represented.users[0];
    represented.users = [];
    expect(() => validateLegacyRelationships(represented)).toThrow(/dangling/i);
    represented.users = [currentParent];
    expect(() => validateLegacyRelationships(represented)).not.toThrow();
  });
});

describe('WP-08 canonical serialization and digests', () => {
  it('stabilizes table, record, and object-key ordering and represents all 14 tables', async () => {
    const first = createBackupSnapshotFixture('digest');
    first.users.push({ ...first.users[0], id: 'aaa-user', email: 'aaa@example.test' });
    const second = structuredClone(first);
    second.users.reverse();
    second.users = second.users.map((record) => JSON.parse(JSON.stringify({
      updatedAt: record.updatedAt,
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      academicLevel: record.academicLevel,
      email: record.email,
    })));
    expect(await digestNormalizedState(first)).toBe(await digestNormalizedState(second));
    const normalized = normalizePostRestoreState(first);
    expect(Object.keys(normalized)).toEqual(PERSISTENCE_TABLES);
    expect(normalized.users.map(({ id }) => id)).toEqual(['aaa-user', 'digest-user']);
    expect(normalized.achievement_definitions).toEqual(CANONICAL_ACHIEVEMENT_DEFINITIONS);
  });

  it('excludes envelope metadata from state digest but detects same-count content and relationship changes', async () => {
    const original = createBackupSnapshotFixture('content');
    const changed = structuredClone(original);
    changed.notes[0].content = 'Modified controlled fixture text.';
    expect(await digestNormalizedState(changed)).not.toBe(await digestNormalizedState(original));

    const relationshipChanged = structuredClone(original);
    relationshipChanged.tasks[0].subjectId = undefined;
    expect(await digestNormalizedState(relationshipChanged)).not.toBe(await digestNormalizedState(original));

    const backupA = buildBackupV2(original, '2026-07-26T00:00:00.000Z');
    const backupB = buildBackupV2(original, '2026-07-27T00:00:00.000Z');
    expect(await digestNormalizedState(backupA.data)).toBe(await digestNormalizedState(backupB.data));
    expect(await digestIncomingBackup(backupA)).not.toBe(await digestIncomingBackup(backupB));
  });

  it('uses recursively stable object keys', () => {
    expect(serializeCanonicalJson({ z: 1, a: { y: 2, b: 3 } }))
      .toBe('{"a":{"b":3,"y":2},"z":1}');
  });
});

describe('WP-08 marker validation and interlock', () => {
  it('round-trips both supported states without record content or paths', async () => {
    for (const state of ['transaction-started', 'verification-failed'] as const) {
      const marker = { ...(await markerFor(createBackupSnapshotFixture(state))), state };
      const storage = new MemoryStorage();
      writeRestoreVerificationMarker(marker, storage);
      expect(inspectRestoreVerificationMarker(storage)).toEqual({ status: 'pending', marker });
      expect(storage.value).not.toContain('Synthetic');
      expect(storage.value).not.toMatch(/[A-Z]:\\|filePath|prompt|response|Controlled fixture/i);
    }
  });

  it.each([
    ['malformed JSON', '{'],
    ['unsupported state', '{"state":"done"}'],
    ['missing count', null],
    ['invalid digest', null],
    ['invalid runtime', null],
    ['invalid timestamp', null],
    ['secret-looking extra field', null],
  ])('rejects %s marker data', async (label, supplied) => {
    const marker = await markerFor(createBackupSnapshotFixture(`invalid-${label.replace(/\s/g, '-')}`));
    let raw = supplied ?? JSON.stringify(marker);
    if (label === 'missing count') {
      const value = JSON.parse(raw); delete value.expectedPostRestoreCounts.users; raw = JSON.stringify(value);
    } else if (label === 'invalid digest') {
      const value = JSON.parse(raw); value.expectedStateDigest = 'bad'; raw = JSON.stringify(value);
    } else if (label === 'invalid runtime') {
      const value = JSON.parse(raw); value.runtime = 'server'; raw = JSON.stringify(value);
    } else if (label === 'invalid timestamp') {
      const value = JSON.parse(raw); value.startedAt = 'yesterday'; raw = JSON.stringify(value);
    } else if (label === 'secret-looking extra field') {
      const value = JSON.parse(raw); value.apiKey = 'not-stored'; raw = JSON.stringify(value);
    }
    expect(parseRestoreVerificationMarker(raw)).toBeNull();
  });

  it('fails closed on marker write and readback failures before any database mutation', async () => {
    for (const mode of ['write', 'read'] as const) {
      const testDb = await database(`marker-${mode}`);
      const before = createBackupSnapshotFixture(`before-${mode}`);
      await seed(testDb, before);
      const prepared = prepareReplaceRestore(buildBackupV2(createBackupSnapshotFixture(`after-${mode}`)));
      const safety = await createPreRestoreSafetyBackup({
        runtime: 'browser',
        deliver: vi.fn().mockResolvedValue(true),
      }, testDb);
      const storage = new MemoryStorage();
      if (mode === 'write') storage.failSet = true;
      else storage.failReadAfterSet = true;
      await expect(replaceRestore(prepared, {
        database: testDb,
        safetyReceipt: safety,
        confirmed: true,
        refresh: vi.fn(),
        markerStorage: storage,
      })).rejects.toThrow(/verification state/i);
      expect(await readBackupSnapshot(testDb)).toEqual(before);
    }
  });
});

describe('WP-08 restore, restart, and refresh verification', () => {
  it('writes the marker before the transaction and clears only after actual-data refresh', async () => {
    const testDb = await database('restore-success');
    await seed(testDb, createBackupSnapshotFixture('before-success'));
    const incoming = createBackupSnapshotFixture('after-success');
    const prepared = prepareReplaceRestore(buildBackupV2(incoming));
    const safety = await createPreRestoreSafetyBackup({
      runtime: 'browser',
      deliver: vi.fn().mockResolvedValue(true),
    }, testDb);
    const storage = new MemoryStorage();
    const events: string[] = [];
    await replaceRestore(prepared, {
      database: testDb,
      safetyReceipt: safety,
      confirmed: true,
      markerStorage: storage,
      hooks: {
        beforeClear: () => {
          events.push(`transaction:${inspectRestoreVerificationMarker(storage).status}`);
        },
        beforeStoreRefresh: () => {
          events.push(`refresh:${inspectRestoreVerificationMarker(storage).status}`);
        },
      },
      refresh: async (snapshot) => {
        expect(snapshot.users[0].id).toBe('after-success-user');
        expect((await readBackupSnapshot(testDb)).users[0].id).toBe('after-success-user');
        events.push('refreshed');
      },
    });
    expect(events[0]).toBe('transaction:pending');
    expect(events.at(-2)).toBe('refresh:pending');
    expect(events.at(-1)).toBe('refreshed');
    expect(inspectRestoreVerificationMarker(storage)).toEqual({ status: 'none' });
  });

  it('rolls back and retains transaction-started state on transaction failure', async () => {
    const testDb = await database('restore-rollback');
    const before = createBackupSnapshotFixture('before-rollback');
    await seed(testDb, before);
    const prepared = prepareReplaceRestore(buildBackupV2(createBackupSnapshotFixture('after-rollback')));
    const safety = await createPreRestoreSafetyBackup({
      runtime: 'browser',
      deliver: vi.fn().mockResolvedValue(true),
    }, testDb);
    const storage = new MemoryStorage();
    await expect(replaceRestore(prepared, {
      database: testDb,
      safetyReceipt: safety,
      confirmed: true,
      markerStorage: storage,
      refresh: vi.fn(),
      hooks: { beforeInsert: () => { throw new Error('injected'); } },
    })).rejects.toThrow(/rolled back/i);
    expect(await readBackupSnapshot(testDb)).toEqual(before);
    expect(inspectRestoreVerificationMarker(storage)).toMatchObject({
      status: 'pending',
      marker: { state: 'transaction-started' },
    });
  });

  it.each(['reopen', 'content', 'refresh'] as const)(
    'withholds success and persists verification-failed after %s failure',
    async (failure) => {
      const testDb = await database(`post-commit-${failure}`);
      await seed(testDb, createBackupSnapshotFixture(`before-${failure}`));
      const prepared = prepareReplaceRestore(buildBackupV2(createBackupSnapshotFixture(`after-${failure}`)));
      const safety = await createPreRestoreSafetyBackup({
        runtime: 'browser',
        deliver: vi.fn().mockResolvedValue(true),
      }, testDb);
      const storage = new MemoryStorage();
      await expect(replaceRestore(prepared, {
        database: testDb,
        safetyReceipt: safety,
        confirmed: true,
        markerStorage: storage,
        reopen: failure === 'reopen'
          ? async () => { throw new Error('injected'); }
          : async () => undefined,
        hooks: failure === 'content'
          ? {
            beforePostCommitVerification: async () => {
              await testDb.notes.update(`after-${failure}-note`, { content: 'changed after commit' });
            },
          }
          : undefined,
        refresh: failure === 'refresh'
          ? async () => { throw new Error('injected'); }
          : vi.fn(),
      })).rejects.toThrow(/unresolved/i);
      expect(inspectRestoreVerificationMarker(storage)).toMatchObject({
        status: 'pending',
        marker: { state: 'verification-failed' },
      });
    },
  );

  it('verifies a pending marker read-only across restart and clears it after refresh', async () => {
    const testDb = await database('restart-success');
    const data = createBackupSnapshotFixture('restart-success');
    await seed(testDb, data);
    const storage = new MemoryStorage();
    writeRestoreVerificationMarker(await markerFor(data), storage);
    const before = await readBackupSnapshot(testDb);
    const refresh = vi.fn();
    const result = await verifyPendingRestore({
      database: testDb,
      storage,
      reopen: async () => undefined,
      refresh,
    });
    expect(result.status).toBe('verified');
    expect(refresh).toHaveBeenCalledOnce();
    expect(await readBackupSnapshot(testDb)).toEqual(before);
    expect(inspectRestoreVerificationMarker(storage)).toEqual({ status: 'none' });
  });

  it('keeps warning state through repeated failed restart retries without mutation', async () => {
    const testDb = await database('restart-failure');
    const data = createBackupSnapshotFixture('restart-failure');
    await seed(testDb, data);
    const storage = new MemoryStorage();
    const marker = await markerFor(data);
    marker.expectedStateDigest = '0'.repeat(64);
    writeRestoreVerificationMarker(marker, storage);
    const before = await readBackupSnapshot(testDb);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect((await verifyPendingRestore({
        database: testDb,
        storage,
        reopen: async () => undefined,
        refresh: vi.fn(),
      })).status).toBe('failed');
      expect(await readBackupSnapshot(testDb)).toEqual(before);
      expect(inspectRestoreVerificationMarker(storage)).toMatchObject({
        status: 'pending',
        marker: { state: 'verification-failed' },
      });
    }
  });

  it('handles a malformed marker without opening or mutating the database', async () => {
    const testDb = await database('restart-malformed');
    const data = createBackupSnapshotFixture('restart-malformed');
    await seed(testDb, data);
    const storage = new MemoryStorage();
    storage.value = '{"state":"broken"}';
    const before = await readBackupSnapshot(testDb);
    const reopen = vi.fn();
    expect((await verifyPendingRestore({
      database: testDb,
      storage,
      reopen,
      refresh: vi.fn(),
    })).status).toBe('invalid-marker');
    expect(reopen).not.toHaveBeenCalled();
    expect(await readBackupSnapshot(testDb)).toEqual(before);
    expect(storage.value).toBe('{"state":"broken"}');
  });
});
