import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApplication } from '../server/app.mjs';

const distRoot = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
await startApplication({
  staticRoot: distRoot,
  port: Number(process.env.PORT || 3000),
});
