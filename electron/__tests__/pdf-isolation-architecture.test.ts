import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('WP-LOCAL-07 PDF isolation architecture', () => {
  it('pins the approved PDF.js version exactly', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies['pdfjs-dist']).toBe('4.10.38');
  });

  it('excludes evaluation and generated legacy packages from the production ASAR', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts.package).toContain('--ignore="^/evaluation"');
    expect(packageJson.scripts.package).toContain('--ignore="^/dist-win"');
    expect(packageJson.scripts.package).toContain('--ignore="^/dist-desktop"');
    expect(packageJson.scripts.package).toContain('--ignore="^/release"');
    expect(packageJson.scripts.dist).toContain('--ignore="^/evaluation"');
    expect(packageJson.scripts.dist).toContain('--ignore="^/dist-win"');
    expect(packageJson.scripts.dist).toContain('--ignore="^/dist-desktop"');
    expect(packageJson.scripts.dist).toContain('--ignore="^/release"');
  });

  it('keeps parsing in the utility entry point with eval disabled and no Dexie imports', () => {
    const host = read('electron/services/sources/pdf/pdf-parser-host.ts');
    const utility = read('electron/services/sources/pdf/pdf-parser-utility.ts');
    const parser = read('electron/services/sources/pdf/pdf-parser.ts');
    expect(host).toContain('utilityProcess');
    expect(host).toContain("'--max-old-space-size=384'");
    expect(utility).toContain('process.parentPort');
    expect(parser).toContain('isEvalSupported: false');
    expect(`${host}\n${utility}\n${parser}`).not.toMatch(/\bDexie\b|src\/db|credential-service|session\./);
  });

  it('exposes no absolute-path or generic filesystem capability in the renderer API', () => {
    const desktopApi = read('electron/types/desktop-api.ts');
    const pdfContracts = read('electron/types/pdf.ts');
    const rendererIpc = read('electron/types/ipc-contracts.ts');
    expect(desktopApi).not.toMatch(/\b(readFile|writeFile|listDirectory|absolutePath)\s*\(/);
    expect(rendererIpc).not.toContain('absolutePath:');
    expect(pdfContracts).toContain('assetRelativePath: string');
    const html = read('index.html');
    expect(html).toContain("connect-src 'self' http: https: ws: wss: aether-asset:");
    expect(html).toContain("object-src 'none'");
  });

  it('leaves Backup Version 2 contracts free of source tables', () => {
    const backup = read('src/types/backup.ts');
    const persistenceBlock = backup.slice(
      backup.indexOf('export const PERSISTENCE_TABLES'),
      backup.indexOf('] as const;', backup.indexOf('export const PERSISTENCE_TABLES')) + 11,
    );
    expect(persistenceBlock).not.toMatch(/study_sources|source_assets|source_versions|source_segments|source_chunks|source_jobs/);
    expect(backup).toContain('export const BACKUP_V2_DATABASE_SCHEMA_VERSION = 3 as const');
  });
});
