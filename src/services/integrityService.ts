import { CANONICAL_ACHIEVEMENT_DEFINITIONS, type AetherDatabase } from '../db/database';
import {
  PERSISTENCE_TABLES,
  type AetherBackupDataV2,
  type AetherBackupRecordCounts,
  type AetherBackupV2,
} from '../types';
import {
  calculateBackupRecordCounts,
  readBackupSnapshot,
  validateBackupSnapshot,
  validateBackupV2,
} from './backupService';

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalize(value: unknown): CanonicalJson {
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'number'
    || typeof value === 'string'
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object') {
    throw new Error('Only JSON-compatible values can be canonicalized.');
  }

  const result: { [key: string]: CanonicalJson } = {};
  for (const key of Object.keys(value).sort(compareCodeUnits)) {
    const nested = (value as Record<string, unknown>)[key];
    if (nested !== undefined) result[key] = canonicalize(nested);
  }
  return result;
}

/**
 * Canonical JSON uses recursively code-unit-sorted object keys, preserves array
 * order, omits undefined object properties, and emits compact JSON.
 */
export function serializeCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export async function sha256Hex(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('SHA-256 is unavailable in this runtime.');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizePostRestoreState(
  snapshot: AetherBackupDataV2,
): AetherBackupDataV2 {
  validateBackupSnapshot(snapshot);
  const normalized = {} as AetherBackupDataV2;
  for (const table of PERSISTENCE_TABLES) {
    const source = table === 'achievement_definitions'
      ? CANONICAL_ACHIEVEMENT_DEFINITIONS
      : snapshot[table];
    normalized[table] = structuredClone(source)
      .sort((left, right) => compareCodeUnits(left.id, right.id)) as never;
  }
  return normalized;
}

export async function digestIncomingBackup(backup: AetherBackupV2): Promise<string> {
  validateBackupV2(backup);
  return sha256Hex(serializeCanonicalJson(backup));
}

export async function digestNormalizedState(snapshot: AetherBackupDataV2): Promise<string> {
  return sha256Hex(serializeCanonicalJson(normalizePostRestoreState(snapshot)));
}

export interface IntegrityExpectation {
  expectedPostRestoreCounts: AetherBackupRecordCounts;
  expectedStateDigest: string;
}

export interface IntegrityVerificationResult {
  snapshot: AetherBackupDataV2;
  counts: AetherBackupRecordCounts;
  stateDigest: string;
}

function countsMatch(
  actual: AetherBackupRecordCounts,
  expected: AetherBackupRecordCounts,
): boolean {
  return PERSISTENCE_TABLES.every((table) => actual[table] === expected[table]);
}

export async function verifyDatabaseIntegrity(
  database: AetherDatabase,
  expectation: IntegrityExpectation,
): Promise<IntegrityVerificationResult> {
  const snapshot = await readBackupSnapshot(database);
  validateBackupSnapshot(snapshot);
  const counts = calculateBackupRecordCounts(snapshot);
  if (!countsMatch(counts, expectation.expectedPostRestoreCounts)) {
    throw new Error('Post-restore table counts do not match the verification marker.');
  }
  const stateDigest = await digestNormalizedState(snapshot);
  if (stateDigest !== expectation.expectedStateDigest) {
    throw new Error('Post-restore content does not match the verification marker.');
  }
  return { snapshot, counts, stateDigest };
}
