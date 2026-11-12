/** Minimal async key-value store (AsyncStorage-compatible subset). */
export type KeyValue = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type MemoryKV = KeyValue & { readonly data: Map<string, string> };

/** In-memory KeyValue for tests; `initial` pre-populates keys. */
export function createMemoryKV(initial?: Record<string, string>): MemoryKV {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    data,
    async getItem(key) { return data.has(key) ? (data.get(key) as string) : null; },
    async setItem(key, value) { data.set(key, String(value)); },
    async removeItem(key) { data.delete(key); },
  };
}
