// Rebuilds the database and loads demo data.  Usage: npm run db:seed  (reads api/.env)
import { seed } from './seed-lib.js';

seed().catch(err => { console.error(err); process.exitCode = 1; });
