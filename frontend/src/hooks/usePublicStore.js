import { useCallback, useEffect, useRef, useState } from 'react';
import { publicStoreApi } from '../services/publicStoreApi.js';
import { isCancelled, isTransient } from '../utils/requestPolicy.js';

const online = () => globalThis.navigator?.onLine !== false;
const initial = key => ({ key, data: null, loading: true, refreshing: false, error: null, offline: !online(), retryAt: 0 });

export function usePublicStore(slug, productId) {
  const key = JSON.stringify([slug, productId || null]);
  const [stored, setStored] = useState(() => initial(key));
  const loader = useRef(null);
  const state = stored.key === key ? stored : initial(key);
  useEffect(() => {
    let active = true, inFlight = false, retryAt = 0;
    const controller = new AbortController();
    const patch = update => { if (active) setStored(current => update(current.key === key ? current : initial(key))); };
    const load = async () => {
      if (inFlight || !active || Date.now() < retryAt) return;
      inFlight = true;
      patch(current => ({ ...current, loading: !current.data, refreshing: Boolean(current.data), error: null, offline: !online() }));
      try {
        const data = await publicStoreApi.read(slug, productId, controller.signal);
        patch(current => ({ ...current, data, loading: false, refreshing: false, error: null, offline: !online(), retryAt: 0 }));
      } catch (error) {
        if (controller.signal.aborted || isCancelled(error)) return;
        retryAt = error.retryAfterMs ? Date.now() + error.retryAfterMs : 0;
        patch(current => ({ ...current, data: isTransient(error) ? current.data : null, loading: false, refreshing: false, error, offline: !online(), retryAt }));
      } finally { inFlight = false; }
    };
    loader.current = load;
    const connected = () => { patch(current => ({ ...current, offline: false })); void load(); };
    const disconnected = () => patch(current => ({ ...current, offline: true }));
    globalThis.addEventListener?.('online', connected); globalThis.addEventListener?.('offline', disconnected);
    void load();
    return () => {
      active = false; controller.abort(); if (loader.current === load) loader.current = null;
      globalThis.removeEventListener?.('online', connected); globalThis.removeEventListener?.('offline', disconnected);
    };
  }, [slug, productId, key]);
  const reload = useCallback(() => { void loader.current?.(); }, []);
  return { ...state, reload };
}
