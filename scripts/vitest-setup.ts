import { mkdirSync } from 'node:fs';
import path from 'node:path';

const coverageTmpDir = path.join(process.cwd(), 'coverage', '.tmp');
mkdirSync(coverageTmpDir, { recursive: true });
