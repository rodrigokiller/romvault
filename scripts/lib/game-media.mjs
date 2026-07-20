/**
 * ROMVault — gravação de game_media (fase 2 de mídia).
 *
 * Uma linha por (jogo, plataforma, tipo, região, url). A vitrine escolhe a capa
 * da plataforma da CÓPIA do usuário (o Quake2 da Steam mostra a de PC, não a do
 * PSX) e a página do jogo monta a galeria por tipo/região.
 *
 * kinds (CHECK no banco): cover | boxart | box3d | back | media | cart | disc |
 * logo | hero | title | screenshot
 *
 * A tabela é ADITIVA: uma falha aqui (tabela ausente, conflito) NUNCA derruba o
 * import de capa — só deixa de enriquecer o game_media.
 */

/** Grava linhas em game_media, ignorando duplicatas por (game_id,url). */
export async function upsertMedia(sb, rows) {
  const clean = (rows ?? [])
    .filter((r) => r && r.game_id && r.url && r.platform && r.kind)
    .map((r) => ({ region: null, source: 'import', ...r }));
  if (clean.length === 0) return 0;
  // supabase-js resolve com { error } em vez de lançar — o erro é ignorado de
  // propósito (tabela opcional/aditiva).
  const { error } = await sb.from('game_media')
    .upsert(clean, { onConflict: 'game_id,url', ignoreDuplicates: true });
  return error ? 0 : clean.length;
}

/* país/território -> código de região curto do game_media */
const COUNTRY_REGION = [
  [/united states|\busa?\b|north america|worldwide|monde/i, 'us'],
  [/brazil|brasil/i, 'br'],
  [/jap[ao]n|nihon|\bjp\b/i, 'jp'],
  [/europe|\beu\b|united kingdom|france|germany|deutschland|spain|espa|italy|italia/i, 'eu'],
];

/** Deriva uma região curta de uma lista de países (Moby) ou string solta. */
export function regionOf(countries) {
  const s = (Array.isArray(countries) ? countries.join(' ') : String(countries ?? '')).toLowerCase();
  for (const [re, code] of COUNTRY_REGION) if (re.test(s)) return code;
  return null;
}
