const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sharp = require('sharp');
const images = require('../src/tryon/images');
const network = require('../src/tryon/network');
const { seal, unseal } = require('../src/tryon/config');
const { collect } = require('../src/tryon/device');
const { payloadFor, generate, failureFromResponse, retryAfter } = require('../src/tryon/providerClient');

test('private secret encryption authenticates its value and purpose', () => {
  const secret = 'qa-secret-' + crypto.randomBytes(32).toString('hex');
  const encrypted = seal(secret, 'provider:1');
  assert.ok(!encrypted.includes(secret)); assert.equal(unseal(encrypted, 'provider:1'), secret);
  assert.throws(() => unseal(encrypted, 'provider:2'));
  const parts = encrypted.split('.'); parts[2] = crypto.randomBytes(16).toString('base64url');
  assert.throws(() => unseal(parts.join('.'), 'provider:1'));
});
test('network destinations reject local/reserved IPv4/IPv6, credentials and redirects by default', () => {
  for (const value of ['127.0.0.1','10.1.2.3','169.254.169.254','192.168.1.1','100.64.0.1','0.0.0.0','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1']) assert.equal(network.publicAddress(value), false, value);
  for (const value of ['https://127.0.0.1/a','https://[::1]/','file:///etc/passwd','http://example.com/a','https://key:pass@example.com','https://example.com:8080','https://example.com?api_key=secret']) assert.throws(() => network.parseEndpoint(value), value);
  assert.equal(network.publicAddress('1.1.1.1'), true);
  assert.equal(network.parseEndpoint('http://91.107.232.169:6000/try-on').pathname, '/try-on');
});
test('image validation decodes actual raster content and rejects spoofed/truncated/animated images', async () => {
  const png = await sharp({create:{width:24,height:32,channels:3,background:'purple'}}).png().toBuffer();
  assert.deepEqual((({ mime, width, height }) => ({ mime, width, height }))(await images.inspect(png)), {mime:'image/png',width:24,height:32});
  await assert.rejects(images.inspect(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')));
  await assert.rejects(images.inspect(Buffer.concat([png.subarray(0,25),Buffer.from('not pixels')])));
  assert.throws(() => images.fromDataUrl('data:image/png;base64,not a valid base64'));
});
test('existing service still receives exactly person and cloth binary multipart fields', async () => {
  const input = await sharp({create:{width:16,height:20,channels:3,background:'blue'}}).png().toBuffer();
  const provider = { id:1, adapter:'rookhposh_multipart', endpoint:'http://91.107.232.169:6000/try-on', timeout_seconds:5, options:{} };
  const payload = await payloadFor(provider,input,input);
  const form = await new Request('http://localhost/',{method:'POST',headers:{'content-type':payload.contentType},body:payload.body}).formData();
  assert.deepEqual([...form.keys()],['person','cloth']);
  assert.ok(Buffer.from(await form.get('person').arrayBuffer()).equals(input));
  let header;
  const result = await generate(provider,{id:'a'.repeat(32)},input,input,{transport:async (_url,request) => {
    header=request.headers; return {status:200,headers:{'content-type':'image/png','x-request-id':'qa-123'},body:input};
  }});
  assert.ok(result.bytes.equals(input)); assert.equal(header['idempotency-key'],'rookhposh-'+'a'.repeat(32));
});
test('invalid/safety output, HTTP 429 and uncertain sent timeouts have distinct retry rules', async () => {
  const input = await sharp({create:{width:16,height:20,channels:3,background:'blue'}}).png().toBuffer();
  const provider = {id:1,adapter:'rookhposh_multipart',endpoint:'http://91.107.232.169:6000/try-on',timeout_seconds:5,options:{}};
  const safety = failureFromResponse({status:400,headers:{},body:Buffer.from('content_policy_violation')});
  assert.equal(safety.code,'SAFETY_REJECTED'); assert.equal(safety.recoverable,false);
  assert.equal(retryAfter('17'),17);
  assert.equal(failureFromResponse({status:429,headers:{'retry-after':'17'},body:Buffer.from('rate limited')}).retryAfter,17);
  await assert.rejects(generate(provider,{id:'b'.repeat(32)},input,input,{transport:async()=>({status:200,headers:{'content-type':'image/png'},body:Buffer.from('broken image')})}),error=>error.code==='INVALID_OUTPUT'&&error.recoverable);
  await assert.rejects(generate(provider,{id:'b'.repeat(32)},input,input,{transport:async()=>{throw Object.assign(new Error('timeout'),{code:'ETIMEDOUT',sent:true});}}),error=>error.code==='PROVIDER_TIMEOUT'&&error.uncertain&&!error.recoverable);
});
test('diagnostics are opt-in and only use trusted server IP and supported browser facts', () => {
  const req={headers:{'user-agent':'Mozilla/5.0 (Linux; Android 13; QA) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'},ip:'127.0.0.1'};
  assert.deepEqual(collect(req,{},'c'.repeat(32)),{device:null,network:null,consent:false});
  const info=collect(req,{diagnostics_consent:true,ip:'8.8.8.8',device:{screen_width:390,screen_height:844,device_model:'made up',pixel_ratio:3,language:'fa-IR'}},'c'.repeat(32));
  assert.equal(info.device.device_model,null); assert.equal(info.device.device_type,'mobile'); assert.equal(info.device.os,'Android');
  assert.equal(JSON.parse(unseal(info.network,'network:'+'c'.repeat(32))).ip,'127.0.0.1');
});

test('DNS answers containing any private address are rejected before connecting', async(t) => {
  const dns=require('node:dns').promises;
  t.mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]);
  await assert.rejects(network.request('https://provider.example/try-on'),error=>error.code==='UNSAFE_DESTINATION'&&error.sent===false);
});
test('all alternate adapters retain the two references and their declared model format', async()=>{
  const bytes=await sharp({create:{width:16,height:20,channels:3,background:'blue'}}).png().toBuffer();
  const json=await payloadFor({adapter:'json_images',endpoint:'https://provider.example',model:'qa-model',options:{person_field:'human',cloth_field:'garment'}},bytes,bytes);
  const body=JSON.parse(json.body);assert.equal(body.model,'qa-model');assert.match(body.human,/^data:image\/png;base64,/);assert.match(body.garment,/^data:image\/png;base64,/);
  const openai=await payloadFor({adapter:'openai_edit',endpoint:'https://provider.example',model:'qa-model',options:{}},bytes,bytes);
  const form=await new Request('http://localhost/',{method:'POST',headers:{'content-type':openai.contentType},body:openai.body}).formData();
  assert.equal(form.getAll('image[]').length,2);assert.equal(form.get('model'),'qa-model');assert.equal(form.get('n'),'1');
});
