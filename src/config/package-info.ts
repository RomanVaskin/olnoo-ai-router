import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.resolve(here, '../../package.json');

interface PackageInfo {
  name: string;
  version: string;
}

const raw = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as PackageInfo;

export const packageInfo: PackageInfo = { name: raw.name, version: raw.version };
