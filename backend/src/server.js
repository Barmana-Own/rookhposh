const app = require('./app');
const { port } = require('./config/env');
const { ensureRuntimeSchema } = require('./database/runtimeSetup');
const { worker } = require('./tryon/worker');
const pool = require('./config/database');

async function start() {
  await ensureRuntimeSchema();
  await require('./tryon/images').initialize();
  const server = app.listen(port, process.env.BIND_HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0'), () => {
    worker.start();
    console.log(`Backend running on http://localhost:${port}`);
  });
  const stop = () => {
    const closed = new Promise((resolve) => server.close(resolve));
    void Promise.all([worker.stop(), closed]).then(() => pool.end()).catch(() => { process.exitCode = 1; });
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

start().catch((error) => {
  console.error('Backend failed to start:', error.message);
  process.exit(1);
});
