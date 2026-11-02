import { test } from 'node:test';
import { setImmediate } from 'node:timers';
import assert from 'node:assert/strict';
import { createAuthSession, AUTH_STORAGE_KEY } from '../src/services/authSession.js';

const user = { id: 7, role: 'Seller' };
const response = value => ({ data: { data: value } });
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(get, initial = 'signed-token') {
  const values = new Map(initial ? [[AUTH_STORAGE_KEY, initial]] : []), timers = new Map(), headers = [];
  let serial = 0;
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const session = createAuthSession({ api: { get }, storage, setAuthToken: token => headers.push(token), schedule: (callback, delay) => { timers.set(++serial, { callback, delay }); return serial; }, cancel: id => timers.delete(id) });
  return { session, storage, timers, headers, async fire() { const [id, task] = timers.entries().next().value; timers.delete(id); task.callback(); await tick(); } };
}
test('a token is not an authenticated user until /auth/me confirms it', async () => {
  const pending = defer(); const f = fixture(() => pending.promise);
  assert.equal(f.session.getSnapshot().status, 'checking'); assert.equal(f.session.getSnapshot().user, null);
  const start = f.session.start(); pending.resolve(response(user)); await start;
  assert.equal(f.session.getSnapshot().status, 'authenticated'); assert.deepEqual(f.session.getSnapshot().user, user);
});
test('successful password login persists the verified user and sets the token for subsequent requests', async () => {
  const f = fixture(() => Promise.resolve(response(user)), null); await f.session.start();
  const authenticated = await f.session.authenticate(() => Promise.resolve(response({ token: 'qa-login-token', user })));
  assert.deepEqual(authenticated, user); assert.equal(f.session.getSnapshot().status, 'authenticated');
  assert.equal(f.storage.getItem(AUTH_STORAGE_KEY), 'qa-login-token'); assert.equal(f.headers.at(-1), 'qa-login-token');
  await f.session.check(); assert.equal(f.session.getSnapshot().user.id, user.id);
});
test('503 preserves the token, retries at bounded exponential delays and recovers', async () => {
  let calls = 0; const f = fixture(() => { calls++; return calls < 4 ? Promise.reject({ status: 503 }) : Promise.resolve(response(user)); });
  await f.session.start();
  for (const delay of [1000, 2000, 4000]) { assert.equal(f.session.getSnapshot().status, 'temporarilyUnavailable'); assert.equal(f.storage.getItem(AUTH_STORAGE_KEY), 'signed-token'); assert.equal([...f.timers.values()][0].delay, delay); await f.fire(); }
  assert.equal(calls, 4); assert.equal(f.session.getSnapshot().status, 'authenticated'); assert.equal(f.timers.size, 0);
});
test('a persistent network failure stops after three automatic retries and manual retry works', async () => {
  let failing = true, calls = 0; const f = fixture(() => { calls++; return failing ? Promise.reject({ status: 0, code: 'NETWORK_ERROR' }) : Promise.resolve(response(user)); });
  await f.session.start(); for (let i = 0; i < 3; i++) await f.fire();
  assert.equal(calls, 4); assert.equal(f.timers.size, 0); assert.equal(f.storage.getItem(AUTH_STORAGE_KEY), 'signed-token');
  failing = false; await f.session.retry(); assert.equal(f.session.getSnapshot().status, 'authenticated');
});
test('401 clears an invalid session, 403 preserves it without automatic retry', async () => {
  for (const status of [401, 403]) {
    const f = fixture(() => Promise.reject({ status })); await f.session.start();
    assert.equal(f.session.getSnapshot().status, status === 401 ? 'unauthenticated' : 'temporarilyUnavailable');
    assert.equal(f.storage.getItem(AUTH_STORAGE_KEY), status === 401 ? null : 'signed-token'); assert.equal(f.timers.size, 0);
  }
});
test('timeout and gateway failures are temporary, never evidence of invalid credentials', async () => {
  for (const error of [{ status: 0, code: 'ECONNABORTED' }, { status: 502 }, { status: 504 }]) {
    const f = fixture(() => Promise.reject(error)); await f.session.start();
    assert.equal(f.session.getSnapshot().status, 'temporarilyUnavailable'); assert.equal(f.storage.getItem(AUTH_STORAGE_KEY), 'signed-token'); f.session.stop(); assert.equal(f.timers.size, 0);
  }
});
test('a failed recheck retains the known user for mounted form state while the guard blocks content', async () => {
  let failing = false; const f = fixture(() => failing ? Promise.reject({ status: 503 }) : Promise.resolve(response(user)));
  await f.session.start(); failing = true; await f.session.check();
  assert.deepEqual(f.session.getSnapshot().user, user); assert.equal(f.session.getSnapshot().status, 'temporarilyUnavailable');
});
test('concurrent checks share one request and check the selected token explicitly', async () => {
  const gate = defer(); let calls = 0;
  const f = fixture((url, options) => { calls++; assert.equal(options.headers.Authorization, 'Bearer signed-token'); return gate.promise; });
  const first = f.session.start(); const second = f.session.check(); assert.equal(first, second); await tick(); assert.equal(calls, 1);
  gate.resolve(response(user)); await first;
});
test('manual logout aborts the check and ignores late successful responses', async () => {
  const gate = defer(); let signal; const f = fixture((url, options) => { signal = options.signal; return gate.promise; });
  const request = f.session.start(); await tick(); f.session.logout(); assert.equal(signal.aborted, true);
  gate.resolve(response(user)); await request; assert.equal(f.session.getSnapshot().status, 'unauthenticated'); assert.equal(f.storage.getItem(AUTH_STORAGE_KEY), null);
});
test('unmount cancels scheduled work and late responses; restart can verify again', async () => {
  const gate = defer(); let calls = 0; const f = fixture(() => ++calls === 1 ? gate.promise : Promise.resolve(response(user)));
  const first = f.session.start(); await tick(); f.session.stop(); gate.resolve(response(user)); await first;
  assert.equal(f.session.getSnapshot().user, null); await f.session.start(); assert.equal(f.session.getSnapshot().status, 'authenticated');
});
test('cross-tab token replacement cannot be overwritten by an old 401', async () => {
  const gate = defer(); const f = fixture((url, options) => options.headers.Authorization.endsWith('new-token') ? Promise.resolve(response({ ...user, id: 8 })) : gate.promise);
  const first = f.session.start(); await tick(); f.storage.setItem(AUTH_STORAGE_KEY, 'new-token'); f.session.syncFromStorage(); await tick();
  gate.reject({ status: 401 }); await first;
  assert.equal(f.session.getSnapshot().user.id, 8); assert.equal(f.storage.getItem(AUTH_STORAGE_KEY), 'new-token');
});
test('logout during login prevents late credentials from restoring a session', async () => {
  const gate = defer(); const f = fixture(() => Promise.resolve(response(user)), null); await f.session.start();
  const login = f.session.authenticate(() => gate.promise); f.session.logout(); gate.resolve(response({ user, token: 'late-token' }));
  await assert.rejects(login, error => error.code === 'AUTH_CANCELLED'); assert.equal(f.storage.getItem(AUTH_STORAGE_KEY), null);
});
test('malformed /auth/me never grants access or removes a potentially valid token', async () => {
  const f = fixture(() => Promise.resolve(response(null))); await f.session.start();
  assert.equal(f.session.getSnapshot().user, null); assert.equal(f.session.getSnapshot().status, 'temporarilyUnavailable'); assert.equal(f.storage.getItem(AUTH_STORAGE_KEY), 'signed-token');
});
