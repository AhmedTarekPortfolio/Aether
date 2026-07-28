import fs from 'node:fs/promises';
import path from 'node:path';
import { SourceStorageError } from './source-storage-errors.js';

export const MANAGED_SOURCE_DIRECTORIES = [
  'assets',
  'staging',
  'derived',
  'quarantine',
  'trash',
] as const;

export type ManagedSourceDirectory = (typeof MANAGED_SOURCE_DIRECTORIES)[number];

export interface ManagedSourcePaths {
  root: string;
  assets: string;
  staging: string;
  derived: string;
  quarantine: string;
  trash: string;
}

function isContained(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative !== ''
    && !relative.startsWith(`..${path.sep}`)
    && relative !== '..'
    && !path.isAbsolute(relative);
}

async function rejectLink(pathname: string): Promise<void> {
  try {
    const stat = await fs.lstat(pathname);
    if (stat.isSymbolicLink()) throw new SourceStorageError('SOURCE_STORAGE_UNAVAILABLE');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function createManagedSourcePaths(userDataPath: string): Promise<ManagedSourcePaths> {
  if (!path.isAbsolute(userDataPath) || userDataPath.includes('\0')) {
    throw new SourceStorageError('SOURCE_STORAGE_UNAVAILABLE');
  }
  const resolvedUserData = path.resolve(userDataPath);
  const root = path.resolve(resolvedUserData, 'sources');
  if (!isContained(resolvedUserData, root)) {
    throw new SourceStorageError('SOURCE_STORAGE_UNAVAILABLE');
  }

  await rejectLink(resolvedUserData);
  await rejectLink(root);
  await fs.mkdir(root, { recursive: true });

  const realUserData = await fs.realpath(resolvedUserData);
  const realRoot = await fs.realpath(root);
  if (!isContained(realUserData, realRoot)) {
    throw new SourceStorageError('SOURCE_STORAGE_UNAVAILABLE');
  }

  const entries = Object.fromEntries(
    MANAGED_SOURCE_DIRECTORIES.map((name) => [name, path.join(realRoot, name)]),
  ) as Record<ManagedSourceDirectory, string>;

  for (const pathname of Object.values(entries)) {
    await rejectLink(pathname);
    await fs.mkdir(pathname, { recursive: true });
    const stat = await fs.lstat(pathname);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new SourceStorageError('SOURCE_STORAGE_UNAVAILABLE');
    }
    const realDirectory = await fs.realpath(pathname);
    if (!isContained(realRoot, realDirectory)) {
      throw new SourceStorageError('SOURCE_STORAGE_UNAVAILABLE');
    }
  }

  return { root: realRoot, ...entries };
}

export function validateManagedRelativePath(
  relativePath: string,
  expectedPrefix: ManagedSourceDirectory,
): void {
  const segments = relativePath.split('/');
  if (
    !relativePath
    || relativePath.includes('\0')
    || relativePath.includes('\\')
    || relativePath.includes(':')
    || relativePath.startsWith('/')
    || !relativePath.startsWith(`${expectedPrefix}/`)
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    || /^[a-zA-Z]:/.test(relativePath)
    || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(relativePath)
  ) {
    throw new SourceStorageError('INVALID_REQUEST');
  }
}

export function resolveManagedRelativePath(
  paths: ManagedSourcePaths,
  relativePath: string,
  expectedPrefix: ManagedSourceDirectory,
): string {
  validateManagedRelativePath(relativePath, expectedPrefix);
  const resolved = path.resolve(paths.root, ...relativePath.split('/'));
  const expectedRoot = paths[expectedPrefix];
  if (!isContained(expectedRoot, resolved)) {
    throw new SourceStorageError('INVALID_REQUEST');
  }
  return resolved;
}

export function assetRelativePath(contentHash: string, extension: string): string {
  if (!/^[a-f0-9]{64}$/.test(contentHash) || !/^[a-z0-9]+$/.test(extension)) {
    throw new SourceStorageError('INVALID_REQUEST');
  }
  return `assets/${contentHash.slice(0, 2)}/${contentHash}.${extension}`;
}
