const app = require('./app');
const { port } = require('./config/env');
const { ensureRuntimeSchema } = require('./database/runtimeSetup');

async function start() {
  await ensureRuntimeSchema();
  app.listen(port, () => {
    console.log(`Backend running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('Backend failed to start:', error.message);
  process.exit(1);
});
