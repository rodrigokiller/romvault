import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Romhack, Translation, Document, Tool, Game } from '@romvault/core';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';

/** Tamanho de página das listas paginadas. */
export const PAGE_SIZE = 24;

/**
 * Estes hooks operam por NOME DE TABELA dinâmico (kind), então o client tipado
 * por tabela atrapalha (colunas específicas, embeds). Usamos um shim sem a
 * tipagem de tabela só aqui; os tipos de retorno seguem específicos por entidade.
 */
const db = () => getSupabase() as unknown as SupabaseClient;

/**
 * Hooks das entidades "material" (romhacks, traduções, documentos, ferramentas).
 * Compartilham forma o bastante para um construtor de query genérico; os tipos
 * de retorno continuam específicos por entidade.
 */

export type MaterialKind = 'romhacks' | 'translations' | 'documents' | 'tools';

export interface MaterialFilters {
  search?: string;
  category?: string;
  language?: string;
  sort?: 'downloads' | 'rating' | 'recent';
  /** só itens com arquivo pra baixar / com screenshots */
  hasFile?: boolean;
  hasImages?: boolean;
}

/** Um material com o jogo de origem embutido (quando houver). */
export type WithGame<T> = T & { game: Game | null };

export const materialKeys = {
  list: (kind: MaterialKind, f?: MaterialFilters) => [kind, 'list', f ?? {}] as const,
  detail: (kind: MaterialKind, id: string) => [kind, 'detail', id] as const,
  byGame: (kind: MaterialKind, gameId: string) => [kind, 'byGame', gameId] as const,
};

const ORDER: Record<NonNullable<MaterialFilters['sort']>, { col: string; asc: boolean }> = {
  downloads: { col: 'downloads', asc: false },
  rating: { col: 'rating', asc: false },
  recent: { col: 'created_at', asc: false },
};

/** Coluna de "categoria" por entidade (romhacks/traduções usam array; docs/tools texto). */
const CATEGORY_COL: Record<MaterialKind, string | null> = {
  romhacks: 'categories',
  translations: 'categories',
  documents: 'category',
  tools: 'category',
};

function buildList(kind: MaterialKind, filters: MaterialFilters) {
  let q = db().from(kind).select('*');
  if (kind !== 'tools') q = q.eq('is_public', true);
  if (filters.search) q = q.ilike('title', `%${filters.search}%`);
  if (filters.language && (kind === 'translations' || kind === 'documents')) {
    q = q.eq('language', filters.language);
  }
  if (filters.category) {
    const col = CATEGORY_COL[kind];
    if (col === 'categories') q = q.contains('categories', [filters.category]);
    else if (col) q = q.eq(col, filters.category);
  }
  if (filters.hasFile) q = q.not('file_url', 'is', null);
  if (filters.hasImages) q = q.not('thumbnail', 'is', null);
  const order = ORDER[filters.sort ?? 'downloads'];
  return q.order(order.col, { ascending: order.asc });
}

function useMaterialList<T>(kind: MaterialKind, filters: MaterialFilters = {}) {
  return useQuery({
    queryKey: materialKeys.list(kind, filters),
    enabled: env.configured,
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await buildList(kind, filters).limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    },
  });
}

/** Lista paginada (infinite scroll / "carregar mais"). */
export function useInfiniteMaterials(kind: MaterialKind, filters: MaterialFilters = {}) {
  return useInfiniteQuery({
    queryKey: [kind, 'infinite', filters],
    enabled: env.configured,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Record<string, unknown>[]> => {
      const from = (pageParam as number) * PAGE_SIZE;
      const { data, error } = await buildList(kind, filters).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return (data ?? []) as unknown as Record<string, unknown>[];
    },
    getNextPageParam: (lastPage, pages) => (lastPage.length === PAGE_SIZE ? pages.length : undefined),
  });
}

function useMaterialDetail<T>(kind: MaterialKind, id: string | undefined) {
  return useQuery({
    queryKey: materialKeys.detail(kind, id ?? ''),
    enabled: env.configured && Boolean(id),
    queryFn: async (): Promise<WithGame<T> | null> => {
      // documentos/ferramentas podem não ter jogo; o embed vira null nesses casos.
      const embed = kind === 'tools' ? '*' : '*, game:games(*)';
      const { data, error } = await db()
        .from(kind)
        .select(embed)
        .eq('id', id as string)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as Record<string, unknown>;
      const game = (row.game as Game | undefined) ?? null;
      return { ...(data as unknown as T), game } as WithGame<T>;
    },
  });
}

function useByGame<T>(kind: MaterialKind, gameId: string | undefined) {
  return useQuery({
    queryKey: materialKeys.byGame(kind, gameId ?? ''),
    enabled: env.configured && Boolean(gameId),
    queryFn: async (): Promise<T[]> => {
      let q = db().from(kind).select('*').eq('game_id', gameId as string);
      if (kind !== 'tools') q = q.eq('is_public', true);
      const { data, error } = await q.order('downloads', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    },
  });
}

/* ── hooks públicos, tipados por entidade ───────────────────────────────────── */
export const useRomhacks = (f?: MaterialFilters) => useMaterialList<Romhack>('romhacks', f);
export const useRomhack = (id?: string) => useMaterialDetail<Romhack>('romhacks', id);
export const useTranslations = (f?: MaterialFilters) => useMaterialList<Translation>('translations', f);
export const useTranslationDetail = (id?: string) => useMaterialDetail<Translation>('translations', id);
export const useDocuments = (f?: MaterialFilters) => useMaterialList<Document>('documents', f);
export const useDocument = (id?: string) => useMaterialDetail<Document>('documents', id);
export const useTools = (f?: MaterialFilters) => useMaterialList<Tool>('tools', f);
export const useTool = (id?: string) => useMaterialDetail<Tool>('tools', id);

export const useGameRomhacks = (gameId?: string) => useByGame<Romhack>('romhacks', gameId);
export const useGameTranslations = (gameId?: string) => useByGame<Translation>('translations', gameId);
export const useGameDocuments = (gameId?: string) => useByGame<Document>('documents', gameId);
