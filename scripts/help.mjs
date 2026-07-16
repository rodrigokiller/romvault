#!/usr/bin/env node
/** ROMVault — `npm run help`: lista todos os comandos disponíveis. */
const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  amber: (s) => `\x1b[33m${s}\x1b[0m`,
};
const row = (cmd, desc) => console.log(`  ${c.green(cmd.padEnd(58))} ${c.dim(desc)}`);
const head = (s) => console.log(`\n${c.cyan('▸ ' + s)}`);

console.log(c.cyan('\nROMVault — comandos'));

head('Desenvolvimento');
row('npm run dev', 'servidor local (Vite)');
row('npm run build', 'build de produção');
row('npm run typecheck | lint | test', 'qualidade');

head('Banco (Supabase CLI)');
row('npm run db:push', 'aplica migrations pendentes');
row('npm run db:types', 'regenera os tipos TypeScript do schema');
row('npm run db:new <nome>', 'cria uma migration nova');

head('Import — catálogo');
row('npm run import', 'dataset curado (jogos+hacks+trads de exemplo)');
row('npm run import -- --source=igdb --platform=snes --all', 'jogos puros do IGDB (cursor incremental)');
row('npm run import -- --source=rhdn --file=<romhacking.sql.zip>', 'dump do romhacking.net (hacks/trads/tools/docs)');
row('npm run import -- --source=pobre', 'PO.B.R.E: traduções PT-BR + hacks (scrape)');
row('npm run import -- --source=smwc --all', 'hacks do SMW Central (API)');

head('Import — capas & mídia');
row('npm run import -- --source=covers', 'capas via IGDB p/ jogos sem imagem');
row('npm run import -- --source=covers-libretro', 'BOX ART real (libretro → nosso Storage)');
row('npm run import -- --source=covers-libretro --backfill', 'boxart tb p/ quem JÁ tem capa de loja');
row('npm run import -- --source=screenscraper --inspect', 'box 3D/verso (requer conta dev SS_*)');
row('npm run import -- --source=mobygames --inspect', 'scans frente/verso/mídia (MOBY_API_KEY)');
row('npm run import -- --source=langs-igdb', 'idiomas OFICIAIS de cada jogo (IGDB)');
row('npm run import -- --source=all', 'pipeline: dataset→dedupe→covers→libretro');
row('npm run import -- --source=purge-mods --dry', 'remove hacks/DLCs importados como jogos');

head('Manutenção');
row('npm run import -- --source=dedupe --dry', 'lista jogos duplicados (SEMPRE --dry antes)');
row('npm run import -- --source=dedupe', 'funde os duplicados');
row('node scripts/seed-collections.mjs', 'cria/atualiza as coleções curadas');
row('node scripts/fix-entities.mjs', 'limpa entidades HTML residuais nos títulos');

head('Flags comuns do import');
row('--dry', 'simula sem escrever (implica --verbose)');
row('--verbose', 'mostra cada item (padrão: progresso a cada 250)');
row('--limit=N  --pages=N  --all', 'controle de volume');
row('--platform=snes|ps1|switch|switch2|...', 'plataforma (igdb/covers/screenscraper)');

console.log(c.amber('\nDica: no cmd do Windows, não cole comentários "#" junto do comando.\n'));
