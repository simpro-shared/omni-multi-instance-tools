import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { deriveKey, encrypt, decrypt, randomSalt, SIZES } from './crypto.js';
import type { Instance, InstancePublic, PostMigrationAction } from '../../shared/types.js';

interface VaultData {
  version: 1;
  instances: Instance[];
}

const VAULT_PATH = process.env.VAULT_PATH ?? './data/vault.enc';

let derivedKey: Buffer | null = null;
let salt: Buffer | null = null;
let cache: VaultData | null = null;

export const vaultPath = (): string => VAULT_PATH;
export const isUnlocked = (): boolean => derivedKey !== null;
export const vaultExists = (): boolean => existsSync(VAULT_PATH);

export function lock(): void {
  if (derivedKey) derivedKey.fill(0);
  derivedKey = null;
  cache = null;
  salt = null;
}

export function unlock(passphrase: string): void {
  mkdirSync(dirname(VAULT_PATH), { recursive: true });
  if (!existsSync(VAULT_PATH)) {
    salt = randomSalt();
    derivedKey = deriveKey(passphrase, salt);
    cache = { version: 1, instances: [] };
    persist();
    return;
  }
  const blob = readFileSync(VAULT_PATH);
  const fileSalt = blob.subarray(0, SIZES.SALT_LEN);
  const payload = blob.subarray(SIZES.SALT_LEN);
  const key = deriveKey(passphrase, fileSalt);
  const json = decrypt(payload, key);
  const parsed = JSON.parse(json) as VaultData;
  if (parsed.version !== 1) throw new Error(`unsupported vault version: ${parsed.version}`);
  salt = Buffer.from(fileSalt);
  derivedKey = key;
  cache = parsed;
}

function persist(): void {
  if (!derivedKey || !salt || !cache) throw new Error('vault locked');
  const payload = encrypt(JSON.stringify(cache), derivedKey);
  writeFileSync(VAULT_PATH, Buffer.concat([salt, payload]), { mode: 0o600 });
}

function requireCache(): VaultData {
  if (!cache) throw new Error('vault locked');
  return cache;
}

function maskKey(k: string): string {
  if (k.length <= 8) return '••••';
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

function toPublic(i: Instance): InstancePublic {
  const { apiKey: _apiKey, ...rest } = i;
  void _apiKey;
  return { ...rest, apiKeyMasked: maskKey(i.apiKey) };
}

export function listInstances(): InstancePublic[] {
  return requireCache().instances.map(toPublic);
}

export function getInstance(id: string): Instance | undefined {
  return requireCache().instances.find(i => i.id === id);
}

export function upsertInstance(input: Omit<Instance, 'id'> & { id?: string }): InstancePublic {
  const c = requireCache();
  if (input.id) {
    const idx = c.instances.findIndex(i => i.id === input.id);
    if (idx === -1) throw new Error('instance not found');
    const existing = c.instances[idx]!;
    const merged: Instance = {
      ...existing,
      ...input,
      apiKey: input.apiKey || existing.apiKey,
      id: input.id,
    };
    c.instances[idx] = merged;
    persist();
    return toPublic(merged);
  }
  const created: Instance = { ...input, id: randomUUID() };
  c.instances.push(created);
  persist();
  return toPublic(created);
}

export function deleteInstance(id: string): void {
  const c = requireCache();
  c.instances = c.instances.filter(i => i.id !== id);
  persist();
}

export function setInstanceActions(id: string, actions: PostMigrationAction[]): void {
  const c = requireCache();
  const idx = c.instances.findIndex(i => i.id === id);
  if (idx === -1) throw new Error('instance not found');
  c.instances[idx] = { ...c.instances[idx]!, postMigrationActions: actions };
  persist();
}

export function setInstanceDashboardEnabled(id: string, enabled: boolean): void {
  const c = requireCache();
  const idx = c.instances.findIndex(i => i.id === id);
  if (idx === -1) throw new Error('instance not found');
  c.instances[idx] = { ...c.instances[idx]!, dashboardEnabled: enabled };
  persist();
}

