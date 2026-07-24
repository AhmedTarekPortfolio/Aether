import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ALGORITHM = 'aes-256-gcm';

function getStorePath(): string {
  const homeDir = os.homedir();
  const aetherDir = path.join(homeDir, '.aether');
  if (!fs.existsSync(aetherDir)) {
    fs.mkdirSync(aetherDir, { recursive: true });
  }
  return path.join(aetherDir, 'ai-credentials.json');
}

function deriveKey(): Buffer {
  const salt = os.hostname() + os.userInfo().username + 'aether-ai-v1';
  return crypto.scryptSync('aether-ai-secret-key-base', salt, 32);
}

function encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(16);
  const key = deriveKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return { encrypted, iv: iv.toString('hex'), authTag };
}

function decrypt(encrypted: string, ivHex: string, authTagHex: string): string {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = deriveKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function maskKey(key: string): string {
  if (!key || key.length <= 4) return '••••••••';
  return '••••••••' + key.slice(-4);
}

interface CredentialEntry {
  encryptedKey: string;
  iv: string;
  authTag: string;
  encryptedOrgId: string | null;
  orgIv: string | null;
  orgAuthTag: string | null;
  mask: string;
  updatedAt: number;
}

interface CredentialStore {
  profiles: Record<string, CredentialEntry>;
}

function readStore(): CredentialStore {
  const storePath = getStorePath();
  if (!fs.existsSync(storePath)) {
    return { profiles: {} };
  }
  try {
    const data = fs.readFileSync(storePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to read credential store', err);
    return { profiles: {} };
  }
}

function writeStore(store: CredentialStore): void {
  const storePath = getStorePath();
  try {
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write credential store', err);
  }
}

export function getApiKey(profileId: string): string | null {
  const store = readStore();
  const entry = store.profiles[profileId];
  if (!entry) return null;
  try {
    return decrypt(entry.encryptedKey, entry.iv, entry.authTag);
  } catch (e) {
    return null;
  }
}

export function getOrganizationId(profileId: string): string | null {
  const store = readStore();
  const entry = store.profiles[profileId];
  if (!entry || !entry.encryptedOrgId || !entry.orgIv || !entry.orgAuthTag) return null;
  try {
    return decrypt(entry.encryptedOrgId, entry.orgIv, entry.orgAuthTag);
  } catch (e) {
    return null;
  }
}

export function saveCredential(profileId: string, apiKey: string, organizationId?: string): void {
  const store = readStore();
  
  const keyEnc = encrypt(apiKey);
  let entry: CredentialEntry = {
    encryptedKey: keyEnc.encrypted,
    iv: keyEnc.iv,
    authTag: keyEnc.authTag,
    encryptedOrgId: null,
    orgIv: null,
    orgAuthTag: null,
    mask: maskKey(apiKey),
    updatedAt: Date.now()
  };

  if (organizationId) {
    const orgEnc = encrypt(organizationId);
    entry.encryptedOrgId = orgEnc.encrypted;
    entry.orgIv = orgEnc.iv;
    entry.orgAuthTag = orgEnc.authTag;
  }

  store.profiles[profileId] = entry;
  writeStore(store);
}

export function deleteCredential(profileId: string): void {
  const store = readStore();
  if (store.profiles[profileId]) {
    delete store.profiles[profileId];
    writeStore(store);
  }
}

export function getCredentialStatus(profileId: string): { configured: boolean; mask: string } {
  const store = readStore();
  const entry = store.profiles[profileId];
  if (entry) {
    return { configured: true, mask: entry.mask };
  }
  return { configured: false, mask: '' };
}
