import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function extractKeys(source) {
  const keys = new Set();
  const regex = /'([^']+)':/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    keys.add(match[1]);
  }
  return keys;
}

const enKeys = extractKeys(readFile('src/i18n/en/index.ts') + readFile('src/i18n/en/common.ts') + readFile('src/i18n/en/auth.ts') + readFile('src/i18n/en/nav.ts') + readFile('src/i18n/en/pages.ts') + readFile('src/i18n/en/components.ts') + readFile('src/i18n/en/errors.ts'));
const ruKeys = extractKeys(readFile('src/i18n/ru/index.ts') + readFile('src/i18n/ru/common.ts') + readFile('src/i18n/ru/auth.ts') + readFile('src/i18n/ru/nav.ts') + readFile('src/i18n/ru/pages.ts') + readFile('src/i18n/ru/components.ts') + readFile('src/i18n/ru/errors.ts'));

const missingInRu = [...enKeys].filter((key) => !ruKeys.has(key));
const extraInRu = [...ruKeys].filter((key) => !enKeys.has(key));

if (missingInRu.length > 0 || extraInRu.length > 0) {
  if (missingInRu.length > 0) {
    console.error('Missing RU translations for keys:');
    for (const key of missingInRu) console.error(`  - ${key}`);
  }
  if (extraInRu.length > 0) {
    console.error('Extra RU keys not found in EN baseline:');
    for (const key of extraInRu) console.error(`  - ${key}`);
  }
  process.exit(1);
}

console.log(`i18n check passed (${enKeys.size} keys).`);
