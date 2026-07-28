import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const candidate = process.argv[2];
const files = [
  ['small', process.env.CANDIDATE_SMALL],
  ['arabic', process.env.CANDIDATE_ARABIC],
];

if (!candidate || files.some(([, file]) => !file)) {
  throw new Error('Candidate and fixture paths are required');
}

for (const [id, file] of files) {
  const startedAt = performance.now();
  try {
    const bytes = new Uint8Array(await fs.readFile(file));
    let pages;
    let text;
    if (candidate === 'pdf-parse') {
      const { PDFParse } = await import(
        'file:///D:/AetherPdfCandidates/node_modules/pdf-parse/dist/pdf-parse/esm/index.js'
      );
      const parser = new PDFParse({ data: bytes });
      const value = await parser.getText();
      pages = value.total;
      text = value.text;
      await parser.destroy();
    } else if (candidate === 'unpdf') {
      const { extractText, getDocumentProxy } = await import(
        'file:///D:/AetherPdfCandidates/node_modules/unpdf/dist/index.mjs'
      );
      const proxy = await getDocumentProxy(bytes);
      const value = await extractText(proxy, { mergePages: true });
      pages = value.totalPages;
      text = value.text;
    } else if (candidate === 'pdfium-wasm') {
      const { PDFiumLibrary } = await import(
        'file:///D:/AetherPdfCandidates/node_modules/@hyzyla/pdfium/dist/index.esm.js'
      );
      const library = await PDFiumLibrary.init();
      const document = await library.loadDocument(bytes);
      const pageTexts = [];
      pages = 0;
      for (const page of document.pages()) {
        pages += 1;
        pageTexts.push(page.getText());
      }
      text = pageTexts.join('\n');
      document.destroy();
      library.destroy();
    } else {
      throw new Error(`Unknown candidate: ${candidate}`);
    }
    console.log(JSON.stringify({
      candidate,
      id,
      pages,
      text,
      elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
      rssMB: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
    }));
  } catch (error) {
    console.log(JSON.stringify({
      candidate,
      id,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
      elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
      rssMB: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
    }));
  }
}
