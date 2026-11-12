import { useCallback, useRef, useState } from 'react';
import { api, ApiError, isApiError, type BlockEntry } from '../api';
import { retryOnNetwork, unblock } from './actions';
import { useBus } from './bus';

const toApiError = (error: unknown) => isApiError(error) ? error as ApiError : new ApiError('SERVICE_UNAVAILABLE');

/**
 * 已屏蔽 list for the signed-in account: `{ blocks (null until first load), loading, error, refresh, remove }`.
 * Refetches on `session` / `demo`; call `refresh()` on focus. `remove(blockId)` unblocks, drops the row at once, then refetches.
 */
export function useBlocks(): {
  blocks: BlockEntry[] | null; loading: boolean; error: ApiError | null;
  refresh(): Promise<void>; remove(blockId: string): Promise<void>;
} {
  const [blocks, setBlocks] = useState<BlockEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const res = await retryOnNetwork(() => api.blocks({}));
      if (n !== seq.current) return;
      setBlocks(res.blocks);
      setError(null);
    } catch (e) {
      if (n === seq.current) setError(toApiError(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);

  const remove = useCallback(async (blockId: string) => {
    await unblock(blockId);
    setBlocks(list => list ? list.filter(b => b.id !== blockId) : list);
    refresh();
  }, [refresh]);

  useBus(['session', 'demo'], () => { refresh(); });
  return { blocks, loading, error, refresh, remove };
}
