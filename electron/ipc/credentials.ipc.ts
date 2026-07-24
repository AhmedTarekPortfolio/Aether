import { ipcMain } from 'electron';
import { IPCChannel } from '../types/ipc-contracts.js';
import { credentialService } from '../services/credentials/credential-service.js';
import { validateCredentialInput, validateString } from '../security/validate-ipc-input.js';

export function registerCredentialsIPCHandlers(): void {
  ipcMain.handle(IPCChannel.CREDENTIALS_SET, async (_event, input) => {
    const val = validateCredentialInput(input);
    if (!val.valid) {
      throw new Error(`Invalid Credential Input: ${val.error}`);
    }
    return credentialService.setCredential(input.profileId, input.apiKey, input.organizationId);
  });

  ipcMain.handle(IPCChannel.CREDENTIALS_HAS, async (_event, profileId) => {
    const val = validateString(profileId, 'profileId');
    if (!val.valid) return false;
    return !!credentialService.getApiKey(profileId);
  });

  ipcMain.handle(IPCChannel.CREDENTIALS_REMOVE, async (_event, profileId) => {
    const val = validateString(profileId, 'profileId');
    if (val.valid) {
      credentialService.removeCredential(profileId);
    }
    return;
  });

  ipcMain.handle(IPCChannel.CREDENTIALS_GET_STATUS, async (_event, profileId) => {
    const val = validateString(profileId, 'profileId');
    if (!val.valid) return { configured: false, mask: '' };
    return credentialService.getStatus(profileId);
  });
}
