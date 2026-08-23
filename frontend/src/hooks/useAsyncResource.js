import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsyncResource(factory, deps = [], options = {}) {
  const [state, setState] = useState({ loading: true, error: null, data: undefined });
  const [revision, setRevision] = useState(0);
  const factoryRef = useRef(factory);
  useEffect(() => {
    factoryRef.current = factory;
  }, [factory]);
  const pollMs = Math.max(0, Number(options.pollMs || 0));
  const keepPreviousData = Boolean(options.keepPreviousData);
  const pollWhenHidden = Boolean(options.pollWhenHidden);
  const refreshOnFocus = options.refreshOnFocus !== false;

  useEffect(() => {
    let mounted = true;
    let inFlight = false;
    let timer = null;

    const schedule = () => {
      if (!mounted || pollMs <= 0) return;
      if (timer) globalThis.clearTimeout(timer);
      timer = globalThis.setTimeout(load, pollMs);
    };

    const load = () => {
      if (!mounted || inFlight) return;
      if (!pollWhenHidden && globalThis.document?.hidden) {
        schedule();
        return;
      }
      inFlight = true;
      setState((current) => (keepPreviousData
        ? { ...current, loading: current.data === undefined, error: null }
        : { loading: true, error: null, data: undefined }));

      Promise.resolve()
        .then(() => factoryRef.current())
        .then((data) => {
          if (mounted) setState({ loading: false, error: null, data });
        })
        .catch((error) => {
          if (mounted) setState((current) => ({ loading: false, error, data: keepPreviousData ? current.data : undefined }));
        })
        .finally(() => {
          inFlight = false;
          schedule();
        });
    };

    const onVisible = () => {
      if (!globalThis.document?.hidden) load();
    };

    load();
    if (refreshOnFocus) {
      globalThis.addEventListener?.('focus', onVisible);
      globalThis.document?.addEventListener('visibilitychange', onVisible);
    }

    return () => {
      mounted = false;
      if (timer) globalThis.clearTimeout(timer);
      if (refreshOnFocus) {
        globalThis.removeEventListener?.('focus', onVisible);
        globalThis.document?.removeEventListener('visibilitychange', onVisible);
      }
    };
    // Callers pass explicit dependencies to avoid request loops from inline factories.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, pollMs, keepPreviousData, pollWhenHidden, refreshOnFocus, revision]);

  const reload = useCallback(() => setRevision((current) => current + 1), []);
  const updateData = useCallback((updater) => {
    setState((current) => ({
      ...current,
      data: typeof updater === 'function' ? updater(current.data) : updater,
    }));
  }, []);

  return { ...state, reload, updateData };
}
