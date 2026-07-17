#!/usr/bin/env node
/**
 * ROMVault — rascunho do changelog a partir do Git: pega os commits da
 * última semana, agrupa por tipo (feat/fix/chore) e imprime um bloco pronto
 * pra colar em apps/web/src/data/changelog.ts (você só lapida o texto).
 *
 *   npm run changelog:draft
 *   npm run changelog:draft -- --since="14 days ago"
 */
import { execSync } from 'node:child_process';

const arg = process.argv.find((a) => a.startsWith('--since='));
const since = arg ? arg.slice(8) : '7 days ago';

const raw = execSync(`git log --since="${since}" --pretty=%s --no-merges`, { encoding: 'utf8' });
const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

const feats = [];
const fixes = [];
const rest = [];
for (const l of lines) {
  const m = l.match(/^(feat|fix|chore|docs|refactor)(\([^)]*\))?:\s*(.+)$/);
  if (!m) { rest.push(l); continue; }
  const text = m[3].split('\n')[0];
  if (m[1] === 'feat') feats.push(text);
  else if (m[1] === 'fix') fixes.push(text);
  else rest.push(text);
}

const today = new Date().toISOString().slice(0, 10);
const items = [
  ...feats.map((f) => `      '${f.replace(/'/g, "\\'")}',`),
  ...fixes.map((f) => `      'Correção: ${f.replace(/'/g, "\\'")}',`),
];

console.log(`// rascunho gerado de ${lines.length} commits (desde: ${since}) — LAPIDE o texto`);
console.log(`// pro leitor final (usuário, não dev) antes de colar em changelog.ts:\n`);
console.log(`  {
    date: '${today}',
    title: 'TÍTULO DA LEVA AQUI',
    items: [
${items.join('\n')}
    ],
  },`);
if (rest.length > 0) {
  console.log(`\n// não entraram (chore/docs/etc — inclua se relevante):`);
  for (const r of rest) console.log(`//   ${r}`);
}
