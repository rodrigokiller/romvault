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

const SUBJECT_TO_KIND: Record<string, MaterialKind> = {
  romhack: 'romhacks', translation: 'translations', tool: 'tools', document: 'documents',
};

/** Trending semanal real: agrega download_events (RPC) e resolve as entidades. */
async function trendingWeek(limit: number): Promise<TrendingItem[]> {
  const { data: agg, error } = await db().rpc('trending_week', { days: 7, lim: limit });
  if (error || !agg) return [];
  const rows = agg as { subject_type: string; subject_id: string; cnt: number }[];
  if (rows.length === 0) return [];

  // agrupa ids por tabela e resolve num lote por tipo
  const byKind = new Map<MaterialKind, string[]>();
  for (const r of rows) {
    const kind = SUBJECT_TO_KIND[r.subject_type];
    if (!kind) continue;
    byKind.set(kind, [...(byKind.get(kind) ?? []), r.subject_id]);
  }
  const info = new Map<string, { title: string; rating: number; thumbnail: string | null }>();
  await Promise.all(
    [...byKind.entries()].map(async ([kind, ids]) => {
      const { data } = await db().from(kind).select('id, title, rating, thumbnail').in('id', ids);
      for (const it of data ?? []) {
        const r = it as Record<string, unknown>;
        info.set(String(r.id), {
          title: String(r.title),
          rating: (r.rating as number) ?? 0,
          thumbnail: (r.thumbnail as string | null) ?? null,
        });
      }
    }),
  );

  // reconstrói na ordem de cnt (downloads da semana)
  const out: TrendingItem[] = [];
  for (const r of rows) {
    const kind = SUBJECT_TO_KIND[r.subject_type];
    const meta = kind ? info.get(r.subject_id) : undefined;
    if (!kind || !meta) continue;
    out.push({
      id: r.subject_id, kind, title: meta.title,
      downloads: Number(r.cnt), rating: meta.rating, thumbnail: meta.thumbnail,
      to: `/${KIND_ROUTE[kind]}/${r.subject_id}`,
    });
  }
  return out;
}

/** Fallback: ordena pela coluna downloads (acumulado) quando não há eventos ainda. */
async function trendingByDownloads(limit: number): Promise<TrendingItem[]> {
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
  return results.flat().sort((a, b) => b.downloads - a.downloads).slice(0, limit);
}

export function useTrending(limit = 8) {
  return useQuery({
    queryKey: ['trending', limit],
    enabled: env.configured,
    staleTime: 5 * 60_000, // agregado SEMANAL: refazer a cada 30s era desperdício
    queryFn: async (): Promise<TrendingItem[]> => {
      const weekly = await trendingWeek(limit);
      return weekly.length ? weekly : trendingByDownloads(limit);
    },
  });
}
