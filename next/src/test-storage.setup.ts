import { beforeEach } from 'vitest';

/**
 * Every spec gets a complete, empty localStorage (owner 2026-10-27: table sorts are remembered per viewer).
 *
 * The test environment ships a partial localStorage -- Node's own, started without a file, has no clear() -- so a spec
 * that reset what a table remembered threw before it ran, and anything remembered leaked from one test to the next.
 * An in-memory Storage, emptied before each test, makes "remembered" testable and every test start from nothing.
 * view-toggle.spec.ts stubs its own the same way and keeps working.
 */
const store = new Map<string, string>();
const memoryStorage: Storage = {
  get length() { return store.size; },
  clear: () => store.clear(),
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  key: (index: number) => [...store.keys()][index] ?? null,
  removeItem: (key: string) => { store.delete(key); },
  setItem: (key: string, value: string) => { store.set(key, String(value)); },
};

Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true, writable: true });
if (typeof window !== 'undefined' && window !== globalThis) {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true, writable: true });
}

beforeEach(() => store.clear());
