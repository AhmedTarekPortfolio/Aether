import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import {
  PDF_VIEWER_LIMITS,
  type PdfViewerGrant,
  type PdfViewerGrantRequest,
} from '../../../types/pdf.js';
import { getSourceStorageService } from '../source-storage-provider.js';
import { PdfValidationError } from './pdf-errors.js';

interface ViewerGrantRecord {
  token: string;
  senderId: number;
  sourceVersionId: string;
  absolutePath: string;
  byteSize: number;
  contentHash: string;
  expiresAt: number;
}

interface ByteRange {
  start: number;
  end: number;
}

function tokenFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'aether-asset:'
      || url.hostname !== 'pdf'
      || !/^\/[a-f0-9]{64}$/.test(url.pathname)
      || url.search
      || url.hash
    ) return null;
    return url.pathname.slice(1);
  } catch {
    return null;
  }
}

export function parsePdfByteRange(
  header: string | null,
  size: number,
  maximumRangeBytes = PDF_VIEWER_LIMITS.maximumRangeBytes,
): ByteRange | null {
  if (!header) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!match) throw new PdfValidationError('Invalid PDF range');
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(requestedEnd)
    || start < 0
    || start >= size
    || requestedEnd < start
  ) throw new PdfValidationError('Unsatisfiable PDF range');
  return {
    start,
    end: Math.min(requestedEnd, size - 1, start + maximumRangeBytes - 1),
  };
}

export class PdfViewerService {
  private readonly grants = new Map<string, ViewerGrantRecord>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly randomBytes: (size: number) => Buffer = crypto.randomBytes,
  ) {}

  public async createGrant(
    senderId: number,
    request: PdfViewerGrantRequest,
  ): Promise<PdfViewerGrant> {
    this.removeExpired();
    const verified = await getSourceStorageService().resolveVerifiedPdfAsset(
      request.assetRelativePath,
      request.contentHash,
      request.byteSize,
      200 * 1024 * 1024,
    );
    const token = this.randomBytes(32).toString('hex');
    const expiresAt = this.now() + PDF_VIEWER_LIMITS.grantLifetimeMs;
    this.grants.set(token, {
      token,
      senderId,
      sourceVersionId: request.sourceVersionId,
      absolutePath: verified.absolutePath,
      byteSize: verified.byteSize,
      contentHash: verified.contentHash,
      expiresAt,
    });
    return {
      sourceVersionId: request.sourceVersionId,
      url: `aether-asset://pdf/${token}`,
      expiresAt,
    };
  }

  public revoke(senderId: number, url: string): boolean {
    this.removeExpired();
    const token = tokenFromUrl(url);
    if (!token) return false;
    const grant = this.grants.get(token);
    if (!grant || grant.senderId !== senderId) return false;
    this.grants.delete(token);
    return true;
  }

  public revokeSender(senderId: number): void {
    for (const [token, grant] of this.grants) {
      if (grant.senderId === senderId) this.grants.delete(token);
    }
  }

  public async handle(request: Request): Promise<Response> {
    this.removeExpired();
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const token = tokenFromUrl(request.url);
    const grant = token ? this.grants.get(token) : undefined;
    if (!grant) return new Response(null, { status: 404 });

    let stat;
    try {
      stat = await fs.lstat(grant.absolutePath);
    } catch {
      this.grants.delete(grant.token);
      return new Response(null, { status: 404 });
    }
    if (
      !stat.isFile()
      || stat.isSymbolicLink()
      || stat.size !== grant.byteSize
    ) {
      this.grants.delete(grant.token);
      return new Response(null, { status: 410 });
    }

    let range: ByteRange | null;
    try {
      range = parsePdfByteRange(request.headers.get('range'), grant.byteSize);
    } catch {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${grant.byteSize}` },
      });
    }
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'self'",
      'Content-Type': 'application/pdf',
      'X-Content-Type-Options': 'nosniff',
    });
    const start = range?.start ?? 0;
    const end = range?.end ?? grant.byteSize - 1;
    headers.set('Content-Length', String(end - start + 1));
    if (range) headers.set('Content-Range', `bytes ${start}-${end}/${grant.byteSize}`);
    if (request.method === 'HEAD') {
      return new Response(null, { status: range ? 206 : 200, headers });
    }
    const stream = createReadStream(grant.absolutePath, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: range ? 206 : 200,
      headers,
    });
  }

  public clear(): void {
    this.grants.clear();
  }

  private removeExpired(): void {
    const now = this.now();
    for (const [token, grant] of this.grants) {
      if (grant.expiresAt <= now) this.grants.delete(token);
    }
  }
}

let viewerService: PdfViewerService | null = null;

export function getPdfViewerService(): PdfViewerService {
  viewerService ??= new PdfViewerService();
  return viewerService;
}

export function shutdownPdfViewerService(): void {
  viewerService?.clear();
  viewerService = null;
}
