import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exportFullBackupMock } = vi.hoisted(() => ({
  exportFullBackupMock: vi.fn(),
}));

vi.mock('../backupService', () => ({
  exportFullBackup: exportFullBackupMock,
  getBackupErrorMessage: () => 'Complete backup validation failed safely.',
}));

vi.mock('../../components/ai/ModelSettingsModal', () => ({
  ModelSettingsModal: () => null,
}));

import { SettingsView } from '../../views/SettingsView';

describe('WP-04 Settings complete-backup integration', () => {
  beforeEach(() => {
    exportFullBackupMock.mockReset();
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

    fireEvent.click(screen.getByRole('button', { name: /export complete version 2 backup/i }));
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

    fireEvent.click(screen.getByRole('button', { name: /export complete version 2 backup/i }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      /historical AI provider association.*ai-safe/i,
    ));
  });

  it('shows a redacted error and never claims success when export is blocked', async () => {
    exportFullBackupMock.mockRejectedValue(new Error('sk-private-value'));
    await openSystemDataTab();

    fireEvent.click(screen.getByRole('button', { name: /export complete version 2 backup/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      'Complete backup validation failed safely.',
    ));
    expect(screen.queryByText(/download started/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sk-private-value/i)).not.toBeInTheDocument();
  });

  it('adds no restore or import controls', async () => {
    await openSystemDataTab();
    expect(screen.queryByRole('button', { name: /restore|import/i })).not.toBeInTheDocument();
  });
});
