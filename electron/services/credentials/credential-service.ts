import { safeStorage, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

interface StoredCredential {
  encryptedKey: string; // Base64 safeStorage string or hex AES string
  encryptedOrgId?: string;
  isSafeStorage: boolean;
  mask: string;
  updatedAt: number;
}

interface CredentialFileStore {
  version: number;
  credentials: Record<string, StoredCredential>;
}

export class CredentialService {
  private memoryCache: Map<string, { apiKey: string; organizationId?: string }> = new Map();
  private storePath: string;

  constructor() {
    const userData = app?.getPath ? app.getPath('userData') : path.join(os.homedir(), '.aether');
    if (!fs.existsSync(userData)) {
      fs.mkdirSync(userData, { recursive: true });
    }
    this.storePath = path.join(userData, 'desktop-credentials.json');
  }

  private maskKey(key: string): string {
    if (!key || key.trim() === '') return '';
    const trimmed = key.trim();
    if (trimmed.length <= 4) return '••••';
    return `••••••••${trimmed.slice(-4)}`;
  }

  private getFallbackKey(): Buffer {
    const salt = os.hostname() + os.userInfo().username + 'aether-desktop-v1';
    return crypto.scryptSync('aether-desktop-secret-key-base', salt, 32);
  }

  private fallbackEncrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = this.getFallbackKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let enc = cipher.update(text, 'utf8', 'hex');
    enc += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${enc}`;
  }

  private fallbackDecrypt(text: string): string {
    const parts = text.split(':');
    if (parts.length !== 3) return '';
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const enc = parts[2];
    const key = this.getFallbackKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let dec = decipher.update(enc, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  }

  private readStore(): CredentialFileStore {
    if (!fs.existsSync(this.storePath)) {
      return { version: 1, credentials: {} };
    }
    try {
      const data = fs.readFileSync(this.storePath, 'utf8');
      return JSON.parse(data);
    } catch {
      return { version: 1, credentials: {} };
    }
  }

  private writeStore(store: CredentialFileStore): void {
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf8');
    } catch (err) {
      throw new Error('Credential store could not be written.');
    }
  }

  public setCredential(profileId: string, apiKey: string, organizationId?: string): { success: boolean; mask: string } {
    if (!profileId || !apiKey) {
      return { success: false, mask: '' };
    }

    const trimmedKey = apiKey.trim();
    const trimmedOrg = organizationId?.trim();
    const mask = this.maskKey(trimmedKey);

    // Save encrypted to disk
    const canUseSafeStorage = safeStorage.isEncryptionAvailable();
    let encryptedKey: string;
    let encryptedOrgId: string | undefined;

    if (canUseSafeStorage) {
      encryptedKey = safeStorage.encryptString(trimmedKey).toString('base64');
      if (trimmedOrg) {
        encryptedOrgId = safeStorage.encryptString(trimmedOrg).toString('base64');
      }
    } else {
      encryptedKey = this.fallbackEncrypt(trimmedKey);
      if (trimmedOrg) {
        encryptedOrgId = this.fallbackEncrypt(trimmedOrg);
      }
    }

    const store = this.readStore();
    store.credentials[profileId] = {
      encryptedKey,
      encryptedOrgId,
      isSafeStorage: canUseSafeStorage,
      mask,
      updatedAt: Date.now(),
    };

    this.writeStore(store);
    this.memoryCache.set(profileId, { apiKey: trimmedKey, organizationId: trimmedOrg });
    return { success: true, mask };
  }

  public getApiKey(profileId: string): string | null {
    if (!profileId) return null;

    // Check memory cache
    if (this.memoryCache.has(profileId)) {
      return this.memoryCache.get(profileId)?.apiKey || null;
    }

    // Read from disk store
    const store = this.readStore();
    const entry = store.credentials[profileId];
    if (!entry) return null;

    try {
      let apiKey = '';
      if (entry.isSafeStorage && safeStorage.isEncryptionAvailable()) {
        const buf = Buffer.from(entry.encryptedKey, 'base64');
        apiKey = safeStorage.decryptString(buf);
      } else {
        apiKey = this.fallbackDecrypt(entry.encryptedKey);
      }

      if (apiKey) {
        this.memoryCache.set(profileId, {
          apiKey,
          organizationId: entry.encryptedOrgId ? this.getOrgId(profileId) || undefined : undefined,
        });
        return apiKey;
      }
    } catch (err) {
      console.error('[CredentialService] Decryption failed for profile:', profileId, err);
    }

    return null;
  }

  public getOrgId(profileId: string): string | null {
    if (this.memoryCache.has(profileId)) {
      return this.memoryCache.get(profileId)?.organizationId || null;
    }

    const store = this.readStore();
    const entry = store.credentials[profileId];
    if (!entry || !entry.encryptedOrgId) return null;

    try {
      if (entry.isSafeStorage && safeStorage.isEncryptionAvailable()) {
        const buf = Buffer.from(entry.encryptedOrgId, 'base64');
        return safeStorage.decryptString(buf);
      } else {
        return this.fallbackDecrypt(entry.encryptedOrgId);
      }
    } catch {
      return null;
    }
  }

  public removeCredential(profileId: string): void {
    if (!profileId) return;
    this.memoryCache.delete(profileId);
    const store = this.readStore();
    if (store.credentials[profileId]) {
      delete store.credentials[profileId];
      this.writeStore(store);
    }
  }

  public getStatus(profileId: string): { configured: boolean; mask: string } {
    if (!profileId) return { configured: false, mask: '' };

    if (this.memoryCache.has(profileId)) {
      const key = this.memoryCache.get(profileId)?.apiKey;
      return { configured: !!key, mask: key ? this.maskKey(key) : '' };
    }

    const store = this.readStore();
    const entry = store.credentials[profileId];
    if (entry) {
      return { configured: true, mask: entry.mask };
    }

    return { configured: false, mask: '' };
  }
}

export const credentialService = new CredentialService();
