const { performance } = require('node:perf_hooks');

function jobTiming(job, report) {
  const start = performance.now(), durations = {};
  let outcome = 'success', code;
  return {
    async measure(stage, action) {
      const began = performance.now();
      try { return await action(); }
      finally { durations[stage] = (durations[stage] || 0) + performance.now() - began; }
    },
    failed(error) { outcome = 'error'; code = /^[A-Z0-9_]{1,80}$/.test(error?.code || '') ? error.code : 'TRYON_FAILED'; },
    finish() {
      if (!/^[a-f0-9]{32}$/.test(job.id || '')) return;
      const values = Object.fromEntries(Object.entries(durations).map(([key, value]) => [key, Math.round(value * 10) / 10]));
      const event = { component: 'tryon-performance', job_id: job.id, outcome, error_code: code,
        worker_ms: Math.round((performance.now() - start) * 10) / 10, stages_ms: values };
      try { report(event); }
      catch { console.error(JSON.stringify({ component: 'tryon-performance', code: 'TIMING_REPORT_FAILED', job_id: job.id })); }
    },
  };
}

module.exports = { jobTiming };
