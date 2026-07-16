#!/usr/bin/env node
/**
 * ROMVault — saúde das imagens: testa uma AMOSTRA de cover_url/boxart/box3d
 * (HTTP HEAD) e reporta links quebrados. Com 3+ fontes de imagem (IGDB,
 * libretro→Storage, Moby→Storage), link podre eventualmente aparece.
 *
 *   node scripts/check-images.mjs                # amostra de 300
 *   node scripts/check-images.mjs --limit=1000
 *   node scripts/check-images.mjs --fix          # zera cover_url dos mortos
 *                                                  (voltam pra fila dos covers)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}`));
  if (!hit) return d;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};
const LIMIT = Number(arg('limit', 300)) || 300;
const FIX = Boolean(arg('fix', false));

const env = {};
for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq > 0 && !line.trim().startsWith('#')) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const { data: games } = await sb
  .from('games')
  .select('id, title, cover_url, metadata')
  .not('cover_url', 'is', null)
  .order('updated_at', { ascending: false })
  .limit(LIMIT);

// monta a lista de urls a checar (capa + boxart + box3d)
const checks = [];
for (const g of games ?? []) {
  checks.push({ g, kind: 'cover', url: g.cover_url });
  const m = g.metadata ?? {};
  if (m.boxart) checks.push({ g, kind: 'boxart', url: m.boxart });
  if (m.box3d) checks.push({ g, kind: 'box3d', url: m.box3d });
}
console.log(`Checando ${checks.length} imagens de ${games?.length ?? 0} jogos (amostra mais recente)…`);

const broken = [];
let done = 0;
// concorrência 8
const queue = [...checks];
await Promise.all(Array.from({ length: 8 }, async () => {
  for (;;) {
    const item = queue.shift();
    if (!item) return;
    try {
      const res = await fetch(item.url, { method: 'HEAD' });
      if (!res.ok) broken.push({ ...item, status: res.status });
    } catch {
      broken.push({ ...item, status: 'ERR' });
    }
    if (++done % 100 === 0) console.log(`  … ${done}/${checks.length}`);
  }
}));

console.log(`\n✔ ok: ${checks.length - broken.length}   ✖ quebradas: ${broken.length}\n`);
for (const b of broken.slice(0, 30)) {
  console.log(`  ✖ [${b.kind}] ${b.status}  ${b.g.title}\n      ${b.url}`);
}
if (broken.length > 30) console.log(`  … e mais ${broken.length - 30}`);

if (FIX && broken.length > 0) {
  let fixed = 0;
  for (const b of broken) {
    if (b.kind === 'cover') {
      await sb.from('games').update({ cover_url: null, thumbnail: null }).eq('id', b.g.id);
    } else {
      const meta = { ...(b.g.metadata ?? {}) };
      delete meta[b.kind];
      await sb.from('games').update({ metadata: meta }).eq('id', b.g.id);
    }
    fixed++;
  }
  console.log(`\n🔧 ${fixed} referências mortas limpas (voltam pra fila dos importers de capa).`);
}
