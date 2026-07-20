import {
  keepPreviousData, useInfiniteQuery, useQuery, useQueryClient,
} from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Game } from '@romvault/core';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useShowAdult } from '@/hooks/useProfile';
import { PAGE_SIZE } from './useMaterials';

/** Shim sem tipagem de tabela: usado pela busca por letra (operador regex). */
const db = () => getSupabase() as unknown as SupabaseClient;

export interface GamesFilter {
  platform?: string;
  genre?: string;
  search?: string;
  /** Letra inicial (A–Z) ou '#' (não-letra); undefined/null = todas. */
  letter?: string | null;
  /** Ordenação: título, mais novos (padrão do Explorar) ou mais antigos. */
  sort?: 'title' | 'newest' | 'oldest';
  /** Lançamento: só lançados (padrão), só previstos/futuros, ou todos. */
  release?: 'released' | 'upcoming' | 'all';
  /** Faixa de anos (inclusive). */
  yearFrom?: number;
  yearTo?: number;
  /** Só jogos "main" (fora DLC/bundle/mod) — usado nos "lançamentos recentes". */
  mainOnly?: boolean;
  /** Só com capa (recentes: nada de placeholder feio na primeira dobra). */
  hasCover?: boolean;
}

export const gamesKeys = {
  all: ['games'] as const,
  list: (filters?: GamesFilter) => ['games', 'list', filters ?? {}] as const,
  detail: (slug: string) => ['games', 'detail', slug] as const,
};

/**
 * Colunas que o GameCard/quick-view usam — select('*') nas listas trazia
 * screenshots/metadata/completion_times de 24-60 jogos por página (polish).
 */
const GAME_CARD_COLS =
  'id, title, slug, cover_url, thumbnail, platforms, genres, release_date, developer, description, franchise, series, is_adult, game_type';

/**
 * MAIS AGUARDADOS: jogos ainda não lançados, ordenados pela expectativa
 * (`hypes` = quantas pessoas seguem no IGDB). Nota não serve aqui — jogo que
 * não saiu não tem nota. Carga: `--source=igdb-upcoming`.
 */
export function useMostAwaited(limit = 6) {
  return useQuery({
    queryKey: ['mostAwaited', limit],
    enabled: env.configured,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Game[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await db().from('games').select(GAME_CARD_COLS)
        .gt('release_date', today).eq('is_adult', false)
        .order('hypes', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) return []; // coluna hypes ainda não migrada: seção só não aparece
      return (data ?? []) as unknown as Game[];
    },
  });
}

/**
 * Hook de exemplo (padrão react-query): lista de jogos.
 * `enabled` só dispara quando o Supabase está configurado — sem env, devolve
 * uma lista vazia e a página mostra o estado vazio elegante.
 */
export function useGames(filters: GamesFilter = {}) {
  const showAdult = useShowAdult();
  return useQuery({
    queryKey: [...gamesKeys.list(filters), showAdult],
    enabled: env.configured,
    queryFn: async (): Promise<Game[]> => {
      // Filtros ANTES de order/limit (métodos de filtro só existem no
      // FilterBuilder; order/limit devolvem um TransformBuilder).
      let query = db().from('games').select(GAME_CARD_COLS);
      if (filters.platform) query = query.contains('platforms', [filters.platform]);
      if (filters.genre) query = query.contains('genres', [filters.genre]);
      if (filters.search) query = query.ilike('title', `%${filters.search}%`);
      if (!showAdult) query = query.eq('is_adult', false); // +18 escondido por padrão

      const { data, error } = await query.order('title', { ascending: true }).limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as Game[];
    },
  });
}

/** Lista de jogos paginada (server-side, com filtros) para a página /games. */
export function useInfiniteGames(filters: GamesFilter = {}) {
  const showAdult = useShowAdult();
  return useInfiniteQuery({
    queryKey: ['games', 'infinite', filters, showAdult],
    enabled: env.configured,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Game[]> => {
      let query = db().from('games').select(GAME_CARD_COLS);
      if (filters.platform) query = query.contains('platforms', [filters.platform]);
      if (filters.genre) query = query.contains('genres', [filters.genre]);
      if (filters.search) query = query.ilike('title', `%${filters.search}%`);
      if (!showAdult) query = query.eq('is_adult', false);
      const from = (pageParam as number) * PAGE_SIZE;
      const { data, error } = await query
        .order('title', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return (data ?? []) as unknown as Game[];
    },
    getNextPageParam: (lastPage, pages) => (lastPage.length === PAGE_SIZE ? pages.length : undefined),
  });
}

/**
 * Página de jogos com CONTAGEM total (para paginação numerada) + filtro por
 * letra inicial. keepPreviousData mantém a página anterior visível na troca.
 */
export function useGamesPage(filters: GamesFilter, page: number, pageSize = PAGE_SIZE) {
  const showAdult = useShowAdult();
  return useQuery({
    queryKey: ['games', 'page', filters, page, pageSize, showAdult],
    enabled: env.configured,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ games: Game[]; total: number }> => {
      let q = db().from('games').select(GAME_CARD_COLS, { count: 'exact' });
      if (!showAdult) q = q.eq('is_adult', false);
      if (filters.platform) q = q.contains('platforms', [filters.platform]);
      if (filters.genre) q = q.contains('genres', [filters.genre]);
      if (filters.search) q = q.ilike('title', `%${filters.search}%`);
      if (filters.letter === '#') q = q.filter('title', 'imatch', '^[^A-Za-z]');
      else if (filters.letter) q = q.ilike('title', `${filters.letter}%`);
      // lançamento: por padrão só o que JÁ saiu (sem data conta como lançado —
      // retrô antigo muitas vezes não tem data); "upcoming" = data futura.
      const today = new Date().toISOString().slice(0, 10);
      const release = filters.release ?? 'released';
      if (release === 'released') q = q.or(`release_date.lte.${today},release_date.is.null`);
      else if (release === 'upcoming') q = q.gt('release_date', today);
      // "lançamentos recentes" limpos: só jogos main COM capa e igdb (nada de
      // DLC/bundle/edição especial de 2025 poluindo a primeira dobra)
      if (filters.mainOnly) q = q.eq('game_type', 'main').not('igdb_id', 'is', null);
      if (filters.hasCover) q = q.not('cover_url', 'is', null);
      if (filters.yearFrom) q = q.gte('release_date', `${filters.yearFrom}-01-01`);
      if (filters.yearTo) q = q.lte('release_date', `${filters.yearTo}-12-31`);
      const sort = filters.sort ?? 'title';
      if (sort === 'newest') q = q.order('release_date', { ascending: false, nullsFirst: false });
      else if (sort === 'oldest') q = q.order('release_date', { ascending: true, nullsFirst: false });
      q = q.order('title', { ascending: true }); // desempate estável
      const from = page * pageSize;
      const { data, count, error } = await q.range(from, from + pageSize - 1);
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

/** Jogos relacionados: mesma franquia; senão, com gênero em comum. */
export function useRelatedGames(game: Game | null | undefined) {
  return useQuery({
    queryKey: ['games', 'related', game?.id],
    enabled: env.configured && Boolean(game?.id),
    staleTime: 5 * 60_000, // relacionados quase não mudam (polish)
    queryFn: async (): Promise<Game[]> => {
      const g = game as Game;
      if (g.franchise) {
        const { data } = await db()
          .from('games').select(GAME_CARD_COLS)
          .eq('franchise', g.franchise).neq('id', g.id).limit(6);
        if (data && data.length) return data as unknown as Game[];
      }
      if (g.genres && g.genres.length) {
        const { data } = await db()
          .from('games').select(GAME_CARD_COLS)
          .overlaps('genres', g.genres).neq('id', g.id).limit(6);
        return (data ?? []) as unknown as Game[];
      }
      return [];
    },
  });
}

/** Utilitário para invalidar as queries de jogos após uma mutação. */
export function useInvalidateGames() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: gamesKeys.all });
}
