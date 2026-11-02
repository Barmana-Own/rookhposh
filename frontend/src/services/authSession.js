export const AUTH_STORAGE_KEY = 'marketplace_token';
export function authFailureKind(error = {}) {
  if (error.status === 401) return 'invalid';
  if (error.status === 403) return 'forbidden';
  return 'temporary';
}
function sessionUser(value) {
  if (!value || !Number.isSafeInteger(Number(value.id)) || Number(value.id) < 1
      || !['Admin', 'Seller', 'User'].includes(value.role)) {
    throw { status: 502, message: 'پاسخ بررسی ورود معتبر نیست.' };
  }
  return value;
}
export function createAuthSession({ api, storage, setAuthToken, schedule = setTimeout, cancel = clearTimeout, retryDelays = [1000, 2000, 4000] }) {
  const token = storage.getItem(AUTH_STORAGE_KEY);
  let state = { token, user: null, status: token ? 'checking' : 'unauthenticated', error: null, attempt: 0, retryScheduled: false };
  const listeners = new Set();
  let generation = 0, inFlight = null, timer = null, retryIndex = 0, stopped = true;
  const publish = (changes) => { state = { ...state, ...changes }; for (const listener of listeners) listener(); };
  const clearTimer = () => { if (timer != null) cancel(timer); timer = null; };
  const cancelCheck = () => { generation += 1; clearTimer(); inFlight?.controller.abort(); inFlight = null; };
  const logout = () => {
    cancelCheck(); retryIndex = 0; setAuthToken(null); storage.removeItem(AUTH_STORAGE_KEY);
    publish({ token: null, user: null, status: 'unauthenticated', error: null, attempt: 0, retryScheduled: false });
  };
  const check = () => {
    if (stopped || !state.token) return Promise.resolve(null);
    if (inFlight) return inFlight.promise;
    clearTimer();
    const epoch = generation, checkedToken = state.token, controller = new AbortController();
    publish({ status: 'checking', error: null, attempt: state.attempt + 1, retryScheduled: false });
    const promise = Promise.resolve().then(() => api.get('/api/auth/me', {
      signal: controller.signal, headers: { Authorization: 'Bearer ' + checkedToken },
    })).then((response) => {
      if (stopped || epoch !== generation || checkedToken !== state.token) return null;
      const user = sessionUser(response.data?.data);
      retryIndex = 0; publish({ user, status: 'authenticated', error: null, attempt: 0 }); return user;
    }).catch((error) => {
      if (stopped || epoch !== generation || checkedToken !== state.token) return null;
      const kind = authFailureKind(error);
      if (kind === 'invalid') { logout(); return null; }
      publish({ status: 'temporarilyUnavailable', error: { ...error, kind }, retryScheduled: false });
      if (kind === 'temporary' && retryIndex < retryDelays.length) {
        const delay = retryDelays[retryIndex++];
        publish({ retryScheduled: true });
        timer = schedule(() => { timer = null; void check(); }, delay);
      }
      return null;
    }).finally(() => { if (inFlight?.epoch === epoch) inFlight = null; });
    inFlight = { epoch, controller, promise };
    return promise;
  };
  const retry = () => {
    if (inFlight) return inFlight.promise;
    retryIndex = 0; clearTimer(); return check();
  };
  const authenticate = async (request) => {
    cancelCheck(); const epoch = generation;
    const response = await request();
    if (stopped || epoch !== generation) throw { status: 0, code: 'AUTH_CANCELLED', message: 'درخواست ورود لغو شد.' };
    const payload = response.data?.data;
    if (typeof payload?.token !== 'string' || !payload.token) throw { status: 502, message: 'پاسخ ورود از سرور معتبر نیست.' };
    const user = sessionUser(payload.user);
    storage.setItem(AUTH_STORAGE_KEY, payload.token); setAuthToken(payload.token); retryIndex = 0;
    publish({ token: payload.token, user, status: 'authenticated', error: null, attempt: 0, retryScheduled: false });
    return user;
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    start() { stopped = false; setAuthToken(state.token); return check(); },
    stop() { stopped = true; cancelCheck(); },
    check, retry, logout, authenticate,
    syncFromStorage() {
      const next = storage.getItem(AUTH_STORAGE_KEY);
      if (next === state.token) return;
      if (!next) { logout(); return; }
      cancelCheck(); retryIndex = 0; setAuthToken(next);
      publish({ token: next, user: null, status: 'checking', error: null, attempt: 0, retryScheduled: false });
      void check();
    },
  };
}
