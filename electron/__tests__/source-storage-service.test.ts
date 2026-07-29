import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceStorageService } from '../services/sources/source-storage-service';
import type { SourceFileSelectionRequest } from '../types/source-storage';

const temporaryDirectories: string[] = [];
const defaultRequest: SourceFileSelectionRequest = {
  selectionMode: 'single',
  allowedKinds: ['any-supported'],
  maximumFileCount: 1,
};

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aether-source-service-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => fs.rm(directory, { recursive: true, force: true }),
  ));
});

async function writeFixture(
  directory: string,
  filename: string,
  content: string | Buffer,
): Promise<string> {
  const pathname = path.join(directory, filename);
  await fs.writeFile(pathname, content);
  return pathname;
}

function createService(
  userDataPath: string,
  filePaths: string[] = [],
  overrides: Partial<ConstructorParameters<typeof SourceStorageService>[0]> = {},
): SourceStorageService {
  return new SourceStorageService({
    userDataPath,
    dialog: {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: filePaths.length === 0,
        filePaths,
      }),
    },
    ...overrides,
  });
}

function assertNoAbsolutePaths(value: unknown, forbiddenRoot: string): void {
  expect(JSON.stringify(value)).not.toContain(forbiddenRoot);
}

describe('managed source storage service', () => {
  async function writeManagedAsset(
    userData: string,
    extension: 'txt' | 'md' | 'markdown' | 'pdf',
    content: Buffer,
  ) {
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const relativePath = `assets/${contentHash.slice(0, 2)}/${contentHash}.${extension}`;
    const pathname = path.join(userData, 'sources', ...relativePath.split('/'));
    await fs.mkdir(path.dirname(pathname), { recursive: true });
    await fs.writeFile(pathname, content);
    return { contentHash, relativePath };
  }

  it('handles native-dialog cancellation without creating a receipt', async () => {
    const userData = await temporaryDirectory();
    const service = createService(userData);
    await service.initialize();
    await expect(service.selectAndStage(null, defaultRequest)).resolves.toEqual({
      cancelled: true,
      receipts: [],
    });
  });

  it.each([
    ['notes.txt', Buffer.from('hello study')],
    ['notes.md', Buffer.from('# Study')],
    ['notes.markdown', Buffer.from('## Study')],
    ['paper.pdf', Buffer.from('%PDF-1.7\nbody')],
    ['image.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])],
    ['image.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1])],
    ['image.webp', Buffer.from('RIFF1234WEBPbody', 'ascii')],
  ])('streams, hashes, and stages supported %s files', async (filename, content) => {
    const userData = await temporaryDirectory();
    const selectedPath = await writeFixture(userData, filename, content);
    const service = createService(userData, [selectedPath]);
    await service.initialize();

    const result = await service.selectAndStage(null, defaultRequest);
    expect(result.cancelled).toBe(false);
    expect(result.receipts).toHaveLength(1);
    expect(result.receipts[0]).toMatchObject({
      byteSize: content.length,
      contentHash: crypto.createHash('sha256').update(content).digest('hex'),
      originalFilename: filename,
    });
    expect(result.receipts[0].stagingToken).toMatch(/^[a-f0-9]{64}$/);
    expect(result.receipts[0]).not.toHaveProperty('assetId');
    assertNoAbsolutePaths(result.receipts[0], userData);
  });

  it('supports bounded multiple selection and rejects excessive dialog results', async () => {
    const userData = await temporaryDirectory();
    const files = await Promise.all([
      writeFixture(userData, 'a.txt', 'a'),
      writeFixture(userData, 'b.txt', 'b'),
    ]);
    const service = createService(userData, files);
    await service.initialize();

    const multiple = {
      selectionMode: 'multiple',
      allowedKinds: ['text'],
      maximumFileCount: 2,
    } as const;
    expect((await service.selectAndStage(null, multiple)).receipts).toHaveLength(2);

    const excessive = createService(await temporaryDirectory(), files);
    await excessive.initialize();
    await expect(excessive.selectAndStage(null, {
      ...multiple,
      maximumFileCount: 1,
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it.each([
    ['txt' as const, 'text/plain', Buffer.from('\ufeffArabic عربي\r\nEnglish 😀', 'utf8')],
    ['md' as const, 'text/markdown', Buffer.from('# Heading\n\n<script>alert(1)</script>', 'utf8')],
    ['markdown' as const, 'text/markdown', Buffer.from('## Safe markdown', 'utf8')],
  ])('reads identity-checked managed %s assets without exposing paths', async (
    extension,
    mimeType,
    content,
  ) => {
    const userData = await temporaryDirectory();
    const service = createService(userData);
    await service.initialize();
    const identity = await writeManagedAsset(userData, extension, content);

    const receipt = await service.readTextAsset({
      relativePath: identity.relativePath,
      expectedContentHash: identity.contentHash,
    });
    expect(receipt).toEqual({
      text: new TextDecoder('utf-8', { fatal: true }).decode(content),
      contentHash: identity.contentHash,
      mimeType,
      extension,
      byteSize: content.byteLength,
    });
    assertNoAbsolutePaths(receipt, userData);
  });

  it('rejects arbitrary paths, non-text assets, and mismatched identity claims', async () => {
    const userData = await temporaryDirectory();
    const service = createService(userData);
    await service.initialize();
    const text = await writeManagedAsset(userData, 'txt', Buffer.from('identity'));
    const pdf = await writeManagedAsset(userData, 'pdf', Buffer.from('%PDF-1.7'));

    await expect(service.readTextAsset({
      relativePath: 'C:\\private.txt',
      expectedContentHash: text.contentHash,
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(service.readTextAsset({
      relativePath: '../private.txt',
      expectedContentHash: text.contentHash,
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(service.readTextAsset({
      relativePath: pdf.relativePath,
      expectedContentHash: pdf.contentHash,
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(service.readTextAsset({
      relativePath: text.relativePath,
      expectedContentHash: 'b'.repeat(64),
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('deletes an independently verified managed asset without exposing its absolute path', async () => {
    const userData = await temporaryDirectory();
    const service = createService(userData);
    await service.initialize();
    const content = Buffer.from('delete me safely');
    const identity = await writeManagedAsset(userData, 'txt', content);
    const request = {
      relativePath: identity.relativePath,
      expectedContentHash: identity.contentHash,
      expectedMimeType: 'text/plain',
      expectedExtension: 'txt',
      expectedByteSize: content.byteLength,
    };

    const result = await service.deleteManagedAsset(request);
    expect(result).toEqual({ deleted: true, alreadyMissing: false });
    await expect(fs.lstat(path.join(userData, 'sources', ...identity.relativePath.split('/'))))
      .rejects.toMatchObject({ code: 'ENOENT' });
    assertNoAbsolutePaths(result, userData);
    await expect(service.deleteManagedAsset(request)).resolves.toEqual({
      deleted: false,
      alreadyMissing: true,
    });
  });

  it('rejects false asset identities before deletion', async () => {
    const userData = await temporaryDirectory();
    const service = createService(userData);
    await service.initialize();
    const content = Buffer.from('%PDF-1.7\nbody');
    const identity = await writeManagedAsset(userData, 'pdf', content);
    const pathname = path.join(userData, 'sources', ...identity.relativePath.split('/'));

    await expect(service.deleteManagedAsset({
      relativePath: identity.relativePath,
      expectedContentHash: identity.contentHash,
      expectedMimeType: 'text/plain',
      expectedExtension: 'pdf',
      expectedByteSize: content.byteLength,
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(fs.readFile(pathname)).resolves.toEqual(content);
  });

  it('uses bounded retries for locked managed assets and returns a recoverable safe error', async () => {
    const userData = await temporaryDirectory();
    const content = Buffer.from('locked file');
    const identity = await writeManagedAsset(userData, 'txt', content);
    const unlinkFile = vi.fn().mockRejectedValue(
      Object.assign(new Error(`EPERM ${userData}`), { code: 'EPERM' }),
    );
    const service = createService(userData, [], { unlinkFile });
    await service.initialize();

    await expect(service.deleteManagedAsset({
      relativePath: identity.relativePath,
      expectedContentHash: identity.contentHash,
      expectedMimeType: 'text/plain',
      expectedExtension: 'txt',
      expectedByteSize: content.byteLength,
    })).rejects.toMatchObject({
      code: 'MANAGED_ASSET_DELETE_FAILED',
      message: 'The managed asset could not be deleted safely. The purge can be retried.',
    });
    expect(unlinkFile).toHaveBeenCalledTimes(3);
    await expect(fs.readFile(
      path.join(userData, 'sources', ...identity.relativePath.split('/')),
    )).resolves.toEqual(content);
  });

  it('rejects invalid UTF-8 and binary managed text content', async () => {
    const userData = await temporaryDirectory();
    const service = createService(userData);
    await service.initialize();
    const invalidUtf8 = await writeManagedAsset(
      userData,
      'txt',
      Buffer.from([0xc3, 0x28]),
    );
    const binary = await writeManagedAsset(
      userData,
      'md',
      Buffer.from([0x61, 0x00, 0x62]),
    );

    await expect(service.readTextAsset({
      relativePath: invalidUtf8.relativePath,
      expectedContentHash: invalidUtf8.contentHash,
    })).rejects.toMatchObject({ code: 'INVALID_TEXT_ENCODING' });
    await expect(service.readTextAsset({
      relativePath: binary.relativePath,
      expectedContentHash: binary.contentHash,
    })).rejects.toMatchObject({ code: 'INVALID_TEXT_CONTENT' });
  });

  it('enforces the configured text limit and detects changed managed bytes', async () => {
    const userData = await temporaryDirectory();
    const service = createService(userData, [], { sizeLimits: { text: 3 } });
    await service.initialize();
    const oversized = await writeManagedAsset(userData, 'txt', Buffer.from('four'));
    await expect(service.readTextAsset({
      relativePath: oversized.relativePath,
      expectedContentHash: oversized.contentHash,
    })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });

    const original = Buffer.from('one');
    const identity = await writeManagedAsset(userData, 'txt', original);
    const pathname = path.join(userData, 'sources', ...identity.relativePath.split('/'));
    await fs.writeFile(pathname, 'two');
    await expect(service.readTextAsset({
      relativePath: identity.relativePath,
      expectedContentHash: identity.contentHash,
    })).rejects.toMatchObject({ code: 'MANAGED_ASSET_IDENTITY_MISMATCH' });
  });

  it('preserves Arabic filenames and never places display names in managed paths', async () => {
    const userData = await temporaryDirectory();
    const selectedPath = await writeFixture(userData, 'دراسة الفصل.txt', 'ملاحظات');
    const service = createService(userData, [selectedPath]);
    await service.initialize();

    const receipt = (await service.selectAndStage(null, defaultRequest)).receipts[0];
    expect(receipt.originalFilename).toBe('دراسة الفصل.txt');
    expect(receipt.proposedRelativePath).not.toContain('دراسة');
  });

  it('rejects unsupported, mismatched, directory, and oversized selections with cleanup', async () => {
    const userData = await temporaryDirectory();
    const unsupported = await writeFixture(userData, 'data.docx', 'content');
    const mismatched = await writeFixture(userData, 'fake.pdf', 'not a pdf');
    const oversized = await writeFixture(userData, 'large.txt', '12345');

    const unsupportedService = createService(userData, [unsupported]);
    await unsupportedService.initialize();
    await expect(unsupportedService.selectAndStage(null, defaultRequest))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });

    const mismatchService = createService(userData, [mismatched]);
    await mismatchService.initialize();
    await expect(mismatchService.selectAndStage(null, defaultRequest))
      .rejects.toMatchObject({ code: 'FILE_SIGNATURE_MISMATCH' });

    const directoryService = createService(userData, [userData]);
    await directoryService.initialize();
    await expect(directoryService.selectAndStage(null, defaultRequest))
      .rejects.toMatchObject({ code: 'FILE_NOT_REGULAR' });

    const oversizedService = createService(userData, [oversized], {
      sizeLimits: { text: 4 },
    });
    await oversizedService.initialize();
    await expect(oversizedService.selectAndStage(null, defaultRequest))
      .rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });

    expect(await fs.readdir(path.join(userData, 'sources', 'staging'))).toEqual([]);
  });

  it('maps staging write failures and removes private token state', async () => {
    const userData = await temporaryDirectory();
    const selectedPath = await writeFixture(userData, 'notes.txt', 'study');
    const service = createService(userData, [selectedPath], {
      writeStreamFactory: () => new Writable({
        write(_chunk, _encoding, callback) {
          callback(Object.assign(new Error('denied'), { code: 'EPERM' }));
        },
      }),
    });
    await service.initialize();

    await expect(service.selectAndStage(null, defaultRequest))
      .rejects.toMatchObject({ code: 'STAGING_WRITE_FAILED' });
    expect(await fs.readdir(path.join(userData, 'sources', 'staging'))).toEqual([]);
  });

  it('maps source read failures, rejects symlinks where supported, and cleans staging', async () => {
    const userData = await temporaryDirectory();
    const selectedPath = await writeFixture(userData, 'notes.txt', 'study');
    const readFailure = createService(userData, [selectedPath], {
      readStreamFactory: () => new Readable({
        read() {
          this.destroy(Object.assign(new Error('read failed'), { code: 'EIO' }));
        },
      }),
    });
    await readFailure.initialize();
    await expect(readFailure.selectAndStage(null, defaultRequest))
      .rejects.toMatchObject({ code: 'FILE_READ_FAILED' });
    expect(await fs.readdir(path.join(userData, 'sources', 'staging'))).toEqual([]);

    const symlinkPath = path.join(userData, 'linked.txt');
    try {
      await fs.symlink(selectedPath, symlinkPath, 'file');
    } catch {
      return;
    }
    const symlinkService = createService(userData, [symlinkPath]);
    await symlinkService.initialize();
    await expect(symlinkService.selectAndStage(null, defaultRequest))
      .rejects.toMatchObject({ code: 'FILE_NOT_REGULAR' });
  });

  it('cancels active and pending staging idempotently and invalidates tokens', async () => {
    const userData = await temporaryDirectory();
    const selectedPath = await writeFixture(userData, 'notes.txt', 'study');
    const slowStream = () => {
      let sent = false;
      return new Readable({
        read() {
          if (sent) return;
          sent = true;
          setTimeout(() => {
            this.push(Buffer.alloc(1024, 1));
            this.push(null);
          }, 100);
        },
      });
    };
    const activeService = createService(userData, [], { readStreamFactory: slowStream });
    await activeService.initialize();
    const active = await activeService.beginStagingSelectedFile(selectedPath);
    await expect(activeService.cancel(active.stagingToken)).resolves.toEqual({ cancelled: true });
    await expect(active.completion).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' });
    await expect(activeService.cancel(active.stagingToken)).resolves.toEqual({ cancelled: false });

    const pendingService = createService(await temporaryDirectory());
    await pendingService.initialize();
    const pending = await pendingService.beginStagingSelectedFile(selectedPath);
    const receipt = await pending.completion;
    await expect(pendingService.cancel(receipt.stagingToken)).resolves.toEqual({ cancelled: true });
    await expect(pendingService.finalise(receipt.stagingToken))
      .rejects.toMatchObject({ code: 'STAGING_TOKEN_UNKNOWN' });
  });

  it('expires tokens and rejects unknown or reused tokens', async () => {
    let currentTime = 1_000;
    const userData = await temporaryDirectory();
    const selectedPath = await writeFixture(userData, 'notes.txt', 'study');
    const service = createService(userData, [], {
      now: () => currentTime,
      receiptLifetimeMs: 10,
    });
    await service.initialize();
    const operation = await service.beginStagingSelectedFile(selectedPath);
    const receipt = await operation.completion;
    currentTime = 1_011;
    await expect(service.finalise(receipt.stagingToken))
      .rejects.toMatchObject({ code: 'STAGING_TOKEN_EXPIRED' });
    await expect(service.finalise('f'.repeat(64)))
      .rejects.toMatchObject({ code: 'STAGING_TOKEN_UNKNOWN' });
  });

  it('uses unpredictable distinct tokens and detects staged-file tampering', async () => {
    const userData = await temporaryDirectory();
    const selectedPath = await writeFixture(userData, 'notes.txt', 'study');
    const service = createService(userData);
    await service.initialize();
    const first = await service.beginStagingSelectedFile(selectedPath);
    const firstReceipt = await first.completion;
    const second = await service.beginStagingSelectedFile(selectedPath);
    const secondReceipt = await second.completion;

    expect(firstReceipt.stagingToken).not.toBe(secondReceipt.stagingToken);
    expect(firstReceipt.stagingToken).not.toContain(firstReceipt.contentHash);
    expect(firstReceipt.stagingToken).not.toContain('notes');
    await fs.writeFile(
      path.join(userData, 'sources', 'staging', `${firstReceipt.stagingToken}.stage`),
      'tampered',
    );
    await expect(service.finalise(firstReceipt.stagingToken))
      .rejects.toMatchObject({ code: 'STAGING_HASH_MISMATCH' });
    await service.cancel(secondReceipt.stagingToken);
  });

  it('promotes new assets, reuses identical files, and never returns an assetId', async () => {
    const userData = await temporaryDirectory();
    const selectedPath = await writeFixture(userData, 'notes.txt', 'same content');
    const service = createService(userData);
    await service.initialize();

    const firstStage = await service.beginStagingSelectedFile(selectedPath);
    const firstReceipt = await firstStage.completion;
    const first = await service.finalise(firstReceipt.stagingToken);
    expect(first.reusedExistingAssetFile).toBe(false);
    expect(first.relativePath).toMatch(/^assets\/[a-f0-9]{2}\/[a-f0-9]{64}\.txt$/);
    expect(first).not.toHaveProperty('assetId');

    const secondStage = await service.beginStagingSelectedFile(selectedPath);
    const secondReceipt = await secondStage.completion;
    const second = await service.finalise(secondReceipt.stagingToken);
    expect(second.reusedExistingAssetFile).toBe(true);
    expect(second.relativePath).toBe(first.relativePath);
  });

  it('rejects conflicting destination bytes without overwriting the existing asset', async () => {
    const userData = await temporaryDirectory();
    const selectedPath = await writeFixture(userData, 'notes.txt', 'original');
    const service = createService(userData);
    await service.initialize();
    const operation = await service.beginStagingSelectedFile(selectedPath);
    const receipt = await operation.completion;
    const destination = path.join(userData, 'sources', ...receipt.proposedRelativePath.split('/'));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, 'conflicting');

    await expect(service.finalise(receipt.stagingToken))
      .rejects.toMatchObject({ code: 'ASSET_PATH_CONFLICT' });
    expect(await fs.readFile(destination, 'utf8')).toBe('conflicting');
  });

  it('uses verified copy fallback when atomic rename reports EXDEV', async () => {
    const userData = await temporaryDirectory();
    const selectedPath = await writeFixture(userData, 'notes.txt', 'copy fallback');
    const service = createService(userData, [], {
      renameFile: vi.fn().mockRejectedValue(Object.assign(new Error('cross-device'), { code: 'EXDEV' })),
    });
    await service.initialize();
    const operation = await service.beginStagingSelectedFile(selectedPath);
    const receipt = await operation.completion;
    const finalised = await service.finalise(receipt.stagingToken);

    expect(finalised.reusedExistingAssetFile).toBe(false);
    expect(await fs.readFile(
      path.join(userData, 'sources', ...finalised.relativePath.split('/')),
      'utf8',
    )).toBe('copy fallback');
  });

  it('maps bounded rename failures and cleans staging without exposing OS errors', async () => {
    const userData = await temporaryDirectory();
    const selectedPath = await writeFixture(userData, 'notes.txt', 'rename failure');
    const renameFile = vi.fn().mockRejectedValue(
      Object.assign(new Error(`EPERM ${userData}`), { code: 'EPERM' }),
    );
    const service = createService(userData, [], { renameFile });
    await service.initialize();
    const operation = await service.beginStagingSelectedFile(selectedPath);
    const receipt = await operation.completion;

    await expect(service.finalise(receipt.stagingToken)).rejects.toMatchObject({
      code: 'ASSET_PROMOTION_FAILED',
      message: 'The staged file could not be finalised.',
    });
    expect(renameFile).toHaveBeenCalledTimes(3);
    expect(await fs.readdir(path.join(userData, 'sources', 'staging'))).toEqual([]);
  });

  it('reconciles staging and promotion debris without deleting finalised assets or exposing paths', async () => {
    const userData = await temporaryDirectory();
    const service = createService(userData);
    await service.initialize();
    const sourcesRoot = path.join(userData, 'sources');
    const orphanToken = 'a'.repeat(64);
    await fs.writeFile(path.join(sourcesRoot, 'staging', `${orphanToken}.stage`), 'orphan');
    const finalContent = 'final asset';
    const hash = crypto.createHash('sha256').update(finalContent).digest('hex');
    const shard = path.join(sourcesRoot, 'assets', hash.slice(0, 2));
    await fs.mkdir(shard, { recursive: true });
    await fs.writeFile(path.join(shard, `.promote-${'c'.repeat(64)}.tmp`), 'temporary');
    await fs.writeFile(path.join(shard, `${hash}.txt`), finalContent);
    await fs.writeFile(path.join(sourcesRoot, 'assets', 'malformed.bin'), 'bad');

    const report = await service.reconcile();
    expect(report.expiredStagingFiles).toBe(1);
    expect(report.removedTemporaryFiles).toBe(1);
    expect(report.quarantinedFiles).toBeGreaterThanOrEqual(1);
    expect(report.unresolvedAssetFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relativePath: `assets/${hash.slice(0, 2)}/${hash}.txt`,
        contentHash: hash,
        reason: 'REFERENCE_STATUS_UNKNOWN',
      }),
    ]));
    await expect(fs.readFile(path.join(shard, `${hash}.txt`), 'utf8'))
      .resolves.toBe(finalContent);
    assertNoAbsolutePaths(report, userData);
  });

  it('reports content-address conflicts without deleting the finalised file', async () => {
    const userData = await temporaryDirectory();
    const service = createService(userData);
    await service.initialize();
    const claimedHash = 'd'.repeat(64);
    const assetPath = path.join(
      userData,
      'sources',
      'assets',
      'dd',
      `${claimedHash}.txt`,
    );
    await fs.mkdir(path.dirname(assetPath), { recursive: true });
    await fs.writeFile(assetPath, 'wrong bytes');

    const report = await service.reconcile();
    expect(report.unresolvedAssetFiles).toContainEqual(expect.objectContaining({
      contentHash: claimedHash,
      reason: 'ASSET_PATH_CONFLICT',
    }));
    await expect(fs.readFile(assetPath, 'utf8')).resolves.toBe('wrong bytes');
  });

  it('bounds unresolved reconciliation results', async () => {
    const userData = await temporaryDirectory();
    const service = createService(userData);
    await service.initialize();
    const shard = path.join(userData, 'sources', 'assets', 'aa');
    await fs.mkdir(shard, { recursive: true });
    await Promise.all(Array.from({ length: 205 }, (_, index) => {
      const hash = `aa${index.toString(16).padStart(62, '0')}`;
      return fs.writeFile(path.join(shard, `${hash}.txt`), `asset-${index}`);
    }));

    const report = await service.reconcile();
    expect(report.unresolvedAssetFiles).toHaveLength(200);
    expect(report.resultTruncated).toBe(true);
    assertNoAbsolutePaths(report, userData);
  });

  it('reports registry tokens whose private staging files disappeared', async () => {
    const userData = await temporaryDirectory();
    const selectedPath = await writeFixture(userData, 'notes.txt', 'missing');
    const service = createService(userData);
    await service.initialize();
    const operation = await service.beginStagingSelectedFile(selectedPath);
    const receipt = await operation.completion;
    await fs.unlink(path.join(userData, 'sources', 'staging', `${receipt.stagingToken}.stage`));

    const report = await service.reconcile();
    expect(report.missingStagingTokenFiles).toBe(1);
    await expect(service.finalise(receipt.stagingToken))
      .rejects.toMatchObject({ code: 'STAGING_TOKEN_UNKNOWN' });
  });
});
