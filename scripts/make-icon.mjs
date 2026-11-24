// Gera build/icon.png (512×512) a partir do logótipo SVG.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="512" height="512">
<rect width="32" height="32" rx="7" fill="#0f2a33"/>
<circle cx="16" cy="16" r="11.5" fill="none" stroke="#5cd1de" stroke-width="2"/>
<path d="M16 6.5l3.4 9.5-3.4 9.5-3.4-9.5z" fill="#5cd1de"/>
<path d="M16 16h3.4L16 25.5z" fill="#fff" opacity=".85"/>
<circle cx="16" cy="16" r="1.6" fill="#0f2a33"/></svg>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 512, height: 512 } });
await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await p.locator('svg').screenshot({ path: out, omitBackground: true });
await b.close();
console.log('ícone:', out);
