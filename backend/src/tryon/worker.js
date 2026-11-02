const store = require('./jobStore');
const providers = require('./providers');
const client = require('./providerClient');
const images = require('./images');
const pool = require('../config/database');
const { unseal } = require('./config');

function createWorker({ repository = store, providerStore = providers, providerClient = client, imageStore = images } = {}) {
  let stopped = true, running = false, timer = null, abort = null;
  let idle = Promise.resolve();
  let recoveredAt = 0;

  async function finishSaved(job, staged) {
    await imageStore.read(staged.asset);
    await repository.addAsset(pool, job.id, 'output', staged.asset);
    await repository.rememberOutput(job, staged.provider);
    await repository.transition(job, 'saving', 4, 75);
    await repository.finalize({ ...job, completionRequestId: staged.requestId });
    await providerStore.succeeded(staged.provider.id);
    await imageStore.clearStage(job.id);
  }

  async function saveResult(job, result, provider) {
    if (result.source) await repository.rememberOutput(job, provider, result.source);
    let bytes = result.bytes;
    if (!bytes) {
      try { bytes = await imageStore.loadSource(result.source, { allowedHosts: [new URL(provider.endpoint).hostname, ...(provider.options?.output_hosts || [])] }); }
      catch (error) {
        if ([400, 413].includes(error.status) || error.code === 'UNSAFE_DESTINATION') {
          await repository.forgetOutput(job);
          throw new client.ProviderFailure('INVALID_OUTPUT', { recoverable: true });
        }
        throw new client.ProviderFailure('OUTPUT_FETCH_FAILED', { recoverable: true });
      }
    }
    let durable;
    try { durable = await imageStore.stage(job.id, bytes, provider, result.requestId); }
    catch { throw new client.ProviderFailure('OUTPUT_STORAGE_FAILED', { uncertain: true }); }
    try {
      await repository.transition(job, 'saving', 3, 50);
      await finishSaved(job, durable);
    }
    catch { throw new client.ProviderFailure('SAVE_FAILED', { recoverable: true }); }
  }

  async function execute(job) {
    const heartbeat = setInterval(() => repository.heartbeat(job).catch(() => abort?.abort()), 25000);
    abort = new AbortController();
    try {
      let durable;
      try { durable = await imageStore.staged(job.id); }
      catch { throw new client.ProviderFailure('OUTPUT_STORAGE_FAILED', { uncertain: true }); }
      if (durable) { await finishSaved(job, durable); return; }
      const files = await repository.assets(job.id);
      if (files.some((file) => file.kind === 'output')) {
        await repository.transition(job, 'saving', 4, 75);
        await repository.finalize(job);
        return;
      }
      if (job.provider_output_ciphertext) {
        const previous = JSON.parse(unseal(job.provider_output_ciphertext, 'output:' + job.id));
        await saveResult(job, { source: previous.source }, previous.provider);
        return;
      }
      const input = await imageStore.read(files.find((file) => file.kind === 'input'));
      const garment = await imageStore.read(files.find((file) => file.kind === 'product'));
      const enabled = await providerStore.active();
      if (!enabled.length) throw new client.ProviderFailure('NO_ACTIVE_PROVIDER', { recoverable: true, retryAfter: 60 });
      let lastError;
      for (const provider of enabled) {
        for (let retry = 0; retry <= Number(provider.retry_limit); retry += 1) {
          if (stopped || abort.signal.aborted) throw new client.ProviderFailure('PROVIDER_TIMEOUT', { uncertain: true });
          await repository.assertDispatch(job);
          await repository.transition(job, 'processing', 2, null);
          const attemptId = await repository.attemptStarted(job, provider);
          try {
            const result = await providerClient.generate(provider, job, input, garment, { signal: abort.signal });
            await saveResult(job, result, provider);
            await repository.attemptFinished(attemptId, { success: true, requestId: result.requestId });
            return;
          } catch (error) {
            lastError = error instanceof client.ProviderFailure ? error : new client.ProviderFailure('TRYON_FAILED');
            await repository.attemptFinished(attemptId, {
              ...lastError, state: ['OUTPUT_FETCH_FAILED', 'SAVE_FAILED'].includes(lastError.code) ? 'response_received' : undefined,
            });
            if (['OUTPUT_FETCH_FAILED', 'SAVE_FAILED', 'OUTPUT_STORAGE_FAILED'].includes(lastError.code)) throw lastError;
            const cooldown = lastError.code === 'PROVIDER_AUTH' ? 600 : lastError.retryAfter || 0;
            await providerStore.failed(provider.id, lastError.code, cooldown);
            if (lastError.uncertain || !lastError.recoverable || lastError.code === 'SAFETY_REJECTED'
                || (lastError.code === 'PROVIDER_AUTH' && provider.options?.allow_auth_failover === false)) throw lastError;
            if (cooldown || retry === Number(provider.retry_limit)) break;
          }
        }
      }
      throw lastError || new client.ProviderFailure('TRYON_FAILED');
    } catch (error) {
      await repository.fail(job, error);
    } finally { clearInterval(heartbeat); abort = null; }
  }

  async function tick() {
    if (stopped || running) return;
    running = true;
    let finish;
    idle = new Promise((resolve) => { finish = resolve; });
    try {
      if (Date.now() - recoveredAt >= 15000) {
        const staged = [];
        for (const id of await repository.recoveryCandidates()) {
          try { if (await imageStore.staged(id)) staged.push(id); }
          catch { console.error(JSON.stringify({ component: 'tryon-recovery', code: 'PRIVATE_STAGE_INVALID', job_id: id })); }
        }
        await repository.recover(staged);
        await require('./cleanup').purgeDeleted();
        await require('./sessionRevocations').purgeExpired();
        await require('./terms').purgeExpired();
        recoveredAt = Date.now();
      }
      const job = await repository.claim();
      if (job) await execute(job);
    } catch (error) {
      const code = /^[A-Z0-9_]{1,80}$/.test(error.code || '') ? error.code : 'WORKER_FAILURE';
      console.error(JSON.stringify({ component: 'tryon-worker', code }));
    } finally {
      running = false; finish();
      if (!stopped) { timer = setTimeout(tick, 1000); timer.unref?.(); }
    }
  }

  return {
    start() { if (!stopped) return; stopped = false; void tick(); },
    wake() { if (!stopped && !running) { clearTimeout(timer); void tick(); } },
    stop() { stopped = true; clearTimeout(timer); abort?.abort(); return idle; },
    tick,
    get busy() { return running; },
  };
}

const worker = createWorker();
module.exports = { createWorker, worker };
