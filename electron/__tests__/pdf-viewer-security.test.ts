import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  resolveVerifiedPdfAsset: vi.fn(),
}));

vi.mock('../services/sources/source-storage-provider', () => ({
  getSourceStorageService: () => ({
    resolveVerifiedPdfAsset: mocked.resolveVerifiedPdfAsset,
  }),
}));

import {
  parsePdfByteRange,
  PdfViewerService,
} from '../services/sources/pdf/pdf-viewer-service';

const hash = 'a'.repeat(64);
const grantRequest = {
  sourceVersionId: 'version-1',
  assetRelativePath: `assets/aa/${hash}.pdf`,
  contentHash: hash,
  byteSize: 20_000_000,
};
let temporaryDirectory: string | null = null;

beforeEach(() => {
  mocked.resolveVerifiedPdfAsset.mockReset();
  mocked.resolveVerifiedPdfAsset.mockResolvedValue({
    absolutePath: 'D:\\private\\sources\\managed.pdf',
    byteSize: grantRequest.byteSize,
    contentHash: hash,
  });
});

afterEach(async () => {
  if (temporaryDirectory) {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;
  }
});

describe('opaque PDF viewer protocol security', () => {
  it('issues only an opaque PDF URL and scopes revocation to its renderer sender', async () => {
    const service = new PdfViewerService(
      () => 1_000,
      () => Buffer.from('ab'.repeat(32), 'hex'),
    );
    const grant = await service.createGrant(7, grantRequest);
    expect(grant.url).toBe(`aether-asset://pdf/${'ab'.repeat(32)}`);
    expect(JSON.stringify(grant)).not.toContain('D:\\');
    expect(grant).not.toHaveProperty('contentHash');
    expect(service.revoke(8, grant.url)).toBe(false);
    expect(service.revoke(7, grant.url)).toBe(true);
    expect(service.revoke(7, grant.url)).toBe(false);
  });

  it('expires stale grants and rejects file URLs', async () => {
    let now = 1_000;
    const service = new PdfViewerService(
      () => now,
      () => Buffer.from('cd'.repeat(32), 'hex'),
    );
    const grant = await service.createGrant(7, grantRequest);
    now = grant.expiresAt;
    expect(service.revoke(7, grant.url)).toBe(false);
    expect(service.revoke(7, 'file:///D:/private/lesson.pdf')).toBe(false);
  });

  it('accepts one bounded byte range and rejects malformed or unsatisfiable ranges', () => {
    expect(parsePdfByteRange('bytes=100-199', 1_000, 128)).toEqual({
      start: 100,
      end: 199,
    });
    expect(parsePdfByteRange('bytes=100-', 1_000, 128)).toEqual({
      start: 100,
      end: 227,
    });
    expect(() => parsePdfByteRange('bytes=0-1,4-5', 1_000)).toThrow();
    expect(() => parsePdfByteRange('bytes=1000-1001', 1_000)).toThrow();
    expect(() => parsePdfByteRange('bytes=-20', 1_000)).toThrow();
  });

  it('serves only inert inline PDF content with no cache or MIME sniffing', async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'aether-pdf-viewer-'));
    const pathname = path.join(temporaryDirectory, 'managed.pdf');
    const bytes = Buffer.from('%PDF-1.7\nsafe test PDF');
    await fs.writeFile(pathname, bytes);
    mocked.resolveVerifiedPdfAsset.mockResolvedValue({
      absolutePath: pathname,
      byteSize: bytes.length,
      contentHash: hash,
    });
    const service = new PdfViewerService(
      () => 1_000,
      () => Buffer.from('ef'.repeat(32), 'hex'),
    );
    const grant = await service.createGrant(7, {
      ...grantRequest,
      byteSize: bytes.length,
    });
    const response = await service.handle(new Request(grant.url, { method: 'HEAD' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition'))
      .toBe('inline; filename="document.pdf"');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
