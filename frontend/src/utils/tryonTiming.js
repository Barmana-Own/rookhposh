// Per-tab numeric diagnostics only: never send pictures, sessions, tokens or device data.
export function tryonTiming(stage, jobId, values = {}) {
  if (!/^[a-f0-9]{32}$/.test(jobId || '') || !globalThis.performance?.mark) return;
  const name = 'rookhposh.tryon.' + stage;
  const detail = { job_id: jobId };
  for (const [key, value] of Object.entries(values)) if (Number.isFinite(value) && value >= 0) detail[key] = Math.round(value * 10) / 10;
  try {
    performance.clearMarks(name); performance.mark(name, { detail });
  } catch { console.warn('TRYON_TIMING_UNAVAILABLE'); }
}
