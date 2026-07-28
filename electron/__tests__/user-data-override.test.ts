import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveUserDataOverride } from '../security/user-data-override';

describe('packaged user-data profile override', () => {
  it('accepts one explicit absolute standard Electron profile argument', () => {
    const absolute = path.resolve('C:\\Aether-Isolated-Profile');
    expect(resolveUserDataOverride([
      'Aether.exe',
      `--user-data-dir=${absolute}`,
    ])).toBe(absolute);
  });

  it.each([
    [[]],
    [['Aether.exe']],
    [['Aether.exe', '--user-data-dir=']],
    [['Aether.exe', '--user-data-dir=relative-profile']],
    [['Aether.exe', '--user-data-dir=C:\\unsafe\0profile']],
  ])('rejects absent, empty, relative, or NUL-containing values', (argv) => {
    expect(resolveUserDataOverride(argv)).toBeNull();
  });
});
