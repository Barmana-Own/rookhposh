const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');

test('production visitor cookies are host-only, private, secure and independently randomized', () => {
  const entry = path.resolve(__dirname, '../src/tryon/identity.js');
  const code = `const {principal}=require(${JSON.stringify(entry)});const samples=[];
    async function sample(){let result;await principal()({headers:{}},{cookie:(name,value,options)=>{result={name,options,nonce:value.split('.')[0],valid:/^[a-f0-9]{64}\\.\\d{10}\\.[a-f0-9]{64}$/.test(value)};},setHeader:()=>{}},error=>{if(error)throw error});return result;}
    (async()=>{samples.push(await sample(),await sample());console.log('COOKIE_CHECK='+JSON.stringify({name:samples[0].name,options:samples[0].options,valid:samples.every(x=>x.valid),independent:samples[0].nonce!==samples[1].nonce}));})().catch(()=>{process.exitCode=1});`;
  const result = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production', OMIDPAY_ENABLED: 'false', JWT_SECRET: randomBytes(32).toString('hex'), TRYON_SECRET_KEY: randomBytes(32).toString('hex') } });
  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.split('\n').find(value => value.startsWith('COOKIE_CHECK='));
  const value = JSON.parse(line.slice('COOKIE_CHECK='.length));
  assert.equal(value.name, '__Host-rhp_tryon_session'); assert.equal(value.valid, true); assert.equal(value.independent, true);
  assert.deepEqual(value.options, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 180 * 86400 * 1000 });
});
