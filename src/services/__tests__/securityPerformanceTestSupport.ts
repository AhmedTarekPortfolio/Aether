import type { MarkerStorage } from '../restoreVerificationState';

export class MemoryStorage implements MarkerStorage {
  private value: string | null = null;

  getItem(): string | null {
    return this.value;
  }

  setItem(_key: string, value: string): void {
    this.value = value;
  }

  removeItem(): void {
    this.value = null;
  }
}
