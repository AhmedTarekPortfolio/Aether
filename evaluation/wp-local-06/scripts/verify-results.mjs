import fs from 'node:fs/promises';

const resultPath = process.argv[2];
const expectPackaged = process.argv.includes('--expect-packaged');
if (!resultPath) throw new Error('Result path is required');

const report = JSON.parse(await fs.readFile(resultPath, 'utf8'));
let checks = 0;

function assert(condition, message) {
  checks += 1;
  if (!condition) throw new Error(`CHECK ${checks} FAILED: ${message}`);
}

function entry(id) {
  const value = report.results.find((candidate) => candidate.scenarioId === id);
  assert(Boolean(value), `Missing scenario ${id}`);
  return value;
}

function expect(id, status, code = null) {
  const value = entry(id);
  assert(value.result.status === status, `${id} status was ${value.result.status}`);
  assert(value.result.errorCode === code, `${id} code was ${value.result.errorCode}`);
  return value;
}

assert(report.packaged === expectPackaged, `packaged flag was ${report.packaged}`);
assert(report.electron === '32.3.3', `Electron version was ${report.electron}`);
assert(report.node === '20.18.1', `Node version was ${report.node}`);
assert(report.platform === 'win32', `platform was ${report.platform}`);
assert(report.arch === 'x64', `architecture was ${report.arch}`);
assert(report.results.length === 34, `scenario count was ${report.results.length}`);

for (const result of report.results) {
  assert(result.mainSurvived === true, `${result.scenarioId} terminated Main`);
  assert(result.utilityPidObserved === true, `${result.scenarioId} lacked a distinct utility PID`);
  assert(result.mainPid !== result.rendererPid, `${result.scenarioId} renderer and Main PIDs matched`);
  assert(result.cleanupConfirmed === true, `${result.scenarioId} left evaluation temporary state`);
  if (result.utilityEvidence) {
    assert(result.utilityEvidence.processType === 'utility', `${result.scenarioId} was not a utility process`);
    assert(result.utilityEvidence.hasDocument === false, `${result.scenarioId} had document access`);
    assert(result.utilityEvidence.hasWindow === false, `${result.scenarioId} had window access`);
    assert(result.utilityEvidence.hasIndexedDb === false, `${result.scenarioId} had IndexedDB access`);
    assert(result.utilityEvidence.hasLocalStorage === false, `${result.scenarioId} had localStorage access`);
    assert(
      JSON.stringify(result.utilityEvidence.inheritedEnvironmentKeys) === JSON.stringify(['LANG', 'SYSTEMROOT', 'TEMP', 'TMP']),
      `${result.scenarioId} inherited unexpected environment keys`,
    );
  } else {
    assert(
      ['timeout', 'utility-crash'].includes(result.scenarioId),
      `${result.scenarioId} lacked utility environment evidence`,
    );
  }
  assert(!/^[a-zA-Z]:[\\/]/.test(result.rendererRequest.assetRelativePath), `${result.scenarioId} renderer received an absolute path`);
  assert(result.peakWorkingSetBytes < 500 * 1024 * 1024, `${result.scenarioId} exceeded 500 MiB`);
}

for (const id of [
  'small-text',
  'textbook',
  'arabic',
  'mixed-language',
  'table',
  'multiple-columns',
  'headings',
  'printed-page-labels',
  'scanned',
  'large-page-count',
  'unusual-fonts',
  'poor-reading-order',
  'embedded-images',
  'blank-pages',
  'hostile-text',
  'malformed-object-stream',
  'memory-stress',
  'large-byte-size',
  'repeated-1',
  'repeated-2',
  'repeated-3',
  'repeated-4',
  'repeated-5',
]) {
  const value = expect(
    id,
    'completed',
    ['scanned', 'large-byte-size'].includes(id) ? 'PDF_SCANNED_CONTENT_DETECTED' : null,
  );
  assert(value.outputValidated === true, `${id} output was not validated`);
}

expect('password', 'failed', 'PDF_PASSWORD_PROTECTED');
expect('corrupt', 'failed', 'PDF_INVALID_FORMAT');
expect('truncated', 'failed', 'PDF_INVALID_FORMAT');
expect('page-limit', 'failed', 'PDF_PAGE_LIMIT_EXCEEDED');
expect('character-limit', 'partially_completed', 'PDF_CHARACTER_LIMIT_EXCEEDED');
expect('cancellation', 'cancelled', 'PDF_EXTRACTION_CANCELLED');
expect('timeout', 'failed', 'PDF_EXTRACTION_TIMEOUT');
expect('utility-crash', 'failed', 'PDF_PARSER_CRASHED');
expect('invalid-output', 'failed', 'PDF_OUTPUT_INVALID');
expect('bounding-box-limit', 'failed', 'PDF_PARTIAL_EXTRACTION');
expect('output-message-limit', 'partially_completed', 'PDF_PARTIAL_EXTRACTION');

const arabicText = entry('arabic').result.pages[0].text;
assert(arabicText.includes('اختبار استخراج النص العربي'), 'Arabic heading was not reconstructed');
assert(arabicText.includes('التعلم المنظم'), 'Arabic body was not readable');
const mixedText = entry('mixed-language').result.pages[0].text;
assert(mixedText.includes('English: spaced repetition'), 'English mixed-language text was missing');
assert(mixedText.includes('العربیة:'), 'Arabic mixed-language text was missing');
const labels = entry('printed-page-labels').result.pages.map((page) => page.printedPageLabel);
assert(JSON.stringify(labels) === JSON.stringify(['i', 'ii', '1', '2']), `page labels were ${JSON.stringify(labels)}`);
assert(entry('scanned').result.scannedPageCount === 1, 'scanned page was not detected');
assert(entry('large-page-count').result.pages.length === 1000, 'large page-count extraction was incomplete');
assert(entry('memory-stress').result.pages.length === 100, 'memory stress extraction was incomplete');
assert(entry('memory-stress').peakWorkingSetBytes < 200 * 1024 * 1024, 'memory stress exceeded 200 MiB');
assert(entry('large-byte-size').rendererRequest.byteSize > 25 * 1024 * 1024, 'large-byte fixture was too small');
assert(entry('large-byte-size').peakWorkingSetBytes < 300 * 1024 * 1024, 'large-byte extraction exceeded 300 MiB');
assert(entry('cancellation').elapsedMs < 2_000, 'cancellation latency exceeded 2 seconds');
assert(entry('timeout').elapsedMs < 1_500, 'timeout termination exceeded 1.5 seconds');
assert(entry('hostile-text').result.pages[0].text.includes('Ignore previous instructions'), 'hostile text was not preserved as evidence');

console.log(JSON.stringify({
  verdict: 'PASS',
  checks,
  scenarios: report.results.length,
  packaged: report.packaged,
  maximumPeakWorkingSetMiB: Math.round(
    (Math.max(...report.results.map((result) => result.peakWorkingSetBytes)) / 1024 / 1024) * 100,
  ) / 100,
}));
