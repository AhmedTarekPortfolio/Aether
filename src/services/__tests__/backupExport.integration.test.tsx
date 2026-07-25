import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  exportFullBackupMock,
  prepareReplaceRestoreMock,
  createPreRestoreSafetyBackupMock,
  replaceRestoreMock,
  desktopRuntime,
  desktopSaveFileMock,
  desktopOpenFileMock,
} = vi.hoisted(() => ({
  exportFullBackupMock: vi.fn(),
  prepareReplaceRestoreMock: vi.fn(),
  createPreRestoreSafetyBackupMock: vi.fn(),
  replaceRestoreMock: vi.fn(),
  desktopRuntime: { enabled: false },
  desktopSaveFileMock: vi.fn(),
  desktopOpenFileMock: vi.fn(),
}));

vi.mock('../backupService', () => ({
  exportFullBackup: exportFullBackupMock,
  createPreRestoreSafetyBackup: createPreRestoreSafetyBackupMock,
  getBackupErrorMessage: () => 'Complete backup validation failed safely.',
  getLegacyImportErrorMessage: () => 'Legacy import failed safely.',
  getReplaceRestoreErrorMessage: () => 'Version 2 restore could not be completed safely.',
  importLegacyBackup: vi.fn(),
  parseBackupJson: vi.fn((value) => JSON.parse(value)),
  prepareLegacyImport: vi.fn(),
  prepareReplaceRestore: prepareReplaceRestoreMock,
  replaceRestore: replaceRestoreMock,
}));

vi.mock('../../components/ai/ModelSettingsModal', () => ({
  ModelSettingsModal: () => null,
}));

vi.mock('../../desktop/isDesktop', () => ({
  isDesktop: () => desktopRuntime.enabled,
}));

vi.mock('../../desktop/desktopBridge', () => ({
  desktopBridge: {
    saveFile: desktopSaveFileMock,
    openFile: desktopOpenFileMock,
  },
}));

import { SettingsView } from '../../views/SettingsView';

describe('WP-04 Settings complete-backup integration', () => {
  beforeEach(() => {
    localStorage.removeItem('aether.restoreVerification.v1');
    exportFullBackupMock.mockReset();
    prepareReplaceRestoreMock.mockReset();
    createPreRestoreSafetyBackupMock.mockReset();
    replaceRestoreMock.mockReset();
    desktopRuntime.enabled = false;
    desktopSaveFileMock.mockReset();
    desktopOpenFileMock.mockReset();
  });

  afterEach(() => {
    localStorage.removeItem('aether.restoreVerification.v1');
    vi.restoreAllMocks();
  });

  async function openSystemDataTab(): Promise<void> {
    render(
      <SettingsView
        userProfile={null}
        onUpdateProfile={vi.fn().mockResolvedValue(undefined)}
        refreshFromIndexedDb={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /system preferences & data/i }));
  }

  it('invokes the Version 2 backup service and reports success only after completion', async () => {
    let finishExport: (() => void) | undefined;
    exportFullBackupMock.mockImplementation(() => new Promise((resolve) => {
      finishExport = () => resolve({ warnings: [] });
    }));
    await openSystemDataTab();

    fireEvent.click(screen.getByRole('button', { name: /create complete backup.*version 2/i }));
    expect(screen.getByRole('button', { name: /validating complete backup/i })).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    finishExport?.();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      'Complete Version 2 backup download started.',
    ));
    expect(exportFullBackupMock).toHaveBeenCalledOnce();
  });

  it('writes and validates an Electron Version 2 export through exact-path readback', async () => {
    const json = '{"format":"aether-complete-backup"}';
    desktopRuntime.enabled = true;
    desktopSaveFileMock.mockResolvedValue({
      cancelled: false,
      filePath: 'C:\\Backups\\aether.json',
    });
    desktopOpenFileMock.mockResolvedValue({
      cancelled: false,
      filePath: 'C:\\Backups\\aether.json',
      content: json,
    });
    exportFullBackupMock.mockImplementation(async (options) => {
      await options.download(json, 'aether.json');
      return { warnings: [] };
    });
    await openSystemDataTab();

    fireEvent.click(screen.getByRole('button', { name: /create complete backup.*version 2/i }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      'Complete Version 2 backup was written and verified.',
    ));
    expect(desktopSaveFileMock).toHaveBeenCalledWith(expect.objectContaining({
      content: json,
      defaultPath: 'aether.json',
      title: 'Save complete Version 2 backup',
    }));
    expect(desktopOpenFileMock).toHaveBeenCalledWith({
      title: 'Verify the saved complete backup',
      buttonLabel: 'Verify Complete Backup',
    });
    expect(prepareReplaceRestoreMock).toHaveBeenCalledWith(JSON.parse(json));
  });

  it.each([
    {
      name: 'save cancellation',
      saveResult: { cancelled: true },
      openResult: undefined,
      expectedMessage: 'Complete Version 2 backup save was cancelled. No data was changed.',
    },
    {
      name: 'readback cancellation',
      saveResult: { cancelled: false, filePath: 'C:\\Backups\\aether.json' },
      openResult: { cancelled: true },
      expectedMessage: 'The complete Version 2 backup was written, but readback verification failed.',
    },
    {
      name: 'different selected readback path',
      saveResult: { cancelled: false, filePath: 'C:\\Backups\\aether.json' },
      openResult: {
        cancelled: false,
        filePath: 'C:\\Backups\\other.json',
        content: '{"format":"aether-complete-backup"}',
      },
      expectedMessage: 'The complete Version 2 backup was written, but readback verification failed.',
    },
    {
      name: 'modified readback content',
      saveResult: { cancelled: false, filePath: 'C:\\Backups\\aether.json' },
      openResult: {
        cancelled: false,
        filePath: 'C:\\Backups\\aether.json',
        content: '{"format":"modified"}',
      },
      expectedMessage: 'The complete Version 2 backup was written, but readback verification failed.',
    },
  ])('blocks Electron export success after $name', async ({
    saveResult,
    openResult,
    expectedMessage,
  }) => {
    const json = '{"format":"aether-complete-backup"}';
    desktopRuntime.enabled = true;
    desktopSaveFileMock.mockResolvedValue(saveResult);
    if (openResult) desktopOpenFileMock.mockResolvedValue(openResult);
    exportFullBackupMock.mockImplementation(async (options) => {
      await options.download(json, 'aether.json');
      return { warnings: [] };
    });
    await openSystemDataTab();

    fireEvent.click(screen.getByRole('button', { name: /create complete backup.*version 2/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(expectedMessage));
    expect(screen.queryByText(/backup was written and verified/i)).not.toBeInTheDocument();
    expect(prepareReplaceRestoreMock).not.toHaveBeenCalled();
  });

  it('reports an accurate post-write failure when Electron readback rejects', async () => {
    const json = '{"format":"aether-complete-backup"}';
    desktopRuntime.enabled = true;
    desktopSaveFileMock.mockResolvedValue({
      cancelled: false,
      filePath: 'C:\\Backups\\aether.json',
    });
    desktopOpenFileMock.mockRejectedValue(new Error('raw filesystem path'));
    exportFullBackupMock.mockImplementation(async (options) => {
      await options.download(json, 'aether.json');
      return { warnings: [] };
    });
    await openSystemDataTab();

    fireEvent.click(screen.getByRole('button', { name: /create complete backup.*version 2/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      'The complete Version 2 backup was written, but readback verification failed.',
    ));
    expect(screen.getByRole('alert')).not.toHaveTextContent('raw filesystem path');
    expect(prepareReplaceRestoreMock).not.toHaveBeenCalled();
  });

  it('rejects an exact-path, exact-content Electron export when parsed V2 validation fails', async () => {
    const invalidJson = '{"format":"aether-complete-backup"}';
    desktopRuntime.enabled = true;
    desktopSaveFileMock.mockResolvedValue({
      cancelled: false,
      filePath: 'C:\\Backups\\invalid.json',
    });
    desktopOpenFileMock.mockResolvedValue({
      cancelled: false,
      filePath: 'C:\\Backups\\invalid.json',
      content: invalidJson,
    });
    prepareReplaceRestoreMock.mockImplementation(() => {
      throw new Error('Invalid Version 2 envelope');
    });
    exportFullBackupMock.mockImplementation(async (options) => {
      await options.download(invalidJson, 'invalid.json');
      return { warnings: [] };
    });
    await openSystemDataTab();

    fireEvent.click(screen.getByRole('button', { name: /create complete backup.*version 2/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      'The complete Version 2 backup was written, but backup validation failed.',
    ));
    expect(prepareReplaceRestoreMock).toHaveBeenCalledWith(JSON.parse(invalidJson));
    expect(screen.queryByText(/backup was written and verified/i)).not.toBeInTheDocument();
  });

  it('opens the system recovery file input when deliberate recovery is requested from another tab', async () => {
    localStorage.setItem('aether.restoreVerification.v1', '{"state":"interrupted"}');
    render(
      <SettingsView
        userProfile={null}
        onUpdateProfile={vi.fn().mockResolvedValue(undefined)}
        refreshFromIndexedDb={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    act(() => {
      window.dispatchEvent(new Event('aether-request-safety-backup-recovery'));
    });

    await waitFor(() => {
      expect(screen.getByText(/recovery mode is active/i)).toBeInTheDocument();
      expect(clickSpy).toHaveBeenCalledOnce();
    });
    expect(screen.getByLabelText(/select safety backup for deliberate recovery/i))
      .toBeInTheDocument();
  });

  it('shows a safe historical-AI warning after a successful export', async () => {
    exportFullBackupMock.mockResolvedValue({
      warnings: [
        'Historical AI provider association was omitted from ai_conversations record ai-safe.',
      ],
    });
    await openSystemDataTab();

    fireEvent.click(screen.getByRole('button', { name: /create complete backup.*version 2/i }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      /historical AI provider association.*ai-safe/i,
    ));
  });

  it('shows a redacted error and never claims success when export is blocked', async () => {
    exportFullBackupMock.mockRejectedValue(new Error('sk-private-value'));
    await openSystemDataTab();

    fireEvent.click(screen.getByRole('button', { name: /create complete backup.*version 2/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      'Complete backup validation failed safely.',
    ));
    expect(screen.queryByText(/download started/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sk-private-value/i)).not.toBeInTheDocument();
  });

  it('shows a separate Version 2 replacement restore control', async () => {
    await openSystemDataTab();
    expect(screen.getByText(/restore complete backup.*version 2/i)).toBeInTheDocument();
    expect(screen.getByText(/completely replaces all application data/i)).toBeInTheDocument();
    expect(screen.getByText(/import legacy workspace/i)).toBeInTheDocument();
  });

  it('requires safety backup and deliberate confirmation before replacement', async () => {
    prepareReplaceRestoreMock.mockReturnValue({
      format: 'version-2',
      incomingCounts: {},
      expectedPostRestoreCounts: {},
      backup: {},
    });
    createPreRestoreSafetyBackupMock.mockResolvedValue({
      kind: 'verified-safety-backup',
      runtime: 'browser',
      completedAt: '2026-07-25T00:00:00.000Z',
    });
    replaceRestoreMock.mockResolvedValue({ counts: {} });
    await openSystemDataTab();
    const input = screen.getByLabelText(/select version 2 complete backup json/i);
    const file = new File(['{}'], 'complete.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByLabelText(/version 2 restore confirmation/i);

    expect(replaceRestoreMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /create required safety backup/i }));
    await screen.findByLabelText(/i have saved my safety backup/i);
    fireEvent.click(screen.getByRole('button', { name: /confirm complete replacement/i }));
    expect(replaceRestoreMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/i have saved my safety backup/i));
    fireEvent.click(screen.getByRole('button', { name: /confirm complete replacement/i }));
    await waitFor(() => expect(replaceRestoreMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/finished and verified/i));
    expect(input).toHaveValue('');
  });

  it('cancels without replacement and redacts raw failures', async () => {
    prepareReplaceRestoreMock.mockReturnValue({
      format: 'version-2',
      incomingCounts: {},
      expectedPostRestoreCounts: {},
      backup: {},
    });
    await openSystemDataTab();
    const input = screen.getByLabelText(/select version 2 complete backup json/i);
    fireEvent.change(input, {
      target: { files: [new File(['{}'], 'complete.json', { type: 'application/json' })] },
    });
    await screen.findByLabelText(/version 2 restore confirmation/i);
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(replaceRestoreMock).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/cancelled.*no data was changed/i);

    prepareReplaceRestoreMock.mockImplementation(() => {
      throw new Error('sk-private-provider-secret');
    });
    fireEvent.change(input, {
      target: { files: [new File(['{}'], 'bad.json', { type: 'application/json' })] },
    });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      /could not be completed safely/i,
    ));
    expect(screen.queryByText(/sk-private-provider-secret/i)).not.toBeInTheDocument();
  });

  it.each([
    ['a different selected path', 'D:\\backups\\other.json', '{"saved":true}'],
    ['modified saved content', 'D:\\backups\\safety.json', '{"saved":false}'],
  ])('blocks Electron replacement when readback has %s', async (_case, filePath, content) => {
    desktopRuntime.enabled = true;
    prepareReplaceRestoreMock.mockReturnValue({
      format: 'version-2',
      incomingCounts: {},
      expectedPostRestoreCounts: {},
      backup: {},
    });
    desktopSaveFileMock.mockResolvedValue({
      cancelled: false,
      filePath: 'D:\\backups\\safety.json',
    });
    desktopOpenFileMock.mockResolvedValue({ cancelled: false, filePath, content });
    createPreRestoreSafetyBackupMock.mockImplementation(async (delivery) => {
      const delivered = await delivery.deliver('{"saved":true}', 'safety.json');
      if (!delivered) throw new Error('Safety backup verification failed.');
      return {
        kind: 'verified-safety-backup',
        runtime: 'electron',
        completedAt: '2026-07-25T00:00:00.000Z',
      };
    });
    await openSystemDataTab();
    const input = screen.getByLabelText(/select version 2 complete backup json/i);
    fireEvent.change(input, {
      target: { files: [new File(['{}'], 'complete.json', { type: 'application/json' })] },
    });
    await screen.findByLabelText(/version 2 restore confirmation/i);

    fireEvent.click(screen.getByRole('button', { name: /create required safety backup/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      /could not be completed safely/i,
    ));
    expect(screen.queryByLabelText(/i have saved my safety backup/i)).not.toBeInTheDocument();
    expect(replaceRestoreMock).not.toHaveBeenCalled();
  });

  it('accepts Electron safety delivery only after exact saved-file readback validation', async () => {
    desktopRuntime.enabled = true;
    prepareReplaceRestoreMock.mockReturnValue({
      format: 'version-2',
      incomingCounts: {},
      expectedPostRestoreCounts: {},
      backup: {},
    });
    desktopSaveFileMock.mockResolvedValue({
      cancelled: false,
      filePath: 'D:\\backups\\safety.json',
    });
    desktopOpenFileMock.mockResolvedValue({
      cancelled: false,
      filePath: 'D:\\backups\\safety.json',
      content: '{"saved":true}',
    });
    createPreRestoreSafetyBackupMock.mockImplementation(async (delivery) => {
      const delivered = await delivery.deliver('{"saved":true}', 'safety.json');
      if (!delivered) throw new Error('Safety backup verification failed.');
      return {
        kind: 'verified-safety-backup',
        runtime: 'electron',
        completedAt: '2026-07-25T00:00:00.000Z',
      };
    });
    await openSystemDataTab();
    const input = screen.getByLabelText(/select version 2 complete backup json/i);
    fireEvent.change(input, {
      target: { files: [new File(['{}'], 'complete.json', { type: 'application/json' })] },
    });
    await screen.findByLabelText(/version 2 restore confirmation/i);

    fireEvent.click(screen.getByRole('button', { name: /create required safety backup/i }));

    await screen.findByLabelText(/i have saved my safety backup/i);
    expect(desktopSaveFileMock).toHaveBeenCalledOnce();
    expect(desktopOpenFileMock).toHaveBeenCalledOnce();
    expect(prepareReplaceRestoreMock).toHaveBeenCalledTimes(2);
    expect(replaceRestoreMock).not.toHaveBeenCalled();
  });
});
