import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Game } from '@romvault/core';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';

export interface GamesFilter {
  platform?: string;
  genre?: string;
  search?: string;
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
