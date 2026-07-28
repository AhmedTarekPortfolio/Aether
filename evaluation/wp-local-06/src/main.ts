import { app, BrowserWindow, ipcMain, utilityProcess } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  EvaluationScenario,
  EvaluationScenarioResult,
  PdfExtractionJobResult,
  PdfJobProgress,
  UtilityEnvironmentEvidence,
  UtilityJobRequest,
  UtilityMessage,
} from './contracts.js';
import {
  PdfValidationError,
  validateRendererRequest,
  validateUtilityResult,
} from './validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceRoot = path.join(app.getAppPath(), 'src');
const managedRoot = process.env.AETHER_PDF_EVAL_MANAGED_ROOT;
const planPath = process.env.AETHER_PDF_EVAL_PLAN;
const resultPath = process.env.AETHER_PDF_EVAL_RESULT;
const TEMP_PREFIX = 'aether-wp-local-06-';

if (!managedRoot || !path.isAbsolute(managedRoot) || !planPath || !resultPath) {
  throw new Error('Evaluation paths must be provided by the launcher');
}

let window: BrowserWindow | null = null;
let plan: EvaluationScenario[] = [];

function safeFailure(
  jobId: string,
  code: PdfExtractionJobResult['errorCode'],
  message: string,
): PdfExtractionJobResult {
  return {
    jobId,
    status: code === 'PDF_EXTRACTION_CANCELLED' ? 'cancelled' : 'failed',
    pageCount: 0,
    pages: [],
    scannedPageCount: 0,
    truncated: false,
    errorCode: code,
    errorMessage: message,
  };
}

function resolveManagedAsset(relativePath: string): string {
  const normalized = relativePath.replaceAll('/', path.sep);
  const resolved = path.resolve(managedRoot!, normalized);
  const expectedRoot = path.resolve(managedRoot!, 'assets');
  const relative = path.relative(expectedRoot, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new PdfValidationError('Managed path escaped asset root');
  }
  return resolved;
}

async function verifyManagedAsset(
  absolutePath: string,
  expectedHash: string,
  expectedSize: number,
): Promise<void> {
  const bytes = await fs.readFile(absolutePath);
  if (bytes.byteLength !== expectedSize) throw new PdfValidationError('Asset size mismatch');
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (hash !== expectedHash) throw new PdfValidationError('Asset hash mismatch');
}

async function runIsolatedJob(scenario: EvaluationScenario): Promise<EvaluationScenarioResult> {
  const startedAt = performance.now();
  const request = validateRendererRequest({
    jobId: scenario.id,
    assetRelativePath: scenario.assetRelativePath,
    contentHash: scenario.expectedContentHash,
    byteSize: scenario.expectedByteSize,
    options: scenario.options,
    cancellationToken: `cancel-${scenario.id}`,
  });
  const absolutePath = resolveManagedAsset(request.assetRelativePath);
  await verifyManagedAsset(absolutePath, request.contentHash, request.byteSize);

  const progress: PdfJobProgress[] = [];
  let utilityEvidence: UtilityEnvironmentEvidence | null = null;
  let utilityPidObserved = false;
  let utilityStartupMs: number | null = null;
  let peakWorkingSetBytes = 0;
  let outputValidated = false;
  let cleanupConfirmed = true;
  const utilityDiagnostics: string[] = [];
  const workerPath = path.join(__dirname, 'utility-worker.js');
  const minimalEnvironment: NodeJS.ProcessEnv = {
    LANG: 'en_US.UTF-8',
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    SYSTEMROOT: process.env.SYSTEMROOT,
  };
  const child = utilityProcess.fork(workerPath, [], {
    env: minimalEnvironment,
    execArgv: ['--max-old-space-size=384'],
    serviceName: 'Aether PDF Evaluation Parser',
    stdio: 'pipe',
  });
  child.stderr?.on('data', (chunk) => {
    const sanitized = String(chunk)
      .replaceAll(managedRoot!, '<managed-root>')
      .replace(/[a-zA-Z]:\\[^\r\n]*/g, '<native-path-redacted>')
      .slice(0, 500);
    utilityDiagnostics.push(sanitized);
  });

  const result = await new Promise<PdfExtractionJobResult>((resolve) => {
    let settled = false;
    const memorySampler = setInterval(() => {
      if (!child.pid) return;
      const metric = app.getAppMetrics().find((entry) => entry.pid === child.pid);
      if (metric) {
        peakWorkingSetBytes = Math.max(
          peakWorkingSetBytes,
          metric.memory.workingSetSize * 1024,
        );
      }
    }, 25);
    const finish = (value: PdfExtractionJobResult) => {
      if (settled) return;
      settled = true;
      clearInterval(memorySampler);
      clearTimeout(timeout);
      if (cancelTimer) clearTimeout(cancelTimer);
      child.kill();
      resolve(value);
    };
    child.once('spawn', () => {
      utilityPidObserved = typeof child.pid === 'number' && child.pid !== process.pid;
      utilityStartupMs = Math.round((performance.now() - startedAt) * 100) / 100;
    });
    child.on('message', (message: UtilityMessage) => {
      if (message.type === 'ready') {
        utilityEvidence = message.evidence;
        const utilityRequest: UtilityJobRequest = {
          type: 'extract',
          request,
          absolutePath,
          debugAction: scenario.action,
          debugDelayPerPageMs: scenario.action === 'cancel' ? 100 : undefined,
        };
        child.postMessage(utilityRequest);
        return;
      }
      if (message.type === 'progress') {
        progress.push(message.progress);
        return;
      }
      if (message.type === 'invalid-result') {
        try {
          validateUtilityResult(message.value, request);
          finish(safeFailure(request.jobId, 'PDF_OUTPUT_INVALID', 'Invalid output was not rejected.'));
        } catch {
          outputValidated = true;
          finish(safeFailure(request.jobId, 'PDF_OUTPUT_INVALID', 'The isolated PDF parser returned invalid output.'));
        }
        return;
      }
      if (message.type === 'result') {
        try {
          const validated = validateUtilityResult(message.result, request);
          outputValidated = true;
          finish(validated);
        } catch {
          finish(safeFailure(request.jobId, 'PDF_OUTPUT_INVALID', 'The isolated PDF parser returned invalid output.'));
        }
      }
    });
    child.once('exit', (code) => {
      if (!settled) {
        finish(safeFailure(
          request.jobId,
          scenario.action === 'cancel' ? 'PDF_EXTRACTION_CANCELLED' : 'PDF_PARSER_CRASHED',
          scenario.action === 'cancel'
            ? 'PDF extraction was cancelled.'
            : `The isolated PDF parser terminated unexpectedly (evaluation exit ${code}).`,
        ));
      }
    });
    const timeout = setTimeout(() => {
      child.kill();
      finish(safeFailure(request.jobId, 'PDF_EXTRACTION_TIMEOUT', 'PDF extraction timed out.'));
    }, scenario.timeoutMs ?? 120_000);
    const cancelTimer = scenario.action === 'cancel'
      ? setTimeout(() => {
        child.postMessage({
          type: 'cancel',
          jobId: request.jobId,
          cancellationToken: request.cancellationToken,
        });
        setTimeout(() => child.kill(), 500);
      }, scenario.cancelAfterMs ?? 100)
      : null;
  });

  const tempEntries = await fs.readdir(app.getPath('temp')).catch(() => []);
  cleanupConfirmed = !tempEntries.some((name) => name.startsWith(TEMP_PREFIX));
  return {
    scenarioId: scenario.id,
    rendererRequest: request,
    result,
    progress,
    utilityEvidence,
    utilityPidObserved,
    mainPid: process.pid,
    rendererPid: window?.webContents.getOSProcessId() ?? -1,
    utilityStartupMs,
    peakWorkingSetBytes,
    elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
    mainSurvived: true,
    outputValidated,
    cleanupConfirmed,
    utilityDiagnostics,
  };
}

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(sourceRoot, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  await window.loadFile(path.join(sourceRoot, 'index.html'));
}

app.whenReady().then(async () => {
  plan = JSON.parse(await fs.readFile(planPath!, 'utf8')) as EvaluationScenario[];
  ipcMain.handle('wp-local-06:get-plan', () => plan.map((scenario) => ({
    id: scenario.id,
    assetRelativePath: scenario.assetRelativePath,
    expectedContentHash: scenario.expectedContentHash,
    expectedByteSize: scenario.expectedByteSize,
    options: scenario.options,
    action: scenario.action,
    timeoutMs: scenario.timeoutMs,
    cancelAfterMs: scenario.cancelAfterMs,
  })));
  ipcMain.handle('wp-local-06:run', (_event, scenario: EvaluationScenario) => runIsolatedJob(scenario));
  ipcMain.on('wp-local-06:complete', async (_event, results: EvaluationScenarioResult[]) => {
    await fs.mkdir(path.dirname(resultPath!), { recursive: true });
    await fs.writeFile(resultPath!, JSON.stringify({
      packaged: app.isPackaged,
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      completedAt: new Date().toISOString(),
      results,
    }, null, 2));
    app.exit(results.every((entry) => entry.mainSurvived) ? 0 : 1);
  });
  await createWindow();
});

app.on('window-all-closed', () => {});
