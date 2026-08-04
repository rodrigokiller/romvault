import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';

const db = () => getSupabase() as unknown as SupabaseClient;

export interface SceneRelease {
  kind: 'translation' | 'romhack';
  id: string;
  title: string;
  language: string | null;
  date: string | null;   // release_date/published_at ?? created_at
  source: string | null; // data_source (rhdn, pobre, romhacking.net.br, ...)
  href: string;          // rota interna OU url externa (fórum)
  external: boolean;
  gameTitle: string | null;
  gameSlug: string | null;
  cover: string | null;
}

type GameRel = { title?: string; slug?: string; cover_url?: string | null; thumbnail?: string | null } | null;
type MatRow = {
  id: string; title: string | null; language?: string | null;
  release_date: string | null; created_at: string | null;
  data_source: string | null; thumbnail: string | null; game: GameRel;
};
type SceneRow = {
  id: string; kind: 'translation' | 'hack'; title: string; language: string | null;
  source: string | null; source_url: string; published_at: string | null; created_at: string | null;
  game: GameRel;
};

const SEL = 'id, title, release_date, created_at, data_source, thumbnail, game:games(title, slug, cover_url, thumbnail)';
const SEL_TR = `id, title, language, ${SEL.slice(SEL.indexOf('release_date'))}`;

/**
 * Feed de LANÇAMENTOS da cena: traduções + hacks + lançamentos raspados
 * (scene_releases, só os que ainda NÃO viraram tradução), mais recentes por
 * data. `ptOnly` filtra as traduções PT-BR; os hacks saem quando ligado, mas os
 * scene_releases (fórum BR) são sempre PT-BR e continuam.
 */
export function useSceneReleases(opts: { ptOnly?: boolean; limit?: number } = {}) {
  const { ptOnly = false, limit = 30 } = opts;
  return useQuery({
    queryKey: ['sceneReleases', ptOnly, limit],
    enabled: env.configured,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SceneRelease[]> => {
      let trQ = db().from('translations').select(SEL_TR)
        .order('release_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }).limit(limit * 2);
      if (ptOnly) trQ = trQ.or('language.ilike.%portug%,language.ilike.%(br)%,language.ilike.%brazil%');
      const rhP = ptOnly
        ? Promise.resolve({ data: [] as MatRow[] })
        : db().from('romhacks').select(SEL)
            .order('release_date', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false }).limit(limit * 2);
      const scP = db().from('scene_releases')
        .select('id, kind, title, language, source, source_url, published_at, created_at, game:games(title, slug, cover_url, thumbnail)')
        .is('matched_translation_id', null)
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }).limit(limit * 2);
      const [trs, rhs, scs] = await Promise.all([trQ, rhP, scP]);

      const fromMat = (rows: MatRow[] | null, kind: SceneRelease['kind']): SceneRelease[] =>
        (rows ?? []).map((m) => ({
          kind, id: m.id, title: m.title ?? m.game?.title ?? '?', language: m.language ?? null,
          date: m.release_date ?? m.created_at ?? null, source: m.data_source ?? null,
          href: `/${kind === 'translation' ? 'translations' : 'romhacks'}/${m.id}`, external: false,
          gameTitle: m.game?.title ?? null, gameSlug: m.game?.slug ?? null,
          cover: m.game?.cover_url ?? m.game?.thumbnail ?? m.thumbnail ?? null,
        }));
      const fromScene = (rows: SceneRow[] | null): SceneRelease[] =>
        (rows ?? []).map((s) => ({
          kind: s.kind === 'hack' ? 'romhack' : 'translation', id: s.id, title: s.title,
          language: s.language ?? null, date: s.published_at ?? s.created_at ?? null, source: s.source ?? null,
          href: s.source_url, external: true,
          gameTitle: s.game?.title ?? null, gameSlug: s.game?.slug ?? null,
          cover: s.game?.cover_url ?? s.game?.thumbnail ?? null,
        }));

      const all = [
        ...fromMat(trs.data as MatRow[] | null, 'translation'),
        ...fromMat((rhs as { data: MatRow[] | null }).data, 'romhack'),
        ...fromScene(scs.data as SceneRow[] | null),
      ];
      all.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      return all.slice(0, limit);
    },
  });
}
