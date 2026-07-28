import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  type PdfBoundingBox,
  type PdfErrorCode,
  type PdfExtractionJobRequest,
  type PdfExtractionJobResult,
  type PdfJobProgress,
} from './contracts.js';

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

interface ExtractionHooks {
  isCancelled(): boolean;
  onProgress(progress: PdfJobProgress): void;
  delayPerPageMs?: number;
}

function safeMessage(code: PdfErrorCode): string {
  const messages: Record<PdfErrorCode, string> = {
    PDF_PASSWORD_PROTECTED: 'The PDF is password protected.',
    PDF_INVALID_FORMAT: 'The file is not a valid PDF.',
    PDF_CORRUPT: 'The PDF is corrupt or malformed.',
    PDF_TOO_LARGE: 'The PDF exceeds the extraction byte limit.',
    PDF_PAGE_LIMIT_EXCEEDED: 'The PDF exceeds the page limit.',
    PDF_CHARACTER_LIMIT_EXCEEDED: 'The extracted text exceeds the character limit.',
    PDF_EXTRACTION_TIMEOUT: 'PDF extraction timed out.',
    PDF_EXTRACTION_CANCELLED: 'PDF extraction was cancelled.',
    PDF_PARSER_CRASHED: 'The isolated PDF parser terminated unexpectedly.',
    PDF_OUTPUT_INVALID: 'The isolated PDF parser returned invalid output.',
    PDF_SCANNED_CONTENT_DETECTED: 'The PDF appears to contain scanned pages.',
    PDF_PARTIAL_EXTRACTION: 'Only part of the PDF could be extracted.',
    PDF_ASSET_MISSING: 'The managed PDF asset is missing.',
    PDF_HASH_MISMATCH: 'The managed PDF asset no longer matches its recorded hash.',
  };
  return messages[code];
}

function failure(
  request: PdfExtractionJobRequest,
  code: PdfErrorCode,
  pageCount = 0,
): PdfExtractionJobResult {
  return {
    jobId: request.jobId,
    status: code === 'PDF_EXTRACTION_CANCELLED' ? 'cancelled' : 'failed',
    pageCount,
    pages: [],
    scannedPageCount: 0,
    truncated: false,
    errorCode: code,
    errorMessage: safeMessage(code),
  };
}

function mapPdfJsError(error: unknown): PdfErrorCode {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  if (name === 'PasswordException' || /password/i.test(message)) return 'PDF_PASSWORD_PROTECTED';
  if (name === 'InvalidPDFException') return 'PDF_INVALID_FORMAT';
  if (name === 'MissingPDFException' || /ENOENT/.test(message)) return 'PDF_ASSET_MISSING';
  if (name === 'UnexpectedResponseException') return 'PDF_CORRUPT';
  return 'PDF_CORRUPT';
}

function textItemsToPage(items: Array<Record<string, unknown>>, includeCoordinates: boolean): {
  text: string;
  boxes: PdfBoundingBox[];
} {
  const boxes: PdfBoundingBox[] = [];
  const lines: Array<Array<Record<string, unknown>>> = [];
  let currentLine: Array<Record<string, unknown>> = [];
  let priorY: number | null = null;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const transform = Array.isArray(item.transform) ? item.transform : [];
    const x = Number(transform[4] ?? 0);
    const y = Number(transform[5] ?? 0);
    if (
      currentLine.length > 0
      && (Math.abs(y - (priorY ?? y)) > 2 || item.hasEOL === true)
    ) {
      lines.push(currentLine);
      currentLine = [];
    }
    if (item.str.length > 0) currentLine.push(item);
    priorY = y;
    if (includeCoordinates) {
      boxes.push({
        x,
        y,
        width: Math.max(0, Number(item.width ?? 0)),
        height: Math.max(0, Number(item.height ?? Math.abs(Number(transform[3] ?? 0)))),
      });
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);

  const renderedLines = lines.map((line) => {
    const rtlCount = line.filter((item) => item.dir === 'rtl' && String(item.str).trim()).length;
    const ltrCount = line.filter((item) => item.dir !== 'rtl' && String(item.str).trim()).length;
    if (rtlCount > ltrCount) {
      return [...line]
        .reverse()
        .map((item) => String(item.str).normalize('NFKC'))
        .join('')
        .trim();
    }
    const parts: string[] = [];
    for (const item of line) {
      const value = String(item.str).normalize('NFKC');
      if (
        parts.length > 0
        && !parts[parts.length - 1].endsWith(' ')
        && !value.startsWith(' ')
      ) parts.push(' ');
      parts.push(value);
    }
    return parts.join('').trim();
  }).filter(Boolean);
  return {
    text: renderedLines.join('\n'),
    boxes,
  };
}

function countRasterOperations(pdfjs: PdfJsModule, operations: { fnArray: number[] }): number {
  const imageOps = new Set([
    pdfjs.OPS.paintImageMaskXObject,
    pdfjs.OPS.paintImageMaskXObjectGroup,
    pdfjs.OPS.paintImageXObject,
    pdfjs.OPS.paintInlineImageXObject,
    pdfjs.OPS.paintInlineImageXObjectGroup,
    pdfjs.OPS.paintSolidColorImageMask,
  ]);
  return operations.fnArray.reduce((count, op) => count + (imageOps.has(op) ? 1 : 0), 0);
}

export async function extractPdf(
  request: PdfExtractionJobRequest,
  absolutePath: string,
  hooks: ExtractionHooks,
): Promise<PdfExtractionJobResult> {
  hooks.onProgress({
    jobId: request.jobId,
    stage: 'loading',
    pagesProcessed: 0,
    totalPages: null,
    percent: 0,
  });

  let bytes: Uint8Array;
  try {
    const buffer = await fs.readFile(absolutePath);
    bytes = new Uint8Array(buffer);
  } catch {
    return failure(request, 'PDF_ASSET_MISSING');
  }
  if (bytes.byteLength !== request.byteSize) return failure(request, 'PDF_HASH_MISMATCH');
  const actualHash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== request.contentHash) return failure(request, 'PDF_HASH_MISMATCH');
  if (hooks.isCancelled()) return failure(request, 'PDF_EXTRACTION_CANCELLED');

  let loadingTask: ReturnType<PdfJsModule['getDocument']> | null = null;
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const require = createRequire(import.meta.url);
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    ).href;
    loadingTask = pdfjs.getDocument({
      data: bytes,
      isEvalSupported: false,
      useSystemFonts: false,
      stopAtErrors: false,
      verbosity: pdfjs.VerbosityLevel.ERRORS,
    });
    const document = await loadingTask.promise;
    if (document.numPages > request.options.maxPages) {
      await document.destroy();
      return failure(request, 'PDF_PAGE_LIMIT_EXCEEDED', document.numPages);
    }
    const labels = await document.getPageLabels();
    const pages: PdfExtractionJobResult['pages'] = [];
    let characters = 0;
    let boxes = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      if (hooks.isCancelled()) {
        await document.destroy();
        return failure(request, 'PDF_EXTRACTION_CANCELLED', document.numPages);
      }
      if (hooks.delayPerPageMs) {
        await new Promise((resolve) => setTimeout(resolve, hooks.delayPerPageMs));
      }
      const page = await document.getPage(pageNumber);
      const [content, operations] = await Promise.all([
        page.getTextContent({ disableNormalization: false }),
        page.getOperatorList(),
      ]);
      const converted = textItemsToPage(
        content.items as unknown as Array<Record<string, unknown>>,
        request.options.includeCoordinates,
      );
      characters += converted.text.length;
      boxes += converted.boxes.length;
      if (characters > request.options.maxCharacters) {
        await document.destroy();
        return {
          ...failure(request, 'PDF_CHARACTER_LIMIT_EXCEEDED', document.numPages),
          status: pages.length > 0 ? 'partially_completed' : 'failed',
          pages,
          scannedPageCount: pages.filter((entry) => entry.likelyScanned).length,
          truncated: true,
        };
      }
      if (boxes > request.options.maxBoundingBoxes) {
        await document.destroy();
        return {
          ...failure(request, 'PDF_PARTIAL_EXTRACTION', document.numPages),
          status: pages.length > 0 ? 'partially_completed' : 'failed',
          pages,
          scannedPageCount: pages.filter((entry) => entry.likelyScanned).length,
          truncated: true,
        };
      }
      const rasterImageCount = countRasterOperations(pdfjs, operations);
      const likelyScanned = converted.text.replace(/\s/g, '').length < 20 && rasterImageCount > 0;
      const extractedPage = {
        ordinal: pageNumber,
        physicalPage: pageNumber,
        printedPageLabel: labels?.[pageNumber - 1] ?? null,
        text: converted.text,
        textHash: crypto.createHash('sha256').update(converted.text, 'utf8').digest('hex'),
        boundingBoxes: converted.boxes,
        rasterImageCount,
        likelyScanned,
      };
      const projectedOutputBytes = Buffer.byteLength(JSON.stringify({
        jobId: request.jobId,
        status: 'partially_completed',
        pageCount: document.numPages,
        pages: [...pages, extractedPage],
        scannedPageCount: pages.filter((entry) => entry.likelyScanned).length + (likelyScanned ? 1 : 0),
        truncated: true,
        errorCode: 'PDF_PARTIAL_EXTRACTION',
        errorMessage: safeMessage('PDF_PARTIAL_EXTRACTION'),
      }), 'utf8');
      if (projectedOutputBytes > request.options.maxOutputBytes) {
        await document.destroy();
        return {
          jobId: request.jobId,
          status: pages.length > 0 ? 'partially_completed' : 'failed',
          pageCount: document.numPages,
          pages,
          scannedPageCount: pages.filter((entry) => entry.likelyScanned).length,
          truncated: true,
          errorCode: 'PDF_PARTIAL_EXTRACTION',
          errorMessage: safeMessage('PDF_PARTIAL_EXTRACTION'),
        };
      }
      pages.push(extractedPage);
      page.cleanup();
      hooks.onProgress({
        jobId: request.jobId,
        stage: 'parsing',
        pagesProcessed: pageNumber,
        totalPages: document.numPages,
        percent: Math.floor((pageNumber / document.numPages) * 95),
      });
    }
    await document.destroy();
    hooks.onProgress({
      jobId: request.jobId,
      stage: 'finalizing',
      pagesProcessed: pages.length,
      totalPages: pages.length,
      percent: 100,
    });
    const scannedPageCount = pages.filter((page) => page.likelyScanned).length;
    return {
      jobId: request.jobId,
      status: 'completed',
      pageCount: pages.length,
      pages,
      scannedPageCount,
      truncated: false,
      errorCode: scannedPageCount === pages.length && pages.length > 0
        ? 'PDF_SCANNED_CONTENT_DETECTED'
        : null,
      errorMessage: scannedPageCount === pages.length && pages.length > 0
        ? safeMessage('PDF_SCANNED_CONTENT_DETECTED')
        : null,
    };
  } catch (error) {
    await loadingTask?.destroy().catch(() => {});
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[PDF_PARSER_DIAGNOSTIC] ${errorName}: ${errorMessage}`);
    return failure(request, mapPdfJsError(error));
  }
}
