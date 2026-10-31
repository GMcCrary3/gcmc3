// Builds public/og-default.png — the typographic sharing image used when a
// page has no artwork image. Run with: npm run og
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const site = JSON.parse(readFileSync(new URL('../src/data/site.json', import.meta.url), 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#f5f1e8"/>
  <text x="80" y="330" font-family="Georgia, 'Times New Roman', serif" font-size="96" fill="#161513" letter-spacing="-2">${esc(site.concept)}</text>
  <text x="84" y="400" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="40" fill="#3a3833">${esc(site.secondaryLine)}</text>
  <text x="84" y="550" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#6c675e" letter-spacing="2">${esc(site.byline)}</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(new URL('../public/og-default.png', import.meta.url).pathname);
console.log('wrote public/og-default.png');
