import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    exportFullBackupMock.mockReset();
    prepareReplaceRestoreMock.mockReset();
    createPreRestoreSafetyBackupMock.mockReset();
    replaceRestoreMock.mockReset();
    desktopRuntime.enabled = false;
    desktopSaveFileMock.mockReset();
    desktopOpenFileMock.mockReset();
  });

  async function openSystemDataTab(): Promise<void> {
    render(
      <SettingsView
        userProfile={null}
        onUpdateProfile={vi.fn().mockResolvedValue(undefined)}
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
