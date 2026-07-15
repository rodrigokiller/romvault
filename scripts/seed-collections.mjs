#!/usr/bin/env node
/**
 * ROMVault — cria/atualiza as COLEÇÕES CURADAS iniciais com itens REAIS do
 * banco (top por downloads). Idempotente: upsert por slug + repovoa os itens.
 *
 *   node scripts/seed-collections.mjs         # cria/atualiza e PUBLICA
 *   node scripts/seed-collections.mjs --dry   # só mostra o que faria
 *
 * Ajuste os temas em COLLECTIONS abaixo (é a curadoria — mexa à vontade).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

const env = {};
if (existsSync(resolve(ROOT, '.env'))) {
  for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq > 0 && !line.trim().startsWith('#')) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

/* Curadoria: cada coleção = consulta que devolve [{type, id, title}] */
const COLLECTIONS = [
  {
    slug: 'traducoes-ptbr-snes',
    title: 'Melhores traduções PT-BR de SNES',
    description: 'As traduções brasileiras de Super Nintendo mais baixadas da história — jogue os clássicos em português.',
    position: 1,
    query: async () => {
      const { data } = await sb
        .from('translations')
        .select('id, title, downloads, game:games!inner(platforms)')
        .ilike('language', '%portug%')
        .contains('game.platforms', ['SNES'])
        .order('downloads', { ascending: false })
        .limit(12);
      return (data ?? []).map((r) => ({ type: 'translation', id: r.id, title: r.title }));
    },
  },
  {
    slug: 'kaizo-essenciais',
    title: 'Kaizo essenciais',
    description: 'Os hacks de dificuldade brutal que definiram o gênero — para quem acha que já zerou tudo.',
    position: 2,
    query: async () => {
      const { data } = await sb
        .from('romhacks')
        .select('id, title, downloads')
        .or('difficulty.ilike.%kaizo%,tags.cs.{kaizo}')
        .order('downloads', { ascending: false })
        .limit(10);
      return (data ?? []).map((r) => ({ type: 'romhack', id: r.id, title: r.title }));
    },
  },
  {
    slug: 'hacks-mais-baixados',
    title: 'Hacks mais baixados de todos os tempos',
    description: 'O hall da fama do romhacking: os hacks que a comunidade mais baixou.',
    position: 3,
    query: async () => {
      const { data } = await sb
        .from('romhacks')
        .select('id, title, downloads')
        .order('downloads', { ascending: false })
        .limit(12);
      return (data ?? []).map((r) => ({ type: 'romhack', id: r.id, title: r.title }));
    },
  },
  {
    slug: 'kit-do-romhacker',
    title: 'Kit do romhacker',
    description: 'As ferramentas essenciais para começar (e terminar) sua primeira tradução ou hack.',
    position: 4,
    query: async () => {
      const { data } = await sb
        .from('tools')
        .select('id, title, downloads')
        .order('downloads', { ascending: false })
        .limit(10);
      return (data ?? []).map((r) => ({ type: 'tool', id: r.id, title: r.title }));
    },
  },
];

for (const col of COLLECTIONS) {
  const items = await col.query();
  console.log(`\n▸ ${col.title} (${items.length} itens)`);
  for (const [i, item] of items.entries()) console.log(`   ${i + 1}. [${item.type}] ${item.title}`);
  if (DRY || items.length === 0) continue;

  const { data: saved, error } = await sb
    .from('collections')
    .upsert(
      { slug: col.slug, title: col.title, description: col.description, position: col.position, is_published: true },
      { onConflict: 'slug' },
    )
    .select('id')
    .single();
  if (error) { console.error(`   ✖ ${error.message}`); continue; }

  await sb.from('collection_items').delete().eq('collection_id', saved.id); // repovoa
  const rows = items.map((item, i) => ({
    collection_id: saved.id, subject_type: item.type, subject_id: item.id, position: i,
  }));
  const { error: itemsErr } = await sb.from('collection_items').insert(rows);
  console.log(itemsErr ? `   ✖ itens: ${itemsErr.message}` : `   ✓ publicada com ${rows.length} itens`);
}
console.log(DRY ? '\n(dry-run — nada gravado)' : '\n✓ Coleções curadas no ar!');
