import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { tryonApi } from '../services/tryonApi.js';
import { preparePersonImage } from '../utils/personImage.js';
import { activeTryonStates, newerOutput } from '../utils/tryon.js';

const initial = (owner) => ({
  owner, job: null, latest: null, sending: false, ready: false, error: '', historyError: '',
  terms: null, checkingTerms: false,
  history: { items: [], pagination: { page: 1, total: 0, totalPages: 1 } },
});
function reducer(state, action) {
  if (action.type === 'scope') return initial(action.owner);
  if (state.owner !== action.owner) return state;
  if (action.type === 'history') return {
    ...state, ready: true, historyError: '', history: action.value, latest: action.value.latest,
    job: action.value.active_job || state.job,
  };
  if (action.type === 'completed') return { ...state, latest: newerOutput(state.latest, action.value) };
  return { ...state, ...action.patch };
}

export function useTryon() {
  const { token, loading: authLoading } = useAuth();
  const [stored, dispatch] = useReducer(reducer, token, initial);
  // Never render another account's cached result, even before the scope-change effect runs.
  const state = stored.owner === token ? stored : initial(token);
  const startLock = useRef(null);
  const keyRef = useRef({ owner: token, key: null });
  const alive = useRef(true);
  const completed = useRef(new Set());
  const historyVersion = useRef(0);
  const patch = (value) => dispatch({ owner: token, patch: value });

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    dispatch({ type: 'scope', owner: token });
    keyRef.current = { owner: token, key: null };
    startLock.current = null;
  }, [token]);

  const loadHistory = useCallback(async (page = 1) => {
    const version = ++historyVersion.current;
    try {
      const value = await tryonApi.history(page, token);
      if (alive.current && version === historyVersion.current) dispatch({ type: 'history', owner: token, value });
    } catch (requestError) {
      if (alive.current && version === historyVersion.current) dispatch({
        owner: token, patch: { historyError: requestError.message || 'دریافت سوابق انجام نشد.', ready: true },
      });
    }
  }, [token]);

  useEffect(() => { if (!authLoading) void loadHistory(); }, [authLoading, loadHistory]);

  const job = state.job;
  const jobId = job?.id;
  const jobStatus = job?.status;
  const retryAfter = job?.retry_after;
  const canRetry = job?.retryable;
  useEffect(() => {
    if (!jobId || !activeTryonStates.has(jobStatus)) return undefined;
    let active = true, timer;
    const controller = new AbortController();
    async function poll() {
      if (!active) return;
      try {
        const next = await tryonApi.job(jobId, token, controller.signal);
        if (active) dispatch({ owner: token, patch: { job: next, error: '' } });
      } catch (requestError) {
        if (active && !controller.signal.aborted) dispatch({
          owner: token, patch: { error: requestError.message || 'دریافت وضعیت کامل نشد؛ همان عملیات پیگیری می‌شود.' },
        });
      }
      if (active) timer = setTimeout(poll, document.hidden ? 8000 : 2000);
    }
    timer = setTimeout(poll, 1200);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [jobId, jobStatus, token]);

  useEffect(() => {
    if (job?.status !== 'completed' || completed.current.has(job.id)) return;
    completed.current.add(job.id);
    dispatch({ type: 'completed', owner: token, value: job });
    void loadHistory();
  }, [job, token, loadHistory]);

  const start = async ({ slug, productId, image, imageIndex, acceptTermsVersion }) => {
    if (startLock.current?.owner === token || activeTryonStates.has(job?.status)) return;
    if (!image) { patch({ error: 'تصویر خود را انتخاب کنید.' }); return; }
    const lock = { owner: token };
    startLock.current = lock;
    patch({ checkingTerms: true, error: '' });
    let key, submitted = false;
    try {
      const terms = acceptTermsVersion
        ? await tryonApi.acceptTerms(acceptTermsVersion, token) : await tryonApi.terms(token);
      if (!alive.current) return;
      if (terms.required) { patch({ terms }); return; }
      patch({ terms: null, checkingTerms: false, sending: true });
      if (keyRef.current.owner !== token) keyRef.current = { owner: token, key: null };
      keyRef.current.key ||= crypto.randomUUID();
      key = keyRef.current.key;
      const prepared = await preparePersonImage(image);
      if (!alive.current) return;
      submitted = true;
      const result = await tryonApi.start(slug, productId, {
        image: prepared, image_index: imageIndex, request_key: key,
        diagnostics_consent: false,
      }, token);
      if (alive.current) patch({ job: result });
    } catch (requestError) {
      if (!submitted) {
        if (alive.current) patch({ error: requestError.message || 'بررسی قوانین کامل نشد؛ دوباره امتحان کنید.' });
        return;
      }
      try {
        // A lost POST response must recover the same operation, rather than issue another charge.
        const recovered = requestError.code === 'TRYON_ALREADY_ACTIVE' && requestError.job_id
          ? await tryonApi.job(requestError.job_id, token) : await tryonApi.byRequest(key, token);
        if (alive.current) patch({ job: recovered });
      } catch {
        if (alive.current) patch({ error: requestError.message || 'وضعیت درخواست قطعی نشد؛ تلاش مجدد همین درخواست را پیگیری می‌کند.' });
      }
    } finally {
      if (startLock.current === lock) startLock.current = null;
      if (alive.current) patch({ sending: false, checkingTerms: false });
    }
  };

  useEffect(() => {
    if (!retryAfter || activeTryonStates.has(jobStatus) || canRetry) return undefined;
    const remaining = new Date(retryAfter).getTime() - Date.now();
    if (!Number.isFinite(remaining)) return undefined;
    const timer = setTimeout(() => {
      tryonApi.job(jobId, token).then((value) => {
        if (alive.current) dispatch({ owner: token, patch: { job: value } });
      }).catch((error) => {
        if (alive.current) dispatch({ owner: token, patch: { error: error.message || 'دریافت وضعیت تلاش مجدد کامل نشد.' } });
      });
    }, Math.max(1000, Math.min(remaining + 250, 86400000)));
    return () => clearTimeout(timer);
  }, [jobId, jobStatus, retryAfter, canRetry, token]);

  const retry = async () => {
    if (!job?.retryable || startLock.current?.owner === token) return;
    const lock = { owner: token };
    startLock.current = lock;
    patch({ sending: true, error: '' });
    try { patch({ job: await tryonApi.retry(job.id, crypto.randomUUID(), token) }); }
    catch (requestError) { patch({ error: requestError.message || 'تلاش مجدد انجام نشد.' }); }
    finally {
      if (startLock.current === lock) startLock.current = null;
      if (alive.current) patch({ sending: false });
    }
  };

  const reset = () => {
    if (state.sending || activeTryonStates.has(job?.status)) return;
    keyRef.current = { owner: token, key: null };
    patch({ job: null, error: '' });
  };
  return {
    ...state, busy: state.sending || activeTryonStates.has(job?.status),
    start, retry, reset, loadHistory,
    dismissTerms: () => { if (!startLock.current) patch({ terms: null }); },
    progressJob: state.sending ? { status: 'validating', stage: 1, progress: 0 } : job,
  };
}
