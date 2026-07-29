import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsConstants from 'node:fs';
import path from 'node:path';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { BrowserWindow, OpenDialogOptions, OpenDialogReturnValue } from 'electron';
import {
  SOURCE_FILE_SIZE_LIMITS,
  SOURCE_MAXIMUM_FILE_COUNT,
  type AssetFinalisationReceipt,
  type ReadManagedTextAssetReceipt,
  type ReadManagedTextAssetRequest,
  type SourceCancellationResult,
  type SourceFileKind,
  type SourceFileSelectionRequest,
  type SourceFilesystemReconciliationReport,
  type SourceStagingReceipt,
  type SourceStorageCapabilities,
} from '../../types/source-storage.js';
import {
  identifySupportedSourceFile,
  sanitizeOriginalFilename,
  SUPPORTED_SOURCE_EXTENSIONS,
  validateSourceSignature,
  type SupportedSourceFile,
} from './source-file-validation.js';
import {
  assetRelativePath,
  createManagedSourcePaths,
  MANAGED_SOURCE_DIRECTORIES,
  resolveManagedRelativePath,
  type ManagedSourcePaths,
} from './source-storage-paths.js';
import { SourceStorageError, toSourceStorageError } from './source-storage-errors.js';

const SIGNATURE_SAMPLE_BYTES = 8 * 1024;
const DEFAULT_RECEIPT_LIFETIME_MS = 30 * 60 * 1000;
const MAX_RECONCILIATION_ENTRIES = 1_000;
const MAX_UNRESOLVED_ASSETS = 200;
const RETRYABLE_CODES = new Set(['EBUSY', 'EPERM']);

interface SourceDialogAdapter {
  showOpenDialog(
    window: BrowserWindow | null,
    options: OpenDialogOptions,
  ): Promise<OpenDialogReturnValue>;
}

interface StagingEntry {
  token: string;
  stagingPath: string;
  controller: AbortController;
  state: 'active' | 'pending' | 'finalising';
  createdAt: number;
  expiresAt: number;
  receipt?: SourceStagingReceipt;
  completion?: Promise<SourceStagingReceipt>;
}

export interface SourceStorageServiceOptions {
  userDataPath: string;
  dialog: SourceDialogAdapter;
  receiptLifetimeMs?: number;
  sizeLimits?: Partial<Record<SourceFileKind, number>>;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
  renameFile?: typeof fs.rename;
  readStreamFactory?: (pathname: string) => Readable;
  writeStreamFactory?: (pathname: string) => Writable;
}

export interface ActiveStagingOperation {
  stagingToken: string;
  completion: Promise<SourceStagingReceipt>;
}

export interface VerifiedManagedPdfAsset {
  absolutePath: string;
  byteSize: number;
  contentHash: string;
}

async function safeUnlink(pathname: string): Promise<void> {
  try {
    await retryFileOperation(() => fs.unlink(pathname));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function retryFileOperation(operation: () => Promise<void>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      lastError = error;
      if (!RETRYABLE_CODES.has((error as NodeJS.ErrnoException).code ?? '') || attempt === 2) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw lastError;
}

export class SourceStorageService {
  private paths: ManagedSourcePaths | null = null;
  private readonly registry = new Map<string, StagingEntry>();
  private readonly receiptLifetimeMs: number;
  private readonly sizeLimits: Record<SourceFileKind, number>;
  private readonly now: () => number;
  private readonly randomBytes: (size: number) => Buffer;
  private readonly renameFile: typeof fs.rename;
  private readonly readStreamFactory: (pathname: string) => Readable;
  private readonly writeStreamFactory: (pathname: string) => Writable;

  constructor(private readonly options: SourceStorageServiceOptions) {
    this.receiptLifetimeMs = options.receiptLifetimeMs ?? DEFAULT_RECEIPT_LIFETIME_MS;
    this.sizeLimits = { ...SOURCE_FILE_SIZE_LIMITS, ...options.sizeLimits };
    this.now = options.now ?? Date.now;
    this.randomBytes = options.randomBytes ?? crypto.randomBytes;
    this.renameFile = options.renameFile ?? fs.rename;
    this.readStreamFactory = options.readStreamFactory
      ?? ((pathname) => fsConstants.createReadStream(pathname));
    this.writeStreamFactory = options.writeStreamFactory
      ?? ((pathname) => fsConstants.createWriteStream(pathname, {
        flags: 'wx',
        mode: 0o600,
        flush: true,
      }));
    if (
      !Number.isSafeInteger(this.receiptLifetimeMs)
      || this.receiptLifetimeMs <= 0
      || Object.values(this.sizeLimits).some(
        (limit) => !Number.isSafeInteger(limit) || limit <= 0,
      )
    ) {
      throw new SourceStorageError('SOURCE_STORAGE_UNAVAILABLE');
    }
  }

  public async initialize(): Promise<void> {
    this.paths = await createManagedSourcePaths(this.options.userDataPath);
  }

  public getCapabilities(): SourceStorageCapabilities {
    return {
      available: this.paths !== null,
      supportedExtensions: SUPPORTED_SOURCE_EXTENSIONS,
      maximumFileCount: SOURCE_MAXIMUM_FILE_COUNT,
      sizeLimits: { ...this.sizeLimits },
      stagingReceiptLifetimeMs: this.receiptLifetimeMs,
      physicalAssetScope: 'shared-content-addressed',
    };
  }

  public async resolveVerifiedPdfAsset(
    relativePath: string,
    expectedContentHash: string,
    expectedByteSize: number,
    extractionByteLimit = 50 * 1024 * 1024,
  ): Promise<VerifiedManagedPdfAsset> {
    const paths = this.requirePaths();
    if (
      !/^[a-f0-9]{64}$/.test(expectedContentHash)
      || !Number.isSafeInteger(expectedByteSize)
      || expectedByteSize <= 0
      || !Number.isSafeInteger(extractionByteLimit)
      || extractionByteLimit <= 0
      || assetRelativePath(expectedContentHash, 'pdf') !== relativePath
    ) {
      throw new SourceStorageError('INVALID_REQUEST');
    }
    if (expectedByteSize > extractionByteLimit) {
      throw new SourceStorageError('FILE_TOO_LARGE');
    }

    const pathname = resolveManagedRelativePath(paths, relativePath, 'assets');
    try {
      const [realAssetRoot, realPath, linkStat] = await Promise.all([
        fs.realpath(paths.assets),
        fs.realpath(pathname),
        fs.lstat(pathname),
      ]);
      const relativeRealPath = path.relative(realAssetRoot, realPath);
      if (
        !relativeRealPath
        || relativeRealPath === '..'
        || relativeRealPath.startsWith(`..${path.sep}`)
        || path.isAbsolute(relativeRealPath)
        || linkStat.isSymbolicLink()
        || !linkStat.isFile()
        || linkStat.size !== expectedByteSize
      ) {
        throw new SourceStorageError('MANAGED_ASSET_IDENTITY_MISMATCH');
      }
      const facts = await this.hashFile(pathname);
      if (
        facts.contentHash !== expectedContentHash
        || facts.byteSize !== expectedByteSize
      ) {
        throw new SourceStorageError('MANAGED_ASSET_IDENTITY_MISMATCH');
      }
      return {
        absolutePath: realPath,
        byteSize: facts.byteSize,
        contentHash: facts.contentHash,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new SourceStorageError('MANAGED_ASSET_NOT_FOUND', { cause: error });
      }
      throw error;
    }
  }

  public async readTextAsset(
    request: ReadManagedTextAssetRequest,
  ): Promise<ReadManagedTextAssetReceipt> {
    const paths = this.requirePaths();
    const extension = path.posix.extname(request.relativePath).slice(1).toLowerCase();
    const textType = extension === 'txt'
      ? { extension: 'txt' as const, mimeType: 'text/plain' as const, kind: 'text' as const }
      : extension === 'md' || extension === 'markdown'
        ? {
            extension: extension as 'md' | 'markdown',
            mimeType: 'text/markdown' as const,
            kind: 'markdown' as const,
          }
        : null;
    if (
      !textType
      || assetRelativePath(request.expectedContentHash, extension) !== request.relativePath
    ) {
      throw new SourceStorageError('INVALID_REQUEST');
    }

    const pathname = resolveManagedRelativePath(paths, request.relativePath, 'assets');
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
    try {
      const [realAssetRoot, realPath, linkStat] = await Promise.all([
        fs.realpath(paths.assets),
        fs.realpath(pathname),
        fs.lstat(pathname),
      ]);
      const relativeRealPath = path.relative(realAssetRoot, realPath);
      if (
        !relativeRealPath
        || relativeRealPath === '..'
        || relativeRealPath.startsWith(`..${path.sep}`)
        || path.isAbsolute(relativeRealPath)
        || linkStat.isSymbolicLink()
        || !linkStat.isFile()
      ) {
        throw new SourceStorageError('INVALID_REQUEST');
      }

      handle = await fs.open(pathname, 'r');
      const before = await handle.stat();
      if (!before.isFile()) throw new SourceStorageError('INVALID_REQUEST');
      if (before.size > this.sizeLimits[textType.kind]) {
        throw new SourceStorageError('FILE_TOO_LARGE');
      }
      const bytes = await handle.readFile();
      const after = await handle.stat();
      if (before.size !== after.size || bytes.byteLength !== before.size) {
        throw new SourceStorageError('MANAGED_ASSET_IDENTITY_MISMATCH');
      }
      const contentHash = crypto.createHash('sha256').update(bytes).digest('hex');
      if (contentHash !== request.expectedContentHash) {
        throw new SourceStorageError('MANAGED_ASSET_IDENTITY_MISMATCH');
      }

      let suspiciousControls = 0;
      for (const byte of bytes) {
        if (byte === 0) throw new SourceStorageError('INVALID_TEXT_CONTENT');
        if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
          suspiciousControls += 1;
        }
      }
      if (bytes.length > 0 && suspiciousControls / bytes.length > 0.1) {
        throw new SourceStorageError('INVALID_TEXT_CONTENT');
      }

      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch (error) {
        throw new SourceStorageError('INVALID_TEXT_ENCODING', { cause: error });
      }
      return {
        text,
        contentHash,
        mimeType: textType.mimeType,
        extension: textType.extension,
        byteSize: bytes.byteLength,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new SourceStorageError('MANAGED_ASSET_NOT_FOUND', { cause: error });
      }
      throw error;
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  private requirePaths(): ManagedSourcePaths {
    if (!this.paths) throw new SourceStorageError('SOURCE_STORAGE_UNAVAILABLE');
    return this.paths;
  }

  private allowedKinds(request: SourceFileSelectionRequest): Set<SourceFileKind> {
    return new Set(
      request.allowedKinds.length === 1 && request.allowedKinds[0] === 'any-supported'
        ? ['text', 'markdown', 'pdf', 'image']
        : request.allowedKinds as SourceFileKind[],
    );
  }

  private dialogFilters(request: SourceFileSelectionRequest): Electron.FileFilter[] {
    const allowedKinds = this.allowedKinds(request);
    const filters: Electron.FileFilter[] = [];
    if (allowedKinds.has('text')) filters.push({ name: 'Text', extensions: ['txt'] });
    if (allowedKinds.has('markdown')) filters.push({ name: 'Markdown', extensions: ['md', 'markdown'] });
    if (allowedKinds.has('pdf')) filters.push({ name: 'PDF', extensions: ['pdf'] });
    if (allowedKinds.has('image')) filters.push({ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] });
    return filters;
  }

  public async selectAndStage(
    window: BrowserWindow | null,
    request: SourceFileSelectionRequest,
  ): Promise<{ cancelled: boolean; receipts: SourceStagingReceipt[] }> {
    this.requirePaths();
    const selection = await this.options.dialog.showOpenDialog(window, {
      title: 'Select study sources',
      buttonLabel: 'Stage',
      filters: this.dialogFilters(request),
      properties: request.selectionMode === 'multiple'
        ? ['openFile', 'multiSelections']
        : ['openFile'],
    });
    if (selection.canceled || selection.filePaths.length === 0) {
      return { cancelled: true, receipts: [] };
    }
    if (selection.filePaths.length > request.maximumFileCount) {
      throw new SourceStorageError('INVALID_REQUEST');
    }

    const receipts: SourceStagingReceipt[] = [];
    try {
      for (const selectedPath of selection.filePaths) {
        const operation = await this.beginStagingSelectedFile(
          selectedPath,
          this.allowedKinds(request),
        );
        receipts.push(await operation.completion);
      }
      return { cancelled: false, receipts };
    } catch (error) {
      await Promise.all(receipts.map((receipt) => this.cancel(receipt.stagingToken)));
      throw error;
    }
  }

  public async beginStagingSelectedFile(
    selectedPath: string,
    allowedKinds = new Set<SourceFileKind>(['text', 'markdown', 'pdf', 'image']),
  ): Promise<ActiveStagingOperation> {
    const paths = this.requirePaths();
    let selectedStat;
    try {
      selectedStat = await fs.lstat(selectedPath);
    } catch (error) {
      throw new SourceStorageError('FILE_READ_FAILED', { cause: error });
    }
    if (!selectedStat.isFile() || selectedStat.isSymbolicLink()) {
      throw new SourceStorageError('FILE_NOT_REGULAR');
    }
    const type = identifySupportedSourceFile(selectedPath);
    if (!allowedKinds.has(type.kind)) throw new SourceStorageError('UNSUPPORTED_FILE_TYPE');
    if (selectedStat.size > this.sizeLimits[type.kind]) {
      throw new SourceStorageError('FILE_TOO_LARGE');
    }

    const token = this.randomBytes(32).toString('hex');
    const stagingPath = path.join(paths.staging, `${token}.stage`);
    const controller = new AbortController();
    const createdAt = this.now();
    const entry: StagingEntry = {
      token,
      stagingPath,
      controller,
      state: 'active',
      createdAt,
      expiresAt: createdAt + this.receiptLifetimeMs,
    };
    this.registry.set(token, entry);
    const completion = this.copyToStaging(selectedPath, type, entry);
    entry.completion = completion;
    return { stagingToken: token, completion };
  }

  private async copyToStaging(
    selectedPath: string,
    type: SupportedSourceFile,
    entry: StagingEntry,
  ): Promise<SourceStagingReceipt> {
    const maxBytes = this.sizeLimits[type.kind];
    const digest = crypto.createHash('sha256');
    const sampleChunks: Buffer[] = [];
    let sampledBytes = 0;
    let byteSize = 0;
    let failureOrigin: 'read' | 'write' | null = null;

    const inspector = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        byteSize += chunk.length;
        if (byteSize > maxBytes) {
          callback(new SourceStorageError('FILE_TOO_LARGE'));
          return;
        }
        digest.update(chunk);
        if (sampledBytes < SIGNATURE_SAMPLE_BYTES) {
          const sample = chunk.subarray(0, SIGNATURE_SAMPLE_BYTES - sampledBytes);
          sampleChunks.push(Buffer.from(sample));
          sampledBytes += sample.length;
        }
        callback(null, chunk);
      },
    });

    try {
      const input = this.readStreamFactory(selectedPath);
      const output = this.writeStreamFactory(entry.stagingPath);
      input.once('error', () => { failureOrigin ??= 'read'; });
      output.once('error', () => { failureOrigin ??= 'write'; });
      await pipeline(input, inspector, output, { signal: entry.controller.signal });

      validateSourceSignature(type, Buffer.concat(sampleChunks));
      const contentHash = digest.digest('hex');
      const receipt: SourceStagingReceipt = {
        stagingToken: entry.token,
        contentHash,
        mimeType: type.mimeType,
        extension: type.extension,
        byteSize,
        originalFilename: sanitizeOriginalFilename(selectedPath),
        proposedRelativePath: assetRelativePath(contentHash, type.extension),
        createdAt: entry.createdAt,
      };
      entry.receipt = receipt;
      entry.state = 'pending';
      return receipt;
    } catch (error) {
      await safeUnlink(entry.stagingPath).catch(() => {});
      this.registry.delete(entry.token);
      if (entry.controller.signal.aborted || (error as NodeJS.ErrnoException).name === 'AbortError') {
        throw new SourceStorageError('OPERATION_CANCELLED');
      }
      throw toSourceStorageError(
        error instanceof SourceStorageError
          ? error
          : new SourceStorageError(
            failureOrigin === 'write' ? 'STAGING_WRITE_FAILED' : 'FILE_READ_FAILED',
            { cause: error },
          ),
      );
    }
  }

  private async hashFile(pathname: string): Promise<{ contentHash: string; byteSize: number }> {
    const digest = crypto.createHash('sha256');
    let byteSize = 0;
    try {
      const input = fsConstants.createReadStream(pathname);
      for await (const chunk of input) {
        const buffer = chunk as Buffer;
        byteSize += buffer.length;
        digest.update(buffer);
      }
      return { contentHash: digest.digest('hex'), byteSize };
    } catch (error) {
      throw new SourceStorageError('STAGING_FILE_MISSING', { cause: error });
    }
  }

  private async validatePendingEntry(token: string): Promise<StagingEntry & { receipt: SourceStagingReceipt }> {
    const entry = this.registry.get(token);
    if (!entry || !entry.receipt || entry.state !== 'pending') {
      throw new SourceStorageError('STAGING_TOKEN_UNKNOWN');
    }
    if (this.now() > entry.expiresAt) {
      this.registry.delete(token);
      await safeUnlink(entry.stagingPath).catch(() => {});
      throw new SourceStorageError('STAGING_TOKEN_EXPIRED');
    }
    try {
      const stat = await fs.lstat(entry.stagingPath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new SourceStorageError('STAGING_FILE_MISSING');
      }
    } catch (error) {
      if (error instanceof SourceStorageError) throw error;
      throw new SourceStorageError('STAGING_FILE_MISSING', { cause: error });
    }
    return entry as StagingEntry & { receipt: SourceStagingReceipt };
  }

  public async finalise(stagingToken: string): Promise<AssetFinalisationReceipt> {
    const paths = this.requirePaths();
    const entry = await this.validatePendingEntry(stagingToken);
    entry.state = 'finalising';
    const receipt = entry.receipt;

    try {
      const stagedFacts = await this.hashFile(entry.stagingPath);
      if (
        stagedFacts.contentHash !== receipt.contentHash
        || stagedFacts.byteSize !== receipt.byteSize
      ) {
        throw new SourceStorageError('STAGING_HASH_MISMATCH');
      }

      const relativePath = assetRelativePath(receipt.contentHash, receipt.extension);
      const destination = resolveManagedRelativePath(paths, relativePath, 'assets');
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const shardStat = await fs.lstat(path.dirname(destination));
      if (!shardStat.isDirectory() || shardStat.isSymbolicLink()) {
        throw new SourceStorageError('ASSET_PROMOTION_FAILED');
      }

      let reusedExistingAssetFile = false;
      try {
        const destinationStat = await fs.lstat(destination);
        if (!destinationStat.isFile() || destinationStat.isSymbolicLink()) {
          throw new SourceStorageError('ASSET_PATH_CONFLICT');
        }
        const destinationFacts = await this.hashFile(destination);
        if (
          destinationFacts.contentHash !== receipt.contentHash
          || destinationFacts.byteSize !== receipt.byteSize
        ) {
          throw new SourceStorageError('ASSET_PATH_CONFLICT');
        }
        reusedExistingAssetFile = true;
        await safeUnlink(entry.stagingPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await this.promoteStagedFile(entry.stagingPath, destination, stagingToken, receipt);
      }

      this.registry.delete(stagingToken);
      return {
        stagingToken,
        contentHash: receipt.contentHash,
        mimeType: receipt.mimeType,
        extension: receipt.extension,
        byteSize: receipt.byteSize,
        relativePath,
        finalisedAt: this.now(),
        reusedExistingAssetFile,
      };
    } catch (error) {
      this.registry.delete(stagingToken);
      if (error instanceof SourceStorageError && error.code === 'ASSET_PATH_CONFLICT') {
        await this.quarantinePath(entry.stagingPath, `conflict-${stagingToken}.stage`).catch(() => {});
        throw error;
      }
      await safeUnlink(entry.stagingPath).catch(() => {});
      throw error instanceof SourceStorageError
        ? error
        : new SourceStorageError('ASSET_PROMOTION_FAILED', { cause: error });
    }
  }

  private async promoteStagedFile(
    stagingPath: string,
    destination: string,
    token: string,
    receipt: SourceStagingReceipt,
  ): Promise<void> {
    try {
      await retryFileOperation(() => this.renameFile(stagingPath, destination));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
        throw new SourceStorageError('ASSET_PROMOTION_FAILED', { cause: error });
      }
      const temporaryPath = path.join(path.dirname(destination), `.promote-${token}.tmp`);
      try {
        await fs.copyFile(stagingPath, temporaryPath, fsConstants.constants.COPYFILE_EXCL);
        const handle = await fs.open(temporaryPath, 'r+');
        await handle.sync();
        await handle.close();
        const copiedFacts = await this.hashFile(temporaryPath);
        if (
          copiedFacts.contentHash !== receipt.contentHash
          || copiedFacts.byteSize !== receipt.byteSize
        ) {
          throw new SourceStorageError('STAGING_HASH_MISMATCH');
        }
        await retryFileOperation(() => fs.rename(temporaryPath, destination));
        await safeUnlink(stagingPath);
      } catch (copyError) {
        await safeUnlink(temporaryPath).catch(() => {});
        throw copyError instanceof SourceStorageError
          ? copyError
          : new SourceStorageError('ASSET_PROMOTION_FAILED', { cause: copyError });
      }
    }
  }

  public async cancel(stagingToken: string): Promise<SourceCancellationResult> {
    const entry = this.registry.get(stagingToken);
    if (!entry || entry.state === 'finalising') return { cancelled: false };
    entry.controller.abort();
    if (entry.completion) await entry.completion.catch(() => {});
    await safeUnlink(entry.stagingPath).catch(() => {});
    this.registry.delete(stagingToken);
    return { cancelled: true };
  }

  private async quarantinePath(pathname: string, safeName: string): Promise<void> {
    const paths = this.requirePaths();
    const destination = path.join(
      paths.quarantine,
      `${this.now()}-${this.randomBytes(8).toString('hex')}-${safeName.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
    );
    await retryFileOperation(() => fs.rename(pathname, destination));
  }

  public async reconcile(): Promise<SourceFilesystemReconciliationReport> {
    const paths = this.requirePaths();
    const report: SourceFilesystemReconciliationReport = {
      expiredStagingFiles: 0,
      removedTemporaryFiles: 0,
      quarantinedFiles: 0,
      malformedEntries: 0,
      missingStagingTokenFiles: 0,
      unresolvedAssetFiles: [],
      resultTruncated: false,
      completedAt: 0,
    };

    for (const [token, entry] of this.registry) {
      try {
        await fs.lstat(entry.stagingPath);
      } catch {
        this.registry.delete(token);
        report.missingStagingTokenFiles += 1;
      }
    }

    const stagingEntries = await fs.readdir(paths.staging, { withFileTypes: true });
    if (stagingEntries.length > MAX_RECONCILIATION_ENTRIES) report.resultTruncated = true;
    for (const entry of stagingEntries.slice(0, MAX_RECONCILIATION_ENTRIES)) {
      const match = /^([a-f0-9]{64})\.stage$/.exec(entry.name);
      const absolutePath = path.join(paths.staging, entry.name);
      if (!entry.isFile() || entry.isSymbolicLink() || !match) {
        report.malformedEntries += 1;
        await this.quarantinePath(absolutePath, entry.name).catch(() => {});
        report.quarantinedFiles += 1;
        continue;
      }
      const registryEntry = this.registry.get(match[1]);
      const stat = await fs.lstat(absolutePath);
      if (!registryEntry || stat.size === 0 || this.now() > registryEntry.expiresAt) {
        await safeUnlink(absolutePath);
        this.registry.delete(match[1]);
        report.expiredStagingFiles += 1;
      }
    }

    const rootEntries = await fs.readdir(paths.root, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (!(MANAGED_SOURCE_DIRECTORIES as readonly string[]).includes(entry.name)) {
        report.malformedEntries += 1;
        await this.quarantinePath(path.join(paths.root, entry.name), entry.name).catch(() => {});
        report.quarantinedFiles += 1;
      }
    }

    const seenHashes = new Map<string, string>();
    const shardEntries = await fs.readdir(paths.assets, { withFileTypes: true });
    if (shardEntries.length > MAX_RECONCILIATION_ENTRIES) report.resultTruncated = true;
    for (const shard of shardEntries.slice(0, MAX_RECONCILIATION_ENTRIES)) {
      const shardPath = path.join(paths.assets, shard.name);
      if (!shard.isDirectory() || shard.isSymbolicLink() || !/^[a-f0-9]{2}$/.test(shard.name)) {
        report.malformedEntries += 1;
        await this.quarantinePath(shardPath, shard.name).catch(() => {});
        report.quarantinedFiles += 1;
        continue;
      }
      const files = await fs.readdir(shardPath, { withFileTypes: true });
      if (files.length > MAX_RECONCILIATION_ENTRIES) report.resultTruncated = true;
      for (const file of files.slice(0, MAX_RECONCILIATION_ENTRIES)) {
        const filePath = path.join(shardPath, file.name);
        if (/^\.promote-[a-f0-9]{64}\.tmp$/.test(file.name)) {
          await safeUnlink(filePath);
          report.removedTemporaryFiles += 1;
          continue;
        }
        const match = /^([a-f0-9]{64})\.(txt|md|markdown|pdf|png|jpg|webp)$/.exec(file.name);
        if (
          !file.isFile()
          || file.isSymbolicLink()
          || !match
          || match[1].slice(0, 2) !== shard.name
        ) {
          report.malformedEntries += 1;
          await this.quarantinePath(filePath, file.name).catch(() => {});
          report.quarantinedFiles += 1;
          continue;
        }
        const relativePath = `assets/${shard.name}/${file.name}`;
        const stat = await fs.lstat(filePath);
        const priorPath = seenHashes.get(match[1]);
        let reason = priorPath && priorPath !== relativePath
          ? 'ASSET_PATH_CONFLICT'
          : 'REFERENCE_STATUS_UNKNOWN';
        try {
          const facts = await this.hashFile(filePath);
          if (facts.contentHash !== match[1] || facts.byteSize !== stat.size) {
            reason = 'ASSET_PATH_CONFLICT';
          }
        } catch {
          reason = 'ASSET_READ_FAILED';
        }
        seenHashes.set(match[1], relativePath);
        if (report.unresolvedAssetFiles.length < MAX_UNRESOLVED_ASSETS) {
          report.unresolvedAssetFiles.push({
            relativePath,
            contentHash: match[1],
            byteSize: stat.size,
            reason,
          });
        } else {
          report.resultTruncated = true;
        }
      }
    }

    report.completedAt = this.now();
    return report;
  }
}
