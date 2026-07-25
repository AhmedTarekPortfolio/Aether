import Dexie, { type Table } from 'dexie';

export interface HarnessRecord {
  id: string;
  value: string;
}

export interface HarnessAuditRecord {
  id: string;
  recordId: string;
  action: string;
}

export interface UpgradeFixtureRecordV1 {
  id: string;
  label: string;
}

export interface UpgradeFixtureRecordV2 extends UpgradeFixtureRecordV1 {
  normalizedLabel: string;
}

/**
 * Minimal test-only database for exercising IndexedDB and Dexie behavior.
 * It is deliberately separate from AetherDatabase and is not an application schema.
 */
export class IndexedDbHarnessDatabase extends Dexie {
  records!: Table<HarnessRecord, string>;
  audit!: Table<HarnessAuditRecord, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      records: 'id, value',
      audit: 'id, recordId, action',
    });
  }
}

/** Test-only version-one fixture used solely to prepare deterministic upgrades. */
export class UpgradeFixtureDatabaseV1 extends Dexie {
  records!: Table<UpgradeFixtureRecordV1, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      records: 'id, label',
    });
  }
}

/** Test-only version-two fixture with a deterministic, side-effect-free upgrade. */
export class UpgradeFixtureDatabaseV2 extends Dexie {
  records!: Table<UpgradeFixtureRecordV2, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      records: 'id, label',
    });
    this.version(2)
      .stores({
        records: 'id, label, normalizedLabel',
      })
      .upgrade((transaction) =>
        transaction.table<UpgradeFixtureRecordV2, string>('records')
          .toCollection()
          .modify((record) => {
            record.normalizedLabel = record.label.trim().toLocaleLowerCase('en-US');
          }));
  }
}

const trackedConnections = new Map<string, Set<Dexie>>();
let uniqueDatabaseSequence = 0;
const productionDatabaseName = 'AetherPhase1DB';

export function assertTestDatabaseName(name: string): void {
  if (name === productionDatabaseName || !name.startsWith('AetherTest-')) {
    throw new Error(`Unsafe test database name: ${name}`);
  }
}

function trackConnection(database: Dexie): void {
  const connections = trackedConnections.get(database.name) ?? new Set<Dexie>();
  connections.add(database);
  trackedConnections.set(database.name, connections);
}

function untrackConnection(database: Dexie): void {
  const connections = trackedConnections.get(database.name);
  connections?.delete(database);
  if (connections?.size === 0) {
    trackedConnections.delete(database.name);
  }
}

export function createUniqueDatabaseName(scope = 'wp03'): string {
  uniqueDatabaseSequence += 1;
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, '-');
  const poolId = process.env.VITEST_POOL_ID ?? '0';
  return `AetherTest-${safeScope}-pool${poolId}-${uniqueDatabaseSequence}`;
}

export async function openTestDatabase<T extends Dexie>(database: T): Promise<T> {
  assertTestDatabaseName(database.name);
  await database.open();
  trackConnection(database);
  return database;
}

export async function createTestDatabase(
  name = createUniqueDatabaseName(),
): Promise<IndexedDbHarnessDatabase> {
  return openTestDatabase(new IndexedDbHarnessDatabase(name));
}

export function getOpenTestDatabaseConnectionCount(name?: string): number {
  const names = name ? [name] : [...trackedConnections.keys()];
  let openCount = 0;

  for (const trackedName of names) {
    const connections = trackedConnections.get(trackedName);
    if (!connections) continue;

    for (const database of [...connections]) {
      if (database.isOpen()) {
        openCount += 1;
      } else {
        untrackConnection(database);
      }
    }
  }

  return openCount;
}

export async function deleteTestDatabase(
  databaseOrName: Dexie | string,
): Promise<void> {
  const name = typeof databaseOrName === 'string'
    ? databaseOrName
    : databaseOrName.name;
  assertTestDatabaseName(name);
  const connections = new Set(trackedConnections.get(name));

  if (typeof databaseOrName !== 'string') {
    connections.add(databaseOrName);
  }

  for (const database of connections) {
    database.close();
    untrackConnection(database);
  }

  await Dexie.delete(name);

  if (await Dexie.exists(name)) {
    throw new Error(`Test database cleanup failed: ${name}`);
  }
}

export async function withTestDatabase<T>(
  callback: (database: IndexedDbHarnessDatabase) => Promise<T>,
  name = createUniqueDatabaseName(),
): Promise<T> {
  const database = new IndexedDbHarnessDatabase(name);
  try {
    await openTestDatabase(database);
    return await callback(database);
  } finally {
    await deleteTestDatabase(database);
  }
}
