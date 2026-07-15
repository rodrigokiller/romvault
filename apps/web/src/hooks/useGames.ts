import {
  keepPreviousData, useInfiniteQuery, useQuery, useQueryClient,
} from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Game } from '@romvault/core';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { PAGE_SIZE } from './useMaterials';

/** Shim sem tipagem de tabela: usado pela busca por letra (operador regex). */
const db = () => getSupabase() as unknown as SupabaseClient;

export interface GamesFilter {
  platform?: string;
  genre?: string;
  search?: string;
  /** Letra inicial (A–Z) ou '#' (não-letra); undefined/null = todas. */
  letter?: string | null;
}

export const gamesKeys = {
  all: ['games'] as const,
  list: (filters?: GamesFilter) => ['games', 'list', filters ?? {}] as const,
  detail: (slug: string) => ['games', 'detail', slug] as const,
};

/**
 * Hook de exemplo (padrão react-query): lista de jogos.
 * `enabled` só dispara quando o Supabase está configurado — sem env, devolve
 * uma lista vazia e a página mostra o estado vazio elegante.
 */
export function useGames(filters: GamesFilter = {}) {
  return useQuery({
    queryKey: gamesKeys.list(filters),
    enabled: env.configured,
    queryFn: async (): Promise<Game[]> => {
      // Filtros ANTES de order/limit (métodos de filtro só existem no
      // FilterBuilder; order/limit devolvem um TransformBuilder).
      let query = getSupabase().from('games').select('*');
      if (filters.platform) query = query.contains('platforms', [filters.platform]);
      if (filters.genre) query = query.contains('genres', [filters.genre]);
      if (filters.search) query = query.ilike('title', `%${filters.search}%`);

      const { data, error } = await query.order('title', { ascending: true }).limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Lista de jogos paginada (server-side, com filtros) para a página /games. */
export function useInfiniteGames(filters: GamesFilter = {}) {
  return useInfiniteQuery({
    queryKey: ['games', 'infinite', filters],
    enabled: env.configured,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Game[]> => {
      let query = getSupabase().from('games').select('*');
      if (filters.platform) query = query.contains('platforms', [filters.platform]);
      if (filters.genre) query = query.contains('genres', [filters.genre]);
      if (filters.search) query = query.ilike('title', `%${filters.search}%`);
      const from = (pageParam as number) * PAGE_SIZE;
      const { data, error } = await query
        .order('title', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (lastPage, pages) => (lastPage.length === PAGE_SIZE ? pages.length : undefined),
  });
}

/**
 * Página de jogos com CONTAGEM total (para paginação numerada) + filtro por
 * letra inicial. keepPreviousData mantém a página anterior visível na troca.
 */
export function useGamesPage(filters: GamesFilter, page: number, pageSize = PAGE_SIZE) {
  return useQuery({
    queryKey: ['games', 'page', filters, page, pageSize],
    enabled: env.configured,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ games: Game[]; total: number }> => {
      let q = db().from('games').select('*', { count: 'exact' });
      if (filters.platform) q = q.contains('platforms', [filters.platform]);
      if (filters.genre) q = q.contains('genres', [filters.genre]);
      if (filters.search) q = q.ilike('title', `%${filters.search}%`);
      if (filters.letter === '#') q = q.filter('title', 'imatch', '^[^A-Za-z]');
      else if (filters.letter) q = q.ilike('title', `${filters.letter}%`);
      const from = page * pageSize;
      const { data, count, error } = await q
        .order('title', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      return { games: (data ?? []) as unknown as Game[], total: count ?? 0 };
    },
  });
}

/** Valores distintos de plataforma/gênero (dropdowns de filtro completos). */
export function useGameFacets() {
  return useQuery({
    queryKey: ['games', 'facets'],
    enabled: env.configured,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ platforms: string[]; genres: string[] }> => {
      const { data, error } = await db().rpc('game_facets');
      if (error) throw error;
      const rows = (data ?? []) as { kind: string; value: string }[];
      return {
        platforms: rows.filter((r) => r.kind === 'platform').map((r) => r.value),
        genres: rows.filter((r) => r.kind === 'genre').map((r) => r.value),
      };
    },
  });
}

/** Letras iniciais que têm jogos (para acender/apagar a barra A–Z). */
export function useGameLetters(filters: { platform?: string; genre?: string }) {
  return useQuery({
    queryKey: ['games', 'letters', filters],
    enabled: env.configured,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await db().rpc('games_first_letters', {
        p_platform: filters.platform || null,
        p_genre: filters.genre || null,
      });
      if (error) throw error;
      return new Set((data ?? []).map((r: { letter: string }) => r.letter));
    },
  });
}

export function useGame(slug: string | undefined) {
  return useQuery({
    queryKey: gamesKeys.detail(slug ?? ''),
    enabled: env.configured && Boolean(slug),
    queryFn: async (): Promise<Game | null> => {
      const { data, error } = await getSupabase()
        .from('games')
        .select('*')
        .eq('slug', slug as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Utilitário para invalidar as queries de jogos após uma mutação. */
export function useInvalidateGames() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: gamesKeys.all });
}
