import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(here, '../../docs/openapi.json');

const app = await buildApp();
await app.ready();

const spec = app.swagger();
await writeFile(outputPath, JSON.stringify(spec, null, 2));

// eslint-disable-next-line no-console -- CLI script output, not application logging
console.log(`OpenAPI spec written to ${outputPath}`);

await app.close();
