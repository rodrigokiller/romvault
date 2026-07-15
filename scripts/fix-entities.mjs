#!/usr/bin/env node
/**
 * ROMVault — corrige entidades HTML residuais (&#039; &amp; &quot;...) em
 * títulos/descrições já importados (bug do primeiro import do RHDN, antes do
 * cleanText cobrir os títulos de jogos). Idempotente; seguro re-rodar.
 *
 *   node scripts/fix-entities.mjs [--dry]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

const env = {};
for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq > 0 && !line.trim().startsWith('#')) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const decode = (s) =>
  String(s)
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&eacute;/g, 'é').replace(/&amp;/g, '&');

const TARGETS = [
  ['games', ['title', 'alt_title', 'description']],
  ['translations', ['title', 'description']],
  ['romhacks', ['title', 'description']],
  ['documents', ['title', 'description']],
  ['tools', ['title', 'description']],
];

for (const [table, cols] of TARGETS) {
  let fixed = 0;
  for (const col of cols) {
    // pagina os que têm entidade
    for (;;) {
      const { data, error } = await sb
        .from(table).select(`id, ${col}`)
        .or(`${col}.like.%&#%,${col}.like.%&amp;%,${col}.like.%&quot;%,${col}.like.%&apos;%`)
        .limit(500);
      if (error) { console.error(`${table}.${col}: ${error.message}`); break; }
      if (!data || data.length === 0) break;
      for (const row of data) {
        const clean = decode(row[col]);
        if (clean === row[col]) continue;
        if (DRY) { console.log(`[dry] ${table}.${col}: ${row[col]} -> ${clean}`); fixed++; continue; }
        await sb.from(table).update({ [col]: clean }).eq('id', row.id);
        fixed++;
      }
      if (DRY) break; // no dry não altera, sairia em loop
      if (data.length < 500) break;
    }
  }
  console.log(`${table}: ${fixed} campos corrigidos${DRY ? ' (dry)' : ''}`);
}
console.log('✓ pronto');
