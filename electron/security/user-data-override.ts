import path from 'node:path';

const USER_DATA_ARGUMENT = '--user-data-dir=';

export function resolveUserDataOverride(argv: readonly string[]): string | null {
  const raw = argv.find((argument) => argument.startsWith(USER_DATA_ARGUMENT))
    ?.slice(USER_DATA_ARGUMENT.length);
  if (!raw || raw.includes('\0') || !path.isAbsolute(raw)) return null;
  return path.resolve(raw);
}
