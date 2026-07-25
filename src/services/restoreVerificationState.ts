import type { AetherDatabase } from '../db/database';
import {
  PERSISTENCE_TABLES,
  type AetherBackupRecordCounts,
  type RestoreRuntime,
  type RestoreVerificationMarkerV1,
} from '../types';
import {
  serializeCanonicalJson,
  verifyDatabaseIntegrity,
  type IntegrityVerificationResult,
} from './integrityService';

export const RESTORE_VERIFICATION_STORAGE_KEY = 'aether.restoreVerification.v1';
export const RESTORE_VERIFICATION_CHANGED_EVENT = 'aether-restore-verification-change';

export interface MarkerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type RestoreVerificationInspection =
  | { status: 'none' }
  | { status: 'pending'; marker: RestoreVerificationMarkerV1 }
  | { status: 'invalid' };

export interface VerifyPendingRestoreOptions {
  database: AetherDatabase;
  storage?: MarkerStorage;
  reopen?: (database: AetherDatabase) => Promise<void>;
  refresh: (snapshot: IntegrityVerificationResult['snapshot']) => void | Promise<void>;
}

export type PendingRestoreVerificationResult =
  | { status: 'none' }
  | { status: 'verified'; verification: IntegrityVerificationResult }
  | { status: 'failed' }
  | { status: 'invalid-marker' };

function defaultStorage(): MarkerStorage {
  if (typeof localStorage === 'undefined') {
    throw new Error('Restore verification storage is unavailable.');
  }
  return localStorage;
}

function notifyMarkerChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(RESTORE_VERIFICATION_CHANGED_EVENT));
  }
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isCounts(value: unknown): value is AetherBackupRecordCounts {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (
    keys.length !== PERSISTENCE_TABLES.length
    || keys.some((key) => !(PERSISTENCE_TABLES as readonly string[]).includes(key))
  ) return false;
  return PERSISTENCE_TABLES.every((table) => {
    const count = (value as Record<string, unknown>)[table];
    return Number.isInteger(count) && (count as number) >= 0;
  });
}

export function parseRestoreVerificationMarker(
  raw: string,
): RestoreVerificationMarkerV1 | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const marker = value as Record<string, unknown>;
  const expectedKeys = [
    'state',
    'runtime',
    'expectedPostRestoreCounts',
    'incomingBackupDigest',
    'expectedStateDigest',
    'startedAt',
  ];
  const keys = Object.keys(marker);
  if (
    keys.length !== expectedKeys.length
    || keys.some((key) => !expectedKeys.includes(key))
  ) return null;
  if (
    (marker.state !== 'transaction-started' && marker.state !== 'verification-failed')
    || (marker.runtime !== 'browser' && marker.runtime !== 'electron')
    || !isCounts(marker.expectedPostRestoreCounts)
    || !isDigest(marker.incomingBackupDigest)
    || !isDigest(marker.expectedStateDigest)
    || !isCanonicalTimestamp(marker.startedAt)
  ) return null;
  return value as RestoreVerificationMarkerV1;
}

export function inspectRestoreVerificationMarker(
  storage: MarkerStorage = defaultStorage(),
): RestoreVerificationInspection {
  let raw: string | null;
  try {
    raw = storage.getItem(RESTORE_VERIFICATION_STORAGE_KEY);
  } catch {
    return { status: 'invalid' };
  }
  if (raw === null) return { status: 'none' };
  const marker = parseRestoreVerificationMarker(raw);
  return marker ? { status: 'pending', marker } : { status: 'invalid' };
}

export function buildRestoreVerificationMarker(input: {
  state?: RestoreVerificationMarkerV1['state'];
  runtime: RestoreRuntime;
  expectedPostRestoreCounts: AetherBackupRecordCounts;
  incomingBackupDigest: string;
  expectedStateDigest: string;
  startedAt?: string;
}): RestoreVerificationMarkerV1 {
  const marker: RestoreVerificationMarkerV1 = {
    state: input.state ?? 'transaction-started',
    runtime: input.runtime,
    expectedPostRestoreCounts: { ...input.expectedPostRestoreCounts },
    incomingBackupDigest: input.incomingBackupDigest,
    expectedStateDigest: input.expectedStateDigest,
    startedAt: input.startedAt ?? new Date().toISOString(),
  };
  if (!parseRestoreVerificationMarker(serializeCanonicalJson(marker))) {
    throw new Error('Restore verification marker is invalid.');
  }
  return marker;
}

export function writeRestoreVerificationMarker(
  marker: RestoreVerificationMarkerV1,
  storage: MarkerStorage = defaultStorage(),
): void {
  const serialized = serializeCanonicalJson(marker);
  if (!parseRestoreVerificationMarker(serialized)) {
    throw new Error('Restore verification marker is invalid.');
  }
  storage.setItem(RESTORE_VERIFICATION_STORAGE_KEY, serialized);
  const readback = storage.getItem(RESTORE_VERIFICATION_STORAGE_KEY);
  if (readback === null || serializeCanonicalJson(JSON.parse(readback)) !== serialized) {
    throw new Error('Restore verification marker readback failed.');
  }
  notifyMarkerChanged();
}

export function markRestoreVerificationFailed(
  marker: RestoreVerificationMarkerV1,
  storage: MarkerStorage = defaultStorage(),
): RestoreVerificationMarkerV1 {
  const failed = { ...marker, state: 'verification-failed' as const };
  writeRestoreVerificationMarker(failed, storage);
  return failed;
}

export function clearRestoreVerificationMarker(
  storage: MarkerStorage = defaultStorage(),
): void {
  storage.removeItem(RESTORE_VERIFICATION_STORAGE_KEY);
  if (storage.getItem(RESTORE_VERIFICATION_STORAGE_KEY) !== null) {
    throw new Error('Restore verification marker could not be cleared.');
  }
  notifyMarkerChanged();
}

export async function reopenDatabase(database: AetherDatabase): Promise<void> {
  database.close();
  await database.open();
}

export async function verifyPendingRestore(
  options: VerifyPendingRestoreOptions,
): Promise<PendingRestoreVerificationResult> {
  const storage = options.storage ?? defaultStorage();
  const inspection = inspectRestoreVerificationMarker(storage);
  if (inspection.status === 'none') return { status: 'none' };
  if (inspection.status === 'invalid') return { status: 'invalid-marker' };

  try {
    await (options.reopen ?? reopenDatabase)(options.database);
    const verification = await verifyDatabaseIntegrity(options.database, inspection.marker);
    await options.refresh(verification.snapshot);
    clearRestoreVerificationMarker(storage);
    return { status: 'verified', verification };
  } catch {
    try {
      markRestoreVerificationFailed(inspection.marker, storage);
    } catch {
      // Preserve the original marker when even a sanitized state transition fails.
    }
    return { status: 'failed' };
  }
}
