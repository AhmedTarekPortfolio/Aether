import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreparedLegacyImport } from '../backupService';

const {
  exportFullBackupMock,
  createPreRestoreSafetyBackupMock,
  importLegacyBackupMock,
  parseBackupJsonMock,
  prepareLegacyImportMock,
  prepareReplaceRestoreMock,
  replaceRestoreMock,
} = vi.hoisted(() => ({
  exportFullBackupMock: vi.fn(),
  createPreRestoreSafetyBackupMock: vi.fn(),
  importLegacyBackupMock: vi.fn(),
  parseBackupJsonMock: vi.fn(),
  prepareLegacyImportMock: vi.fn(),
  prepareReplaceRestoreMock: vi.fn(),
  replaceRestoreMock: vi.fn(),
}));

vi.mock('../backupService', () => ({
  exportFullBackup: exportFullBackupMock,
  createPreRestoreSafetyBackup: createPreRestoreSafetyBackupMock,
  getBackupErrorMessage: () => 'Complete backup validation failed safely.',
  getLegacyImportErrorMessage: () => (
    'Legacy workspace import could not be completed safely. No credential details were exposed.'
  ),
  getReplaceRestoreErrorMessage: () => 'Version 2 restore failed safely.',
  importLegacyBackup: importLegacyBackupMock,
  parseBackupJson: parseBackupJsonMock,
  prepareLegacyImport: prepareLegacyImportMock,
  prepareReplaceRestore: prepareReplaceRestoreMock,
  replaceRestore: replaceRestoreMock,
}));

vi.mock('../../components/ai/ModelSettingsModal', () => ({
  ModelSettingsModal: () => null,
}));

import { SettingsView } from '../../views/SettingsView';

const incomingCounts = {
  users: 1,
  settings: 1,
  subjects: 1,
  topics: 1,
  tasks: 2,
  notes: 1,
  flashcards: 1,
  sessions: 1,
};

const preparedImport = {
  format: 'legacy-v1',
  data: {},
  warnings: ['The legacy exportedAt timestamp was missing.'],
  summary: {
    incomingCounts,
    replacementCounts: {
      users: 1,
      settings: 0,
      subjects: 0,
      topics: 0,
      tasks: 1,
      notes: 0,
      flashcards: 0,
      sessions: 0,
    },
    newCounts: {
      users: 0,
      settings: 1,
      subjects: 1,
      topics: 1,
      tasks: 1,
      notes: 1,
      flashcards: 1,
      sessions: 1,
    },
    totalIncoming: 9,
  },
} as PreparedLegacyImport;

function legacyFile(contents = '{"users":[]}'): File {
  const file = new File([contents], 'legacy.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', {
    configurable: true,
    value: vi.fn().mockResolvedValue(contents),
  });
  return file;
}

async function openSystemDataTab(): Promise<HTMLInputElement> {
  render(
    <SettingsView
      userProfile={null}
      onUpdateProfile={vi.fn().mockResolvedValue(undefined)}
      refreshFromIndexedDb={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /system preferences & data/i }));
  return screen.getByLabelText(/select legacy workspace json/i) as HTMLInputElement;
}

async function selectAndPrepare(input: HTMLInputElement): Promise<void> {
  fireEvent.change(input, { target: { files: [legacyFile()] } });
  await screen.findByLabelText(/legacy import confirmation/i);
}

describe('WP-05 Settings legacy-import integration', () => {
  beforeEach(() => {
    exportFullBackupMock.mockReset();
    importLegacyBackupMock.mockReset();
    parseBackupJsonMock.mockReset();
    prepareLegacyImportMock.mockReset();
    parseBackupJsonMock.mockReturnValue({ users: [] });
    prepareLegacyImportMock.mockResolvedValue(preparedImport);
    importLegacyBackupMock.mockResolvedValue({
      summary: preparedImport.summary,
      warnings: preparedImport.warnings,
    });
  });

  it('validates a selected file and shows the partial-merge summary without writing', async () => {
    const input = await openSystemDataTab();
    await selectAndPrepare(input);

    expect(parseBackupJsonMock).toHaveBeenCalledWith('{"users":[]}');
    expect(prepareLegacyImportMock).toHaveBeenCalledWith({ users: [] });
    expect(importLegacyBackupMock).not.toHaveBeenCalled();
    expect(screen.getByText(/confirm partial merge of 9 records/i)).toBeInTheDocument();
    expect(screen.getByText(/matching ids will be replaced/i)).toBeInTheDocument();
    expect(screen.getByText(
      /goals, ai conversations, statistics, achievement definitions, user achievements, and notifications are untouched/i,
    ))
      .toBeInTheDocument();
    expect(screen.getByText(/exportedat timestamp was missing/i)).toBeInTheDocument();
  });

  it('cancels a prepared import without writing', async () => {
    const input = await openSystemDataTab();
    await selectAndPrepare(input);

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(importLegacyBackupMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/legacy import confirmation/i)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/cancelled.*no data was changed/i);
  });

  it('writes only after confirmation and reports success only after verification completes', async () => {
    let finishImport: (() => void) | undefined;
    importLegacyBackupMock.mockImplementation(() => new Promise((resolve) => {
      finishImport = () => resolve({
        summary: preparedImport.summary,
        warnings: preparedImport.warnings,
      });
    }));
    const input = await openSystemDataTab();
    await selectAndPrepare(input);

    fireEvent.click(screen.getByRole('button', { name: /confirm legacy import/i }));

    expect(importLegacyBackupMock).toHaveBeenCalledWith(preparedImport);
    expect(screen.getByRole('button', { name: /importing and verifying/i })).toBeDisabled();
    expect(screen.queryByText(/import verified/i)).not.toBeInTheDocument();

    finishImport?.();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      /legacy workspace import verified for 9 incoming records/i,
    ));
  });

  it('redacts preparation failures and never offers confirmation', async () => {
    prepareLegacyImportMock.mockRejectedValue(new Error('sk-private-provider-secret'));
    const input = await openSystemDataTab();

    fireEvent.change(input, { target: { files: [legacyFile()] } });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      /could not be completed safely/i,
    ));
    expect(screen.queryByText(/sk-private-provider-secret/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/legacy import confirmation/i)).not.toBeInTheDocument();
    expect(importLegacyBackupMock).not.toHaveBeenCalled();
  });

  it('resets the file input so the same file can be selected again', async () => {
    const input = await openSystemDataTab();
    const file = legacyFile();

    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByLabelText(/legacy import confirmation/i);
    await waitFor(() => expect(input).toHaveValue(''));

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(prepareLegacyImportMock).toHaveBeenCalledTimes(2));
  });

  it('keeps complete backup export, legacy import, and Version 2 restore separate', async () => {
    await openSystemDataTab();

    expect(screen.getByRole('button', { name: /create complete backup.*version 2/i }))
      .toBeInTheDocument();
    expect(screen.getByText(/this is not a complete restore/i)).toBeInTheDocument();
    expect(screen.getByText(/restore complete backup.*version 2/i)).toBeInTheDocument();
  });
});
