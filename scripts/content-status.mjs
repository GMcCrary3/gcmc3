// Prints what is still waiting for the artist: missing image files, empty
// fields, unapproved copy. Run with: npm run status
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, parse } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const fm = (file) => {
  const text = readFileSync(file, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const data = {};
  for (const line of (m?.[1] ?? '').split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { data, body: (m?.[2] ?? '').trim() };
};

const site = JSON.parse(readFileSync(join(root, 'src/data/site.json'), 'utf8'));
const assets = join(root, 'src/assets/artwork');
const files = existsSync(assets) ? readdirSync(assets).filter((f) => !f.startsWith('.')) : [];
const stems = new Set(files.map((f) => parse(f).name.toLowerCase()));

console.log('\nartwork');
for (const f of readdirSync(join(root, 'src/content/artwork')).sort()) {
  const { data, body } = fm(join(root, 'src/content/artwork', f));
  const stem = parse(data.image ?? '').name.toLowerCase();
  const missing = ['alt', 'title', 'year', 'medium', 'dimensions', 'description'].filter((k) => !data[k]);
  if (!body) missing.push('note');
  const img = stems.has(stem) ? 'image ✓' : `image MISSING (${data.image})`;
  const id = f.replace(/\.md$/, '');
  const place = site.gallery.selected.includes(id) ? 'selected' : site.gallery.archive.includes(id) ? 'archive' : 'UNPLACED';
  console.log(`  ${f.padEnd(14)} ${place.padEnd(9)} ${img}${missing.length ? ` · unpublished: ${missing.join(', ')}` : ''}`);
}

console.log('\nsite copy');
for (const f of readdirSync(join(root, 'src/content/pages')).sort()) {
  const { data, body } = fm(join(root, 'src/content/pages', f));
  console.log(`  ${f.padEnd(14)} ${body ? 'has text' : 'EMPTY'} · ${data.approved === 'true' ? 'approved' : 'not marked approved'}`);
}

console.log('\nwriting');
for (const f of readdirSync(join(root, 'src/content/writing')).sort()) {
  const { data, body } = fm(join(root, 'src/content/writing', f));
  const empty = ['description', 'year', 'publisher'].filter((k) => !data[k]);
  console.log(`  ${f.padEnd(20)} ${body ? 'has text' : 'no text'}${empty.length ? ` · unpublished: ${empty.join(', ')}` : ''}`);
}

console.log('\nexhibition');
for (const f of readdirSync(join(root, 'src/content/exhibition')).sort()) {
  const text = readFileSync(join(root, 'src/content/exhibition', f), 'utf8');
  const works = [...text.matchAll(/work: (work-\S+)/g)].map((m) => m[1].replace('work-', '')).join(' → ');
  const poems = [...text.matchAll(/poem: "?([^"\n]+)"?/g)].filter((m) => m[1].trim()).length;
  const pending = [...text.matchAll(/approved: false/g)].length;
  console.log(`  ${f.padEnd(28)} ${works || '(text only)'}${poems ? ` · ${poems} poem(s) paired` : ''}${pending ? ` · ${pending} interlude(s) awaiting approval` : ''}`);
}

console.log('\nsettings');
console.log(`  editorial notes visible: ${site.showEditorialNotes} ${site.showEditorialNotes ? '(turn off before launch)' : ''}`);
console.log(`  analytics approved:      ${site.analytics.approvedByArtist}`);
console.log(`  public contact email:    ${site.contactEmail || '(none)'}\n`);
