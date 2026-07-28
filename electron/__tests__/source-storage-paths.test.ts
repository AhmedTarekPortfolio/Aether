import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assetRelativePath,
  createManagedSourcePaths,
  MANAGED_SOURCE_DIRECTORIES,
  resolveManagedRelativePath,
  validateManagedRelativePath,
} from '../services/sources/source-storage-paths';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aether-source-paths-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => fs.rm(directory, { recursive: true, force: true }),
  ));
});

describe('managed source-storage paths', () => {
  it('creates the five managed directories idempotently under userData', async () => {
    const userData = await temporaryDirectory();
    const first = await createManagedSourcePaths(userData);
    const second = await createManagedSourcePaths(userData);

    expect(second).toEqual(first);
    for (const name of MANAGED_SOURCE_DIRECTORIES) {
      expect((await fs.lstat(first[name])).isDirectory()).toBe(true);
      expect(first[name].startsWith(first.root)).toBe(true);
    }
  });

  it('rejects unsafe root resolution and a symlinked managed root when supported', async () => {
    await expect(createManagedSourcePaths('relative/path')).rejects.toMatchObject({
      code: 'SOURCE_STORAGE_UNAVAILABLE',
    });

    const userData = await temporaryDirectory();
    const external = await temporaryDirectory();
    try {
      await fs.symlink(external, path.join(userData, 'sources'), 'junction');
    } catch {
      return;
    }
    await expect(createManagedSourcePaths(userData)).rejects.toMatchObject({
      code: 'SOURCE_STORAGE_UNAVAILABLE',
    });
  });

  it.each([
    '../assets/file.pdf',
    'assets/../../file.pdf',
    'C:\\file.pdf',
    '\\\\server\\share\\file.pdf',
    'file:///tmp/file.pdf',
    'assets\\ab\\file.pdf',
    '/assets/ab/file.pdf',
    'assets//ab/file.pdf',
    'assets/./ab/file.pdf',
    'assets/ab/../file.pdf',
    'assets/ab/file.pdf\0tail',
  ])('rejects unsafe managed path %s', (candidate) => {
    expect(() => validateManagedRelativePath(candidate, 'assets')).toThrow();
  });

  it('resolves only normalized forward-slash paths under the expected prefix', async () => {
    const paths = await createManagedSourcePaths(await temporaryDirectory());
    const hash = 'a'.repeat(64);
    const relative = assetRelativePath(hash, 'pdf');

    expect(relative).toBe(`assets/aa/${hash}.pdf`);
    expect(resolveManagedRelativePath(paths, relative, 'assets')).toBe(
      path.join(paths.assets, 'aa', `${hash}.pdf`),
    );
  });
});
