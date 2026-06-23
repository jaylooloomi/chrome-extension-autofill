// Minimal in-memory chrome.storage.local mock for tests.

export interface ChromeMock {
  store: Record<string, unknown>;
  reset(): void;
}

export function installChromeMock(): ChromeMock {
  const store: Record<string, unknown> = {};
  const local = {
    async get(keys?: string | string[] | null) {
      if (keys == null) return { ...store };
      if (typeof keys === 'string') return { [keys]: store[keys] };
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = store[k];
      return out;
    },
    async set(obj: Record<string, unknown>) {
      Object.assign(store, obj);
    },
    async remove(key: string) {
      delete store[key];
    },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local } };
  return {
    store,
    reset() {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}
