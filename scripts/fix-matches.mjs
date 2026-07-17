#!/usr/bin/env node
/**
 * ROMVault — auto-fix-match: re-valida no IGDB os jogos cuja capa veio de
 * fallback frouxo (têm cover_url mas NÃO têm igdb_id — assinatura do bug
 * antigo de "pegar o 1º resultado"). Com o matching SEGURO:
 *   - match exato de título  -> confirma/atualiza capa + grava igdb_id
 *   - match só por plataforma -> registra como SUSPEITO (não mexe)
 *   - nenhum match           -> registra como SUSPEITO (não mexe)
 * Suspeitos saem em fix-matches-suspeitos.txt pra revisão humana (ou pra
 * fila de reportes). NUNCA troca arte sem certeza.
 *
 *   node scripts/fix-matches.mjs --limit=200 --dry
 *   node scripts/fix-matches.mjs --limit=200
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}`));
  if (!hit) return d;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};
const LIMIT = Number(arg('limit', 200)) || 200;
const DRY = Boolean(arg('dry', false));

const env = {};
for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq > 0 && !line.trim().startsWith('#')) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const img = (id, size) => `https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// OAuth Twitch (mesmas credenciais do importer)
const tokRes = await fetch(
  `https://id.twitch.tv/oauth2/token?client_id=${env.TWITCH_CLIENT_ID}&client_secret=${env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
  { method: 'POST' },
);
const token = (await tokRes.json())?.access_token;
if (!token) {
  console.error('✖ OAuth Twitch falhou — confira TWITCH_CLIENT_ID/SECRET no .env');
  process.exit(1);
}

// alvo: capa presente + igdb_id ausente = capa chegou por matching frouxo
const { data: games } = await sb
  .from('games')
  .select('id, title, platforms, cover_url')
  .not('cover_url', 'is', null)
  .is('igdb_id', null)
  .order('updated_at', { ascending: false })
  .limit(LIMIT);

console.log(`fix-matches — ${games?.length ?? 0} jogos com capa mas sem igdb_id${DRY ? ' (dry-run)' : ''}`);

let fixed = 0;
const suspects = [];
for (const g of games ?? []) {
  await sleep(300); // 4 req/s do IGDB
  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: { 'Client-ID': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
    body: `fields name, cover.image_id; search "${String(g.title).replace(/"/g, '')}"; limit 10;`,
  });
  if (!res.ok) { suspects.push(`${g.title} — IGDB HTTP ${res.status}`); continue; }
  const hits = await res.json();
  const exact = hits.find((h) => norm(h.name) === norm(g.title));
  if (!exact) {
    suspects.push(`${g.title} [${(g.platforms ?? []).join(', ')}] — sem match exato no IGDB`);
    continue;
  }
  if (!DRY) {
    const patch = { igdb_id: exact.id };
    if (exact.cover?.image_id) {
      patch.cover_url = img(exact.cover.image_id, 'cover_big_2x');
      patch.thumbnail = img(exact.cover.image_id, 'cover_big');
    }
    const { error } = await sb.from('games').update(patch).eq('id', g.id);
    if (error) { suspects.push(`${g.title} — erro ao salvar: ${error.message}`); continue; }
  }
  fixed++;
  if (fixed % 25 === 0) console.log(`  … ${fixed} confirmados`);
}

console.log(`\n✔ confirmados/corrigidos: ${fixed}`);
console.log(`⚠ suspeitos (não tocados): ${suspects.length}`);
if (suspects.length > 0) {
  const out = resolve(ROOT, 'fix-matches-suspeitos.txt');
  writeFileSync(out, suspects.join('\n'), 'utf8');
  console.log(`  lista: ${out}`);
}
