import { beforeEach } from 'vitest';
import { vi } from 'vitest';

/**
 * A complete in-memory `localStorage` for tests.
 *
 * The test environment ships a partial one -- `setItem` and `getItem` are there, `clear()` is not
 * -- so a spec that tidies up between cases fails on the tidying rather than on anything it set
 * out to check. Stubbing a whole Storage keeps the real storage path under test instead of
 * mocking it away, which matters for the code that reads a value back and has to cope with it
 * being absent, malformed, or from an older shape.
 *
 * Call `useMemoryStorage()` at the top of a describe block; it installs a fresh, empty store
 * before every case.
 */
export function useMemoryStorage(): void {
  beforeEach(() => {
    let store: Record<string, string> = {};
    const storage: Storage = {
      get length() { return Object.keys(store).length; },
      clear: () => { store = {}; },
      getItem: (key: string) => (key in store ? store[key] : null),
      key: (index: number) => Object.keys(store)[index] ?? null,
      removeItem: (key: string) => { delete store[key]; },
      setItem: (key: string, value: string) => { store[key] = String(value); },
    };
    vi.stubGlobal('localStorage', storage);
  });
}
