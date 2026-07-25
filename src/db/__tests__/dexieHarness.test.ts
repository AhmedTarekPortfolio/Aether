import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { AetherDatabase } from '../database';
import {
  UpgradeFixtureDatabaseV1,
  UpgradeFixtureDatabaseV2,
  createTestDatabase,
  createUniqueDatabaseName,
  deleteTestDatabase,
  getOpenTestDatabaseConnectionCount,
  openTestDatabase,
  withTestDatabase,
} from '../../test/indexedDbHarness';

const databasesToClean = new Set<string>();

function uniqueName(scope: string): string {
  const name = createUniqueDatabaseName(scope);
  databasesToClean.add(name);
  return name;
}

afterEach(async () => {
  try {
    await Promise.all([...databasesToClean].map((name) => deleteTestDatabase(name)));
  } finally {
    databasesToClean.clear();
  }
});

describe('real IndexedDB and Dexie test harness', () => {
  it('creates and opens a real isolated IndexedDB database', async () => {
    const name = uniqueName('open');
    const database = await createTestDatabase(name);

    expect(database.isOpen()).toBe(true);
    expect(database.verno).toBe(1);
    expect(await Dexie.exists(name)).toBe(true);
  });

  it('writes and reads records through Dexie', async () => {
    const database = await createTestDatabase(uniqueName('read-write'));

    await database.records.add({ id: 'record-1', value: 'persisted' });

    await expect(database.records.get('record-1')).resolves.toEqual({
      id: 'record-1',
      value: 'persisted',
    });
  });

  it('commits every write in a successful multi-table transaction', async () => {
    const database = await createTestDatabase(uniqueName('commit'));

    await database.transaction('rw', database.records, database.audit, async () => {
      await database.records.add({ id: 'record-1', value: 'committed' });
      await database.audit.add({
        id: 'audit-1',
        recordId: 'record-1',
        action: 'created',
      });
    });

    expect(await database.records.count()).toBe(1);
    expect(await database.audit.count()).toBe(1);
  });

  it('rolls back every write when a transaction fails', async () => {
    const database = await createTestDatabase(uniqueName('rollback'));

    await expect(database.transaction(
      'rw',
      database.records,
      database.audit,
      async () => {
        await database.records.add({ id: 'record-1', value: 'rolled-back' });
        await database.audit.add({
          id: 'audit-1',
          recordId: 'record-1',
          action: 'created',
        });
        throw new Error('intentional rollback');
      },
    )).rejects.toThrow('intentional rollback');

    expect(await database.records.count()).toBe(0);
    expect(await database.audit.count()).toBe(0);
  });

  it('keeps independently created test databases isolated', async () => {
    const first = await createTestDatabase(uniqueName('isolation-first'));
    const second = await createTestDatabase(uniqueName('isolation-second'));

    await first.records.add({ id: 'record-1', value: 'first-only' });

    expect(await first.records.count()).toBe(1);
    expect(await second.records.count()).toBe(0);
    expect(first.name).not.toBe(second.name);
  });

  it('deletes a test database completely during cleanup', async () => {
    const name = uniqueName('delete');
    const database = await createTestDatabase(name);
    await database.records.add({ id: 'record-1', value: 'temporary' });

    await deleteTestDatabase(database);

    expect(database.isOpen()).toBe(false);
    expect(await Dexie.exists(name)).toBe(false);
    expect(getOpenTestDatabaseConnectionCount(name)).toBe(0);
  });

  it('reopens a cleaned database without exposing prior state', async () => {
    const name = uniqueName('reopen-clean');
    const original = await createTestDatabase(name);
    await original.records.add({ id: 'record-1', value: 'must-disappear' });
    await deleteTestDatabase(original);

    const reopened = await createTestDatabase(name);

    expect(await reopened.records.toArray()).toEqual([]);
  });

  it('cleans up connections and data when a test callback fails', async () => {
    const name = uniqueName('callback-failure');
    let observedDatabase: Dexie | undefined;

    await expect(withTestDatabase(async (database) => {
      observedDatabase = database;
      await database.records.add({ id: 'record-1', value: 'temporary' });
      throw new Error('simulated test failure');
    }, name)).rejects.toThrow('simulated test failure');

    expect(observedDatabase?.isOpen()).toBe(false);
    expect(getOpenTestDatabaseConnectionCount(name)).toBe(0);
    expect(await Dexie.exists(name)).toBe(false);
  });

  it('performs the test-only version upgrade deterministically', async () => {
    async function runUpgrade(name: string) {
      const versionOne = await openTestDatabase(new UpgradeFixtureDatabaseV1(name));
      await versionOne.records.bulkAdd([
        { id: 'record-2', label: '  PHYSICS ' },
        { id: 'record-1', label: 'Algorithms' },
      ]);
      versionOne.close();

      const versionTwo = await openTestDatabase(new UpgradeFixtureDatabaseV2(name));
      const records = await versionTwo.records.orderBy('id').toArray();
      versionTwo.close();
      return records;
    }

    const first = await runUpgrade(uniqueName('upgrade-first'));
    const second = await runUpgrade(uniqueName('upgrade-second'));

    expect(first).toEqual([
      { id: 'record-1', label: 'Algorithms', normalizedLabel: 'algorithms' },
      { id: 'record-2', label: '  PHYSICS ', normalizedLabel: 'physics' },
    ]);
    expect(second).toEqual(first);
  });

  it('opens the existing Aether production schema at version 3 and cleans it up', async () => {
    const name = 'AetherPhase1DB';
    databasesToClean.add(name);
    await deleteTestDatabase(name);
    const database = new AetherDatabase();

    await openTestDatabase(database);

    expect(database.verno).toBe(3);
    expect(database.tables).toHaveLength(14);
    await deleteTestDatabase(database);
    expect(getOpenTestDatabaseConnectionCount(name)).toBe(0);
  });
});
