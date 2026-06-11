import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const WEB = 'C:/Resneo/src/app';

// App paths (from extract-api-paths.mjs), cleaned of noise.
const raw = execSync('node scripts/extract-api-paths.mjs', { encoding: 'utf8' });
const paths = raw
  .split('\n')
  .filter((l) => l.startsWith('/api/'))
  .map((l) => l.trim())
  .filter((l) => l !== '/api/venue/*' && !l.endsWith(':x') ? true : l !== '/api/venue/*');

// Resolve an app path to a route.ts file, mapping ":x" -> a [dynamic] dir.
function resolveRoute(apiPath) {
  const segs = apiPath.replace(/^\/api\//, '').split('/').filter(Boolean);
  let dir = path.join(WEB, 'api');
  for (const seg of segs) {
    if (!fs.existsSync(dir)) return null;
    if (seg === ':x') {
      const kids = fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith('[') && e.name.endsWith(']'));
      if (kids.length === 0) return null;
      dir = path.join(dir, kids[0].name);
    } else {
      dir = path.join(dir, seg);
    }
  }
  const file = path.join(dir, 'route.ts');
  return fs.existsSync(file) ? file : null;
}

function classify(file) {
  const s = fs.readFileSync(file, 'utf8');
  const methods = [...s.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]);
  const bearer = /createVenueRouteClient|createRouteHandlerClient/.test(s);
  const cookie = /createClient\s*\(/.test(s);
  const serviceRole = /createServiceRoleClient|service_role|SUPABASE_SERVICE/.test(s);
  let status;
  if (bearer) status = 'BEARER';
  else if (cookie) status = 'COOKIE-ONLY';
  else if (serviceRole) status = 'service-role';
  else status = 'other/none';
  return { status, methods: methods.join(',') || '?' };
}

const rows = [];
for (const p of paths) {
  const file = resolveRoute(p);
  if (!file) { rows.push({ p, status: 'MISSING', methods: '', file: '' }); continue; }
  const { status, methods } = classify(file);
  rows.push({ p, status, methods, file: file.replace('C:/Resneo/', '') });
}

const order = { 'COOKIE-ONLY': 0, MISSING: 1, 'service-role': 2, 'other/none': 3, BEARER: 4 };
rows.sort((a, b) => (order[a.status] - order[b.status]) || a.p.localeCompare(b.p));
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const counts = {};
for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
console.log('COUNTS:', JSON.stringify(counts));
console.log(pad('STATUS', 13) + pad('METHODS', 22) + 'PATH');
console.log('-'.repeat(90));
for (const r of rows) console.log(pad(r.status, 13) + pad(r.methods, 22) + r.p);
