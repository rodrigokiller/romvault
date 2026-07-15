import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import type { MaterialKind } from './useMaterials';

/** Shim sem tipagem de tabela: contagens e trending operam por nome dinâmico. */
const db = () => getSupabase() as unknown as SupabaseClient;

/* ── contagens para os stats da home ────────────────────────────────────────── */
export interface Stats {
  games: number;
  romhacks: number;
  translations: number;
  tools: number;
}

async function count(table: string): Promise<number> {
  const { count, error } = await db()
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    enabled: env.configured,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Stats> => {
      const [games, romhacks, translations, tools] = await Promise.all([
        count('games'),
        count('romhacks'),
        count('translations'),
        count('tools'),
      ]);
      return { games, romhacks, translations, tools };
    },
  });
}

/* ── trending: os itens mais baixados entre as entidades de material ─────────── */
export interface TrendingItem {
  id: string;
  kind: MaterialKind;
  title: string;
  downloads: number;
  rating: number;
  thumbnail: string | null;
  to: string;
}

const KIND_ROUTE: Record<MaterialKind, string> = {
  romhacks: 'romhacks',
  translations: 'translations',
  documents: 'docs',
  tools: 'tools',
};

export function useTrending(limit = 8) {
  return useQuery({
    queryKey: ['trending', limit],
    enabled: env.configured,
    queryFn: async (): Promise<TrendingItem[]> => {
      const kinds: MaterialKind[] = ['romhacks', 'translations', 'tools', 'documents'];
      const perKind = Math.ceil(limit / 2);
      const results = await Promise.all(
        kinds.map(async (kind) => {
          const { data, error } = await db()
            .from(kind)
            .select('id, title, downloads, rating, thumbnail')
            .order('downloads', { ascending: false })
            .limit(perKind);
          if (error) throw error;
          return (data ?? []).map((r): TrendingItem => ({
            id: r.id as string,
            kind,
            title: r.title as string,
            downloads: (r.downloads as number) ?? 0,
            rating: (r.rating as number) ?? 0,
            thumbnail: (r.thumbnail as string | null) ?? null,
            to: `/${KIND_ROUTE[kind]}/${r.id}`,
          }));
        }),
      );
      return results
        .flat()
        .sort((a, b) => b.downloads - a.downloads)
        .slice(0, limit);
    },
  });
}
