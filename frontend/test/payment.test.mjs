import assert from 'node:assert/strict';
import test from 'node:test';
import { redirectToGateway } from '../src/utils/payment.js';

const payment = {
  status: 'redirect_required',
  gateway: { url: 'https://omid.shaparak.ir/_ipgw_/merchant/token', method: 'POST', fields: { token: 'bank-token', language: 'fa' } },
};

function mockDocument(t, document) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  });
}

test('posts only the token and language to the fixed Shaparak endpoint', (t) => {
  let submitted;
  let removed = false;
  const fields = [];
  const form = {
    appendChild: (input) => fields.push(input),
    submit() { submitted = this; },
    remove: () => { removed = true; },
  };
  const document = { createElement: (tag) => tag === 'form' ? form : {}, body: { appendChild: () => undefined } };
  mockDocument(t, document);
  assert.equal(redirectToGateway(payment), true);
  assert.equal(submitted.method, 'POST');
  assert.equal(submitted.action, payment.gateway.url);
  assert.deepEqual(fields.map(({ name, value }) => ({ name, value })), [{ name: 'token', value: 'bank-token' }, { name: 'language', value: 'fa' }]);
  assert.equal(removed, true);
});

test('ignores non-gateway results and rejects substituted URLs, methods and tokens', () => {
  assert.equal(redirectToGateway({ status: 'pending' }), false);
  for (const gateway of [
    { ...payment.gateway, url: 'https://attacker.test/' },
    { ...payment.gateway, url: 'javascript:alert(1)' },
    { ...payment.gateway, method: 'GET' },
    { ...payment.gateway, fields: { token: '<script>' } },
  ]) {
    assert.throws(() => redirectToGateway({ status: 'redirect_required', gateway }));
  }
});

test('cleans up the form after a navigation failure so the checkout can be retried', (t) => {
  let removed = false;
  const form = { appendChild: () => undefined, submit: () => { throw new Error('navigation failed'); }, remove: () => { removed = true; } };
  mockDocument(t, {
    createElement: (tag) => tag === 'form' ? form : {}, body: { appendChild: () => undefined },
  });
  assert.throws(() => redirectToGateway(payment), /navigation failed/);
  assert.equal(removed, true);
});
