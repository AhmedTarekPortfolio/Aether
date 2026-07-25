import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AetherDatabase, CANONICAL_ACHIEVEMENT_DEFINITIONS } from '../../db/database';
import {
  createUniqueDatabaseName,
  deleteTestDatabase,
  openTestDatabase,
} from '../../test/indexedDbHarness';
import {
  PERSISTENCE_TABLES,
  type AetherBackupDataV2,
  type AetherBackupV2,
} from '../../types';
import {
  buildBackupV2,
  createPreRestoreSafetyBackup,
  parseBackupJson,
  prepareReplaceRestore,
  readBackupSnapshot,
  replaceRestore,
  serializeBackupV2,
  validateBackupV2,
} from '../backupService';
import {
  digestNormalizedState,
  verifyDatabaseIntegrity,
} from '../integrityService';
import { createBackupSnapshotFixture } from '../../test/backupFixtures';
import { MemoryStorage } from './securityPerformanceTestSupport';

const cleanup = new Set<string>();

interface ArtifactFinding {
  category: string;
  location: string;
}

interface BenchmarkMeasurement {
  operation: string;
  durationMs: number;
}

interface BenchmarkResult {
  fixture: string;
  records: number;
  serializedBytes: number;
  runtime: {
    platform: string;
    node: string;
  };
  measurements: BenchmarkMeasurement[];
}

function auditArtifact(value: unknown): ArtifactFinding[] {
  const findings: ArtifactFinding[] = [];
  const visit = (current: unknown, location: string) => {
    if (typeof current === 'string') {
      const patterns: Array<[string, RegExp]> = [
        ['provider-api-key', /(?:^|[^a-z0-9])(?:sk|nvapi)-[a-z0-9_-]{20,}/i],
        ['bearer-token', /\bbearer\s+[a-z0-9._~+/=-]{24,}\b/i],
        ['jwt-access-token', /\beyJ[a-z0-9_-]{5,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{16,}\b/i],
        ['private-key-block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
        [
          'raw-error-stack',
          /\b(?:Error|[A-Za-z_$][\w$]*(?:Error|Exception|Failure)):.*?(?:\r?\n|\\r\\n|\\n)\s*at\s+/,
        ],
        [
          'filesystem-path',
          /(?:[A-Z]:(?:\\+|\/)|(?:^|[\s"'=])(?:\\{2,}|\/\/)[a-z0-9._-]+(?:\\+|\/)|file:\/\/\/[A-Z]:\/|\/(?:Users|home|tmp|var|etc|opt)\/)/i,
        ],
      ];
      for (const [category, pattern] of patterns) {
        if (pattern.test(current)) findings.push({ category, location });
      }
      return;
    }
    if (current === null || typeof current !== 'object') return;
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${location}[${index}]`));
      return;
    }
    for (const [key, nested] of Object.entries(current)) {
      const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if ([
        'apikey',
        'authorization',
        'authorizationheader',
        'accesstoken',
        'refreshtoken',
        'clientsecret',
        'secretkey',
        'password',
        'credential',
        'credentials',
        'encryptedcredential',
        'encryptedcredentials',
        'cookie',
        'setcookie',
        'sessionsecret',
        'providerrequestheaders',
        'providerpayload',
        'rawprovidererror',
        'errorstack',
        'credentialstorage',
      ].some((name) => normalized === name || normalized.endsWith(name))) {
        findings.push({ category: 'prohibited-field', location: `${location}.${key}` });
      }
      visit(nested, `${location}.${key}`);
    }
  };
  visit(value, '$');
  return findings;
}

function expectCleanArtifact(value: unknown): void {
  const categories = [...new Set(auditArtifact(value).map(({ category }) => category))];
  expect(categories, 'synthetic artifact contains prohibited categories').toEqual([]);
}

function scaledSnapshot(label: string, workspaceRecords: number): AetherBackupDataV2 {
  if (workspaceRecords === 0) {
    return Object.fromEntries(
      PERSISTENCE_TABLES.map((table) => [table, []]),
    ) as unknown as AetherBackupDataV2;
  }

  const snapshots = Array.from({ length: workspaceRecords }, (_, index) => (
    createBackupSnapshotFixture(`${label}-${index.toString().padStart(4, '0')}`)
  ));
  return {
    users: snapshots.flatMap(({ users }) => users),
    settings: snapshots.flatMap(({ settings }) => settings),
    subjects: snapshots.flatMap(({ subjects }) => subjects),
    topics: snapshots.flatMap(({ topics }) => topics),
    tasks: snapshots.flatMap(({ tasks }) => tasks),
    notes: snapshots.flatMap(({ notes }) => notes),
    flashcards: snapshots.flatMap(({ flashcards }) => flashcards),
    sessions: snapshots.flatMap(({ sessions }) => sessions),
    goals: snapshots.flatMap(({ goals }) => goals),
    ai_conversations: snapshots.flatMap(({ ai_conversations }) => ai_conversations),
    statistics: snapshots.flatMap(({ statistics }) => statistics),
    achievement_definitions: structuredClone(CANONICAL_ACHIEVEMENT_DEFINITIONS),
    user_achievements: snapshots.flatMap(({ user_achievements }) => user_achievements),
    notifications: snapshots.flatMap(({ notifications }) => notifications),
  };
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

async function measure(
  measurements: BenchmarkMeasurement[],
  operation: string,
  action: () => void | Promise<void>,
): Promise<void> {
  const started = performance.now();
  await action();
  const durationMs = performance.now() - started;
  expect(Number.isFinite(durationMs)).toBe(true);
  expect(durationMs).toBeGreaterThanOrEqual(0);
  measurements.push({ operation, durationMs: Number(durationMs.toFixed(3)) });
}

afterEach(async () => {
  localStorage.clear();
  for (const name of cleanup) await deleteTestDatabase(name);
  cleanup.clear();
});

describe('WP-09 backup security audit', () => {
  it('finds zero prohibited material in clean exports, AI records, settings, and safety output', async () => {
    const data = scaledSnapshot('clean-security', 2);
    data.notes[0].content = 'A token, key, and password are ordinary vocabulary in this academic note.';
    data.ai_conversations[0].response = 'Explain the key term and token-counting concept without credentials.';
    const backup = buildBackupV2(data, '2026-07-26T02:00:00.000Z');
    const json = serializeBackupV2(backup);
    validateBackupV2(parseBackupJson(json));
    expectCleanArtifact(backup);
    expectCleanArtifact(json);
    expectCleanArtifact(backup.data.ai_conversations);
    expectCleanArtifact(backup.data.settings);

    const testDb = await database('wp09-clean-safety');
    await seed(testDb, data);
    let delivered = '';
    await createPreRestoreSafetyBackup({
      runtime: 'browser',
      deliver: async (safetyJson) => {
        delivered = safetyJson;
        return true;
      },
    }, testDb);
    expectCleanArtifact(delivered);
    validateBackupV2(parseBackupJson(delivered));
  });

  it.each([
    ['OpenAI-style key', 'sk-synthetic000000000000000000000000'],
    ['NVIDIA key', 'nvapi-synthetic0000000000000000000000'],
    ['OpenRouter key', 'sk-or-v1-synthetic0000000000000000000000'],
    ['Bearer token', 'Bearer syntheticToken_012345678901234567890123'],
    ['JWT access token', 'eyJsynthetic.headerpart012345.payloadpart012345678901'],
    ['private key', '-----BEGIN PRIVATE KEY-----\nSYNTHETIC\n-----END PRIVATE KEY-----'],
  ])('production validation rejects an injected %s value without logging it', (_label, syntheticValue) => {
    const backup = buildBackupV2(scaledSnapshot('injected-value', 1));
    const injected = structuredClone(backup);
    injected.data.notes[0].content = syntheticValue;
    expect(() => validateBackupV2(injected)).toThrow(/prohibited/i);
  });

  it.each([
    'apiKey',
    'authorization',
    'accessToken',
    'refreshToken',
    'password',
    'credentials',
    'cookie',
    'sessionSecret',
    'providerRequestHeaders',
    'providerPayload',
    'rawProviderError',
    'errorStack',
    'credentialStorage',
  ])('detects an injected prohibited %s structure', (field) => {
    const backup = buildBackupV2(scaledSnapshot(`field-${field}`, 1));
    const injected = structuredClone(backup) as AetherBackupV2 & Record<string, unknown>;
    injected[field] = { synthetic: 'redacted-test-value' };
    const findings = auditArtifact(injected);
    expect(findings.map(({ category }) => category)).toContain('prohibited-field');
    expect(() => validateBackupV2(injected)).toThrow();
  });

  it.each([
    ['TypeError stack', 'TypeError: synthetic failure\n    at syntheticFunction (synthetic.ts:1:1)', 'raw-error-stack'],
    ['SyntaxError stack', 'SyntaxError: synthetic failure\n    at syntheticFunction (synthetic.ts:1:1)', 'raw-error-stack'],
    ['ReferenceError stack', 'ReferenceError: synthetic failure\n    at syntheticFunction (synthetic.ts:1:1)', 'raw-error-stack'],
    ['custom failure stack', 'ProviderTransportFailure: synthetic failure\n    at syntheticFunction (synthetic.ts:1:1)', 'raw-error-stack'],
    ['Windows user path', 'C:\\Users\\synthetic\\Aether\\backup.json', 'filesystem-path'],
    ['Windows arbitrary drive path', 'D:\\Aether\\backup.json', 'filesystem-path'],
    ['UNC path', '\\\\synthetic-server\\share\\backup.json', 'filesystem-path'],
    ['file URL', 'file:///C:/synthetic/Aether/backup.json', 'filesystem-path'],
    ['POSIX home path', '/home/synthetic/aether/backup.json', 'filesystem-path'],
    ['POSIX temporary path', '/tmp/aether/backup.json', 'filesystem-path'],
    ['POSIX variable-data path', '/var/lib/aether/backup.json', 'filesystem-path'],
  ])('detects injected %s metadata in serialized artifacts', (_label, value, category) => {
    const data = scaledSnapshot('artifact-metadata', 1);
    data.ai_conversations[0].response = value;
    const findings = auditArtifact(JSON.stringify(buildBackupV2(data)));
    expect(findings.map((finding) => finding.category)).toContain(category);
  });
});

describe('WP-09 synthetic performance characterization', () => {
  it.each([
    ['empty', 0],
    ['small', 2],
    ['medium', 25],
    ['large', 150],
  ])('records functional production-operation measurements for the %s fixture', async (fixture, scale) => {
    const data = scaledSnapshot(`benchmark-${fixture}`, scale);
    const measurements: BenchmarkMeasurement[] = [];
    let backup!: AetherBackupV2;
    let serialized = '';
    let stateDigest = '';

    await measure(measurements, 'validation-secret-scan-relationships', () => {
      backup = buildBackupV2(data, '2026-07-26T03:00:00.000Z');
    });
    await measure(measurements, 'serialization', () => {
      serialized = serializeBackupV2(backup);
    });
    await measure(measurements, 'parse-and-validation', () => {
      validateBackupV2(parseBackupJson(serialized));
    });
    await measure(measurements, 'normalized-state-sha256', async () => {
      stateDigest = await digestNormalizedState(data);
    });
    expect(stateDigest).toMatch(/^[a-f0-9]{64}$/);

    const sourceDb = await database(`wp09-source-${fixture}`);
    await seed(sourceDb, data);
    await measure(measurements, 'backup-collection', async () => {
      expect(await readBackupSnapshot(sourceDb)).toEqual(data);
    });

    const targetDb = await database(`wp09-target-${fixture}`);
    const safetyData = scaledSnapshot(`safety-${fixture}`, 1);
    await seed(targetDb, safetyData);
    const prepared = prepareReplaceRestore(backup);
    const safety = await createPreRestoreSafetyBackup({
      runtime: 'browser',
      deliver: vi.fn().mockResolvedValue(true),
    }, targetDb);
    const markerStorage = new MemoryStorage();
    await measure(measurements, 'replacement-restore-and-post-commit-verification', async () => {
      await replaceRestore(prepared, {
        database: targetDb,
        safetyReceipt: safety,
        confirmed: true,
        markerStorage,
        refresh: async (snapshot) => {
          expect(snapshot).toEqual(await readBackupSnapshot(targetDb));
        },
      });
    });
    await measure(measurements, 'post-restore-integrity-verification', async () => {
      await verifyDatabaseIntegrity(targetDb, {
        expectedPostRestoreCounts: prepared.expectedPostRestoreCounts,
        expectedStateDigest: stateDigest,
      });
    });

    const result: BenchmarkResult = {
      fixture,
      records: PERSISTENCE_TABLES.reduce((total, table) => total + data[table].length, 0),
      serializedBytes: new TextEncoder().encode(serialized).byteLength,
      runtime: {
        platform: process.platform,
        node: process.version,
      },
      measurements,
    };
    expect(result.records).toBeGreaterThanOrEqual(0);
    expect(result.serializedBytes).toBeGreaterThan(0);
    expect(result.measurements.map(({ operation }) => operation)).toEqual([
      'validation-secret-scan-relationships',
      'serialization',
      'parse-and-validation',
      'normalized-state-sha256',
      'backup-collection',
      'replacement-restore-and-post-commit-verification',
      'post-restore-integrity-verification',
    ]);
    console.info(`[WP09_BENCHMARK] ${JSON.stringify(result)}`);
  }, 120_000);
});
