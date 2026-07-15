/**
 * ROMVault — dedupe de JOGOS no banco (ex.: "Secret of Mana" do dataset +
 * "secret-of-mana-snes" do IGDB + criado pelo RHDN).
 *
 *   npm run import -- --source=dedupe --dry     # SEMPRE rode --dry primeiro!
 *   npm run import -- --source=dedupe           # funde de verdade
 *
 * Agrupa por título normalizado; dentro do grupo, funde apenas quem divide
 * ao menos uma plataforma com o "keeper" (ou não tem plataforma) — ports de
 * consoles diferentes NÃO são fundidos. Keeper = registro mais completo
 * (igdb_id > capa > descrição > screenshots). Filhos re-apontados:
 * romhacks/translations/documents (game_id), game_tracks/copies/playthroughs,
 * favorites/reviews (subject), collection_items, id_map. Campos ausentes do
 * keeper são preenchidos com os dos duplicados (capa, plataformas, etc.).
 */

const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Pontuação de completude: decide quem fica. */
function score(g) {
  return (
    (g.igdb_id != null ? 8 : 0) +
    (g.cover_url ? 4 : 0) +
    (g.description ? 2 : 0) +
    ((g.screenshots?.length ?? 0) > 0 ? 1 : 0) +
    ((g.platforms?.length ?? 0) > 0 ? 1 : 0)
  );
}

const sharePlatform = (a, b) => {
  const pa = (a.platforms ?? []).map(norm);
  const pb = (b.platforms ?? []).map(norm);
  if (pa.length === 0 || pb.length === 0) return true; // sem plataforma não restringe
  return pa.some((p) => pb.includes(p));
};

export async function dedupeGames(ctx) {
  const { sb, flag, DRY, log, c, step, itemLog } = ctx;

  step('Dedupe de jogos — carregando catálogo');
  const { data: games, error } = await sb
    .from('games')
    .select('id, slug, title, igdb_id, cover_url, thumbnail, screenshots, description, platforms, external_ids, data_source')
    .range(0, 99999);
  if (error) throw error;
  log(`  ${games.length} jogos`);

  // agrupa por título normalizado
  const groups = new Map();
  for (const g of games) {
    const key = norm(g.title);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), g]);
  }

  const stats = { grupos: 0, fundidos: 0, mantidos_ports: 0, erros: 0 };

  for (const [key, list] of groups) {
    if (list.length < 2) continue;

    // keeper = mais completo; o resto tenta fundir nele
    const sorted = [...list].sort((a, b) => score(b) - score(a));
    const keeper = sorted[0];
    const dupes = sorted.slice(1).filter((d) => sharePlatform(keeper, d));
    if (dupes.length === 0) continue;
    stats.grupos++;
    stats.mantidos_ports += sorted.length - 1 - dupes.length;

    itemLog(stats.grupos, `  ${c.green('▣')} "${keeper.title}" ${c.dim(`mantém ${keeper.slug} (${keeper.data_source ?? '?'})`)} funde: ${dupes.map((d) => d.slug).join(', ')}`);
    if (DRY) { stats.fundidos += dupes.length; continue; }

    // preenche lacunas do keeper com dados dos duplicados
    const patch = {};
    const platforms = new Set(keeper.platforms ?? []);
    let extIds = { ...(keeper.external_ids ?? {}) };
    for (const d of dupes) {
      if (!keeper.cover_url && !patch.cover_url && d.cover_url) {
        patch.cover_url = d.cover_url;
        patch.thumbnail = d.thumbnail;
      }
      if (!keeper.description && !patch.description && d.description) patch.description = d.description;
      if ((keeper.screenshots?.length ?? 0) === 0 && !patch.screenshots && (d.screenshots?.length ?? 0) > 0) {
        patch.screenshots = d.screenshots;
      }
      if (keeper.igdb_id == null && patch.igdb_id === undefined && d.igdb_id != null) patch.igdb_id = d.igdb_id;
      for (const p of d.platforms ?? []) platforms.add(p);
      extIds = { ...(d.external_ids ?? {}), ...extIds }; // keeper vence em conflito
    }
    if (platforms.size > (keeper.platforms?.length ?? 0)) patch.platforms = [...platforms];
    if (Object.keys(extIds).length > Object.keys(keeper.external_ids ?? {}).length) patch.external_ids = extIds;

    try {
      for (const d of dupes) {
        // 1) filhos simples: re-aponta game_id
        for (const t of ['romhacks', 'translations', 'documents', 'game_copies', 'game_playthroughs']) {
          await sb.from(t).update({ game_id: keeper.id }).eq('game_id', d.id);
        }
        // 2) tabelas com unicidade por usuário+jogo: move só quem não conflita
        const { data: dupTracks } = await sb.from('game_tracks').select('user_id').eq('game_id', d.id);
        for (const tr of dupTracks ?? []) {
          const { count } = await sb.from('game_tracks').select('*', { count: 'exact', head: true })
            .eq('user_id', tr.user_id).eq('game_id', keeper.id);
          if ((count ?? 0) === 0) {
            await sb.from('game_tracks').update({ game_id: keeper.id })
              .eq('user_id', tr.user_id).eq('game_id', d.id);
          }
        }
        // 3) polimórficos (subject) — conflitos são raros; erro vira delete do dupe
        for (const t of ['favorites', 'reviews']) {
          const { data: rows } = await sb.from(t).select('user_id').eq('subject_type', 'game').eq('subject_id', d.id);
          for (const r of rows ?? []) {
            const { error: e } = await sb.from(t).update({ subject_id: keeper.id })
              .eq('user_id', r.user_id).eq('subject_type', 'game').eq('subject_id', d.id);
            if (e) await sb.from(t).delete().eq('user_id', r.user_id).eq('subject_type', 'game').eq('subject_id', d.id);
          }
        }
        const { error: ciErr } = await sb.from('collection_items').update({ subject_id: keeper.id })
          .eq('subject_type', 'game').eq('subject_id', d.id);
        if (ciErr) await sb.from('collection_items').delete().eq('subject_type', 'game').eq('subject_id', d.id);
        // 4) id_map re-aponta pro keeper
        await sb.from('id_map').update({ romvault_id: keeper.id }).eq('romvault_id', d.id);
        // 5) apaga o duplicado (cascatas restantes já foram movidas)
        const { error: delErr } = await sb.from('games').delete().eq('id', d.id);
        if (delErr) { stats.erros++; log(c.red(`  ✖ apagar ${d.slug}: ${delErr.message}`)); continue; }
        stats.fundidos++;
      }
      if (Object.keys(patch).length > 0) {
        await sb.from('games').update(patch).eq('id', keeper.id);
      }
    } catch (err) {
      stats.erros++;
      log(c.red(`  ✖ grupo "${key}": ${err.message}`));
    }
  }

  if (DRY) log(c.amber('\n(dry-run — rode sem --dry para fundir de verdade)'));
  return stats;
}
