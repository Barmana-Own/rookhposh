import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { tryonApi } from '../services/tryonApi.js';
import { preparePersonImage } from '../utils/personImage.js';
import { activeTryonStates, newerOutput } from '../utils/tryon.js';
import { isCancelled, isTransient } from '../utils/requestPolicy.js';
import { useTryonConnection } from './useTryonConnection.js';
import { tryonTiming } from '../utils/tryonTiming.js';

const initial = (owner) => ({
  owner, job: null, latest: null, sending: false, ready: false, error: '', historyError: '',
  terms: null, checkingTerms: false, reconnecting: false, offline: false, trackingStopped: false, trackingRevision: 0,
  pendingRequestKey: null, recoveringJobId: null, recoveryMissing: false,
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
  const historyRequest = useRef(null);
  const pendingRequest = useRef(null);
  const pendingRetry = useRef(null);
  const patch = (value) => dispatch({ owner: token, patch: value });

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; historyRequest.current?.controller.abort(); pendingRequest.current = null; pendingRetry.current = null; };
  }, []);
  useEffect(() => {
    dispatch({ type: 'scope', owner: token });
    keyRef.current = { owner: token, key: null };
    startLock.current = null;
    historyRequest.current?.controller.abort(); historyRequest.current = null; pendingRequest.current = null; pendingRetry.current = null;
  }, [token]);

  const loadHistory = useCallback(async (page = 1, { force = false } = {}) => {
    if (!force && historyRequest.current?.owner === token && historyRequest.current.page === page) return;
    historyRequest.current?.controller.abort();
    const request = { owner: token, page, controller: new AbortController() };
    historyRequest.current = request;
    const version = ++historyVersion.current;
    try {
      const value = await tryonApi.history(page, token, request.controller.signal);
      if (alive.current && version === historyVersion.current) dispatch({ type: 'history', owner: token, value });
    } catch (requestError) {
      if (alive.current && !isCancelled(requestError) && version === historyVersion.current) dispatch({
        owner: token, patch: { historyError: requestError.message || 'دریافت سوابق انجام نشد.' },
      });
    } finally { if (historyRequest.current === request) historyRequest.current = null; }
  }, [token]);

  useEffect(() => { if (!authLoading) void loadHistory(); }, [authLoading, loadHistory]);
  useEffect(() => {
    const connected = () => { if (!authLoading) void loadHistory(); };
    globalThis.addEventListener?.('online', connected);
    return () => globalThis.removeEventListener?.('online', connected);
  }, [authLoading, loadHistory]);

  const job = state.job;
  const jobId = job?.id;
  const jobStatus = job?.status;
  const retryAfter = job?.retry_after;
  const canRetry = job?.retryable;
  useTryonConnection({ job, token, pendingKey: state.pendingRequestKey, recoveringJobId: state.recoveringJobId, revision: state.trackingRevision,
    onJob: next => {
      pendingRequest.current = null;
      if (activeTryonStates.has(next.status) || next.status === 'completed') pendingRetry.current = null;
      dispatch({ owner: token, patch: { job: next, error: '', pendingRequestKey: null, recoveringJobId: null, recoveryMissing: false, trackingStopped: false } });
    },
    onConnection: value => dispatch({ owner: token, patch: value }),
  });

  useEffect(() => {
    if (job?.status !== 'completed' || completed.current.has(job.id)) return;
    completed.current.add(job.id);
    tryonTiming('completed', job.id);
    dispatch({ type: 'completed', owner: token, value: job });
    void loadHistory(1, { force: true });
  }, [job, token, loadHistory]);

  const start = async ({ slug, productId, image, imageIndex, acceptTermsVersion }) => {
    if (startLock.current?.owner === token || state.pendingRequestKey || activeTryonStates.has(job?.status)) return;
    if (!image) { patch({ error: 'تصویر خود را انتخاب کنید.' }); return; }
    const lock = { owner: token };
    startLock.current = lock;
    patch({ checkingTerms: true, error: '' });
    let key, submitted = false;
    try {
      const terms = acceptTermsVersion
        ? await tryonApi.acceptTerms(acceptTermsVersion, token) : await tryonApi.terms(token);
      if (!alive.current || startLock.current !== lock) return;
      if (terms.required) { patch({ terms }); return; }
      patch({ terms: null, checkingTerms: false, sending: true });
      if (keyRef.current.owner !== token) keyRef.current = { owner: token, key: null };
      keyRef.current.key ||= crypto.randomUUID();
      key = keyRef.current.key;
      const preparingAt = performance.now();
      const prepared = await preparePersonImage(image);
      const preparationMs = performance.now() - preparingAt;
      if (!alive.current || startLock.current !== lock) return;
      submitted = true;
      const payload = {
        image: prepared, image_index: imageIndex, request_key: key,
        diagnostics_consent: false,
      };
      pendingRequest.current = { owner: token, slug, productId, payload };
      const submittedAt = performance.now();
      const result = await tryonApi.start(slug, productId, payload, token);
      if (alive.current && startLock.current === lock && pendingRequest.current?.owner === token) {
        tryonTiming('accepted', result.id, { preparation_ms: preparationMs, submission_ms: performance.now() - submittedAt });
        pendingRequest.current = null; patch({ job: result, pendingRequestKey: null, reconnecting: false });
      }
    } catch (requestError) {
      if (!alive.current || startLock.current !== lock) return;
      if (!submitted) {
        if (alive.current) patch({ error: requestError.message || 'بررسی قوانین کامل نشد؛ دوباره امتحان کنید.' });
        return;
      }
      try {
        // A lost POST response must recover the same operation, rather than issue another charge.
        const recovered = requestError.code === 'TRYON_ALREADY_ACTIVE' && requestError.job_id
          ? await tryonApi.job(requestError.job_id, token) : await tryonApi.byRequest(key, token);
        if (alive.current && startLock.current === lock) { pendingRequest.current = null; patch({ job: recovered, pendingRequestKey: null, reconnecting: false }); }
      } catch {
        if (alive.current && startLock.current === lock) {
          if (isTransient(requestError) && requestError.status !== 429) patch({ pendingRequestKey: key, reconnecting: true, error: '' });
          else { pendingRequest.current = null; patch({ error: requestError.message || 'درخواست انجام نشد.' }); }
        }
      }
    } finally {
      if (startLock.current === lock) {
        startLock.current = null;
        if (alive.current) patch({ sending: false, checkingTerms: false });
      }
    }
  };

  const retryPending = async () => {
    const pending = pendingRequest.current;
    if (!pending || pending.owner !== token || startLock.current?.owner === token) return;
    const lock = { owner: token }; startLock.current = lock;
    patch({ sending: true, error: '' });
    try {
      let next;
      try { next = await tryonApi.byRequest(pending.payload.request_key, token); }
      catch (error) {
        if (!alive.current || startLock.current !== lock) return;
        if (error.status !== 404) throw error;
        // An explicit user retry replays the exact immutable payload/key, after looking up the original.
        next = await tryonApi.start(pending.slug, pending.productId, pending.payload, token);
      }
      if (alive.current && startLock.current === lock) { pendingRequest.current = null; patch({ job: next, pendingRequestKey: null, reconnecting: false, recoveryMissing: false }); }
    } catch (error) {
      if (alive.current && startLock.current === lock) {
        if (isTransient(error)) patch({ reconnecting: true });
        else { pendingRequest.current = null; patch({ pendingRequestKey: null, reconnecting: false, error: error.message || 'درخواست انجام نشد.' }); }
      }
    } finally {
      if (startLock.current === lock) {
        startLock.current = null;
        if (alive.current) patch({ sending: false });
      }
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
    if (!job?.retryable || state.recoveringJobId || startLock.current?.owner === token) return;
    const lock = { owner: token };
    startLock.current = lock;
    if (pendingRetry.current?.owner !== token || pendingRetry.current?.id !== job.id) {
      pendingRetry.current = { owner: token, id: job.id, key: crypto.randomUUID() };
    }
    const request = pendingRetry.current;
    patch({ sending: true, error: '' });
    try {
      const next = await tryonApi.retry(job.id, request.key, token);
      if (alive.current && startLock.current === lock) {
        if (pendingRetry.current === request) pendingRetry.current = null;
        patch({ job: next, recoveringJobId: null, reconnecting: false });
      }
    }
    catch (requestError) {
      if (alive.current && startLock.current === lock) {
        // A stale terminal GET cannot prove that a lost retry POST was never accepted.
        // Retain its key until a positive acknowledgement, so explicit replay cannot reserve twice.
        if (isTransient(requestError)) patch({ recoveringJobId: job.id, reconnecting: true });
        else {
          if (pendingRetry.current === request) pendingRetry.current = null;
          patch({ error: requestError.message || 'تلاش مجدد انجام نشد.' });
        }
      }
    }
    finally {
      if (startLock.current === lock) {
        startLock.current = null;
        if (alive.current) patch({ sending: false });
      }
    }
  };

  const reset = () => {
    if (state.sending || state.pendingRequestKey || state.recoveringJobId || activeTryonStates.has(job?.status)) return;
    keyRef.current = { owner: token, key: null };
    pendingRetry.current = null;
    patch({ job: null, error: '', reconnecting: false });
  };
  return {
    ...state, busy: state.sending || Boolean(state.pendingRequestKey || state.recoveringJobId) || activeTryonStates.has(job?.status),
    start, retry, retryPending, reset, loadHistory,
    retryTracking: () => patch({ trackingStopped: false, error: '', trackingRevision: state.trackingRevision + 1 }),
    dismissTerms: () => { if (!startLock.current) patch({ terms: null }); },
    progressJob: state.pendingRequestKey || state.recoveringJobId ? { status: 'validating', stage: 1, progress: null, indeterminate: true }
      : state.sending ? { status: 'validating', stage: 1, progress: 0 } : job,
  };
}
