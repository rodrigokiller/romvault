/**
 * Geração de slug canônico para jogos e artigos.
 * Regras: minúsculo, sem acentos, apenas [a-z0-9-], hifens colapsados,
 * sem hifens nas pontas. Opcionalmente sufixado pela plataforma para
 * desambiguar títulos iguais em consoles diferentes (ex.: "chrono-trigger-snes").
 */

/** Remove acentos/diacríticos via decomposição Unicode (faixa U+0300–U+036F). */
export function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Converte um texto livre num segmento de slug seguro para URL. */
export function slugifyText(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(/['’"]/g, '') // apostrofos somem em vez de virar hifen
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Slug de um jogo. Quando a plataforma é informada, ela é anexada como
 * sufixo para evitar colisão entre ports do mesmo título.
 */
export function slugify(title: string, platform?: string | null): string {
  const base = slugifyText(title);
  if (!platform) return base;
  const plat = slugifyText(platform);
  if (!plat || base.endsWith(`-${plat}`)) return base;
  return `${base}-${plat}`;
}
