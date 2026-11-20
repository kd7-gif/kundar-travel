import { createApp } from './app.js';
import { pool } from './db.js';
import { startHoldSweeper } from './lib/holds.js';

const port = Number(process.env.PORT || 4000);
const server = createApp().listen(port, () => {
  console.log(`Kundar Travel API listening on http://localhost:${port}`);
});

startHoldSweeper();

const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
