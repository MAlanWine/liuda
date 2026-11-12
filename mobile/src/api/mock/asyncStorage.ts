import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Transport } from '../types.ts';
import type { KeyValue } from './kv.ts';
import { createMockServer, createSimulatedTransport } from './server.ts';

/** The only RN-touching file of the mock: KeyValue over AsyncStorage, wired to the simulated-network transport. */
export const asyncStorageKV: KeyValue = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

export type MockTransport = { transport: Transport; notice(): string };

export function createMockTransport(kv: KeyValue = asyncStorageKV): MockTransport {
  const server = createMockServer({ kv });
  return { transport: createSimulatedTransport(server), notice: () => server.notice() };
}
