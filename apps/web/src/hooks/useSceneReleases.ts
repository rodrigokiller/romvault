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
  date: string | null;   // release_date ?? created_at (o que aparecer)
  source: string | null; // data_source (rhdn, pobre, romhacking.net.br, ...)
  fileUrl: string | null;
  gameTitle: string | null;
  gameSlug: string | null;
  cover: string | null;
}

// deno linter n/a — util do front
type Row = {
  id: string; title: string | null; language?: string | null;
  release_date: string | null; created_at: string | null;
  file_url: string | null; data_source: string | null; thumbnail: string | null;
  game: { title?: string; slug?: string; cover_url?: string | null; thumbnail?: string | null } | null;
};

const SEL = 'id, title, release_date, created_at, file_url, data_source, thumbnail, game:games(title, slug, cover_url, thumbnail)';
const SEL_TR = `id, title, language, ${SEL.slice(SEL.indexOf('release_date'))}`;

/**
 * Feed de LANÇAMENTOS da cena: traduções + hacks mais recentes (por
 * release_date, caindo pra created_at). `ptOnly` filtra traduções PT-BR (os
 * hacks não têm idioma, então saem da lista quando PT-BR está ligado).
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
        ? Promise.resolve({ data: [] as Row[] })
        : db().from('romhacks').select(SEL)
            .order('release_date', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false }).limit(limit * 2);
      const [trs, rhs] = await Promise.all([trQ, rhP]);

      const map = (rows: Row[] | null, kind: SceneRelease['kind']): SceneRelease[] =>
        (rows ?? []).map((m) => ({
          kind, id: m.id, title: m.title ?? m.game?.title ?? '?', language: m.language ?? null,
          date: m.release_date ?? m.created_at ?? null, source: m.data_source ?? null, fileUrl: m.file_url ?? null,
          gameTitle: m.game?.title ?? null, gameSlug: m.game?.slug ?? null,
          cover: m.game?.cover_url ?? m.game?.thumbnail ?? m.thumbnail ?? null,
        }));

      const all = [...map(trs.data as Row[] | null, 'translation'), ...map((rhs as { data: Row[] | null }).data, 'romhack')];
      all.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      return all.slice(0, limit);
    },
  });
}
