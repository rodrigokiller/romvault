#!/usr/bin/env node
/**
 * ROMVault — paridade i18n (sugestão da auditoria): compara pt-BR.json e
 * en.json e falha se houver chave órfã, placeholder {{var}} divergente ou
 * par de plural _one/_other incompleto. Roda junto do lint no CI.
 *
 *   npm run check-i18n
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => JSON.parse(readFileSync(resolve(ROOT, 'apps/web/src/i18n', f), 'utf8'));

const flat = (obj, prefix = '') =>
  Object.entries(obj).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') Object.assign(acc, flat(v, key));
    else acc[key] = String(v);
    return acc;
  }, {});

const pt = flat(load('pt-BR.json'));
const en = flat(load('en.json'));
const problems = [];

// 1) chaves órfãs
for (const k of Object.keys(pt)) if (!(k in en)) problems.push(`só no pt-BR: ${k}`);
for (const k of Object.keys(en)) if (!(k in pt)) problems.push(`só no en:    ${k}`);

// 2) placeholders {{var}} divergentes
const vars = (s) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',');
for (const k of Object.keys(pt)) {
  if (k in en && vars(pt[k]) !== vars(en[k])) {
    problems.push(`placeholders divergem em ${k}: pt=[${vars(pt[k])}] en=[${vars(en[k])}]`);
  }
}

// 3) plural _one sem o par _other. (Só nessa direção: um "_other" sozinho
// pode ser id legítimo, tipo report.r_other = motivo "Outro".)
for (const dict of [['pt-BR', pt], ['en', en]]) {
  const [name, d] = dict;
  for (const k of Object.keys(d)) {
    if (k.endsWith('_one') && !(k.replace(/_one$/, '_other') in d)) {
      problems.push(`${name}: ${k} sem par _other`);
    }
  }
}

// 4) regras da casa: emoji e travessão no copy
const emojiRe = /\p{Extended_Pictographic}/u;
for (const [name, d] of [['pt-BR', pt], ['en', en]]) {
  for (const [k, v] of Object.entries(d)) {
    if (emojiRe.test(v)) problems.push(`${name}: EMOJI em ${k}`);
    if (v.includes('—')) problems.push(`${name}: TRAVESSÃO em ${k}`);
  }
}

if (problems.length > 0) {
  console.error(`✖ i18n com ${problems.length} problema(s):`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`✔ i18n em paridade: ${Object.keys(pt).length} chaves, 0 problemas.`);
