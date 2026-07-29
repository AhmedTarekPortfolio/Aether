import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type {
  PdfBoundingBox,
  PdfErrorCode,
  PdfExtractionJobRequest,
  PdfExtractionJobResult,
  PdfJobProgress,
} from '../../../types/pdf.js';
import { pdfFailureResult, safePdfMessage } from './pdf-errors.js';

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

export interface PdfExtractionHooks {
  isCancelled(): boolean;
  onProgress(progress: PdfJobProgress): void;
}

export function mapPdfJsError(error: unknown): PdfErrorCode {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  if (name === 'PasswordException' || /password/i.test(message)) {
    return 'PDF_PASSWORD_PROTECTED';
  }
  if (name === 'InvalidPDFException') return 'PDF_INVALID_FORMAT';
  if (name === 'MissingPDFException' || /ENOENT/i.test(message)) return 'PDF_ASSET_MISSING';
  return 'PDF_CORRUPT';
}

export function textItemsToPage(
  items: Array<Record<string, unknown>>,
  includeCoordinates: boolean,
): { text: string; boxes: PdfBoundingBox[] } {
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
  return { text: renderedLines.join('\n'), boxes };
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
  return operations.fnArray.reduce(
    (count, operation) => count + (imageOps.has(operation) ? 1 : 0),
    0,
  );
}

function partialResult(
  request: PdfExtractionJobRequest,
  pageCount: number,
  pages: PdfExtractionJobResult['pages'],
  code: Extract<PdfErrorCode, 'PDF_CHARACTER_LIMIT_EXCEEDED' | 'PDF_PARTIAL_EXTRACTION'>,
): PdfExtractionJobResult {
  return {
    jobId: request.jobId,
    status: pages.length > 0 ? 'partially_completed' : 'failed',
    pageCount,
    pages,
    scannedPageCount: pages.filter((page) => page.likelyScanned).length,
    truncated: true,
    errorCode: code,
    errorMessage: safePdfMessage(code),
  };
}

export async function extractPdf(
  request: PdfExtractionJobRequest,
  absolutePath: string,
  hooks: PdfExtractionHooks,
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
    bytes = new Uint8Array(await fs.readFile(absolutePath));
  } catch {
    return pdfFailureResult(request.jobId, 'PDF_ASSET_MISSING');
  }
  if (bytes.byteLength !== request.byteSize) {
    return pdfFailureResult(request.jobId, 'PDF_HASH_MISMATCH');
  }
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== request.contentHash) {
    return pdfFailureResult(request.jobId, 'PDF_HASH_MISMATCH');
  }
  if (hooks.isCancelled()) {
    return pdfFailureResult(request.jobId, 'PDF_EXTRACTION_CANCELLED');
  }

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
      const count = document.numPages;
      await document.destroy();
      return pdfFailureResult(request.jobId, 'PDF_PAGE_LIMIT_EXCEEDED', count);
    }
    const labels = await document.getPageLabels();
    const pages: PdfExtractionJobResult['pages'] = [];
    let characters = 0;
    let boxes = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      if (hooks.isCancelled()) {
        await document.destroy();
        return pdfFailureResult(request.jobId, 'PDF_EXTRACTION_CANCELLED', document.numPages);
      }
      try {
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
          return partialResult(
            request,
            document.numPages,
            pages,
            'PDF_CHARACTER_LIMIT_EXCEEDED',
          );
        }
        if (boxes > request.options.maxBoundingBoxes) {
          await document.destroy();
          return partialResult(request, document.numPages, pages, 'PDF_PARTIAL_EXTRACTION');
        }
        const rasterImageCount = countRasterOperations(pdfjs, operations);
        const likelyScanned = converted.text.replace(/\s/gu, '').length < 20
          && rasterImageCount > 0;
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
        const projected = Buffer.byteLength(JSON.stringify({
          jobId: request.jobId,
          status: 'partially_completed',
          pageCount: document.numPages,
          pages: [...pages, extractedPage],
          scannedPageCount: 0,
          truncated: true,
          errorCode: 'PDF_PARTIAL_EXTRACTION',
          errorMessage: safePdfMessage('PDF_PARTIAL_EXTRACTION'),
        }), 'utf8');
        if (projected > request.options.maxOutputBytes) {
          await document.destroy();
          return partialResult(request, document.numPages, pages, 'PDF_PARTIAL_EXTRACTION');
        }
        pages.push(extractedPage);
        page.cleanup();
      } catch {
        await document.destroy();
        return partialResult(request, document.numPages, pages, 'PDF_PARTIAL_EXTRACTION');
      }
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
    const allScanned = scannedPageCount === pages.length && pages.length > 0;
    return {
      jobId: request.jobId,
      status: 'completed',
      pageCount: pages.length,
      pages,
      scannedPageCount,
      truncated: false,
      errorCode: allScanned ? 'PDF_SCANNED_CONTENT_DETECTED' : null,
      errorMessage: allScanned ? safePdfMessage('PDF_SCANNED_CONTENT_DETECTED') : null,
    };
  } catch (error) {
    await loadingTask?.destroy().catch(() => {});
    return pdfFailureResult(request.jobId, mapPdfJsError(error));
  }
}
