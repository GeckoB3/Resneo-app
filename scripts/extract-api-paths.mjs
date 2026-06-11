import fs from 'node:fs';
import path from 'node:path';

const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
}
for (const root of ['lib', 'components', 'app', 'providers']) {
  if (fs.existsSync(root)) walk(root);
}

const set = new Set();
const re = /["'`](\/api\/(?:venue|booking|account|v1)\/[^"'`]*)["'`]/g;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(s))) {
    let p = m[1];
    p = p.replace(/\$\{[^}]+\}/g, ':x');
    p = p.replace(/\?.*$/, '');
    p = p.replace(/\/+$/, '');
    set.add(p);
  }
}
const arr = [...set].sort();
console.log('TOTAL unique app API paths:', arr.length);
console.log(arr.join('\n'));
