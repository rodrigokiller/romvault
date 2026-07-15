import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';

/** Shim sem tipagem de tabela: a busca varre várias tabelas por nome dinâmico. */
const db = () => getSupabase() as unknown as SupabaseClient;

export type SearchKind = 'game' | 'romhack' | 'translation' | 'document' | 'tool' | 'article';

export interface SearchResult {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string | null;
  to: string;
}

/** Uma tabela pesquisável: como buscar, rotear e rotular cada acerto. */
interface Source {
  table: string;
  kind: SearchKind;
  /** coluna usada como identificador na rota (id ou slug). */
  ref: 'id' | 'slug';
  route: (ref: string) => string;
  subtitle?: string;
}

const SOURCES: Source[] = [
  { table: 'games', kind: 'game', ref: 'slug', route: (r) => `/games/${r}`, subtitle: 'developer' },
  { table: 'romhacks', kind: 'romhack', ref: 'id', route: (r) => `/romhacks/${r}` },
  { table: 'translations', kind: 'translation', ref: 'id', route: (r) => `/translations/${r}`, subtitle: 'language' },
  { table: 'documents', kind: 'document', ref: 'id', route: (r) => `/docs/${r}`, subtitle: 'category' },
  { table: 'tools', kind: 'tool', ref: 'id', route: (r) => `/tools/${r}`, subtitle: 'category' },
  { table: 'articles', kind: 'article', ref: 'slug', route: (r) => `/articles/${r}`, subtitle: 'excerpt' },
];

async function searchSource(src: Source, term: string, perSource: number): Promise<SearchResult[]> {
  const cols = ['id', 'title', src.ref, src.subtitle].filter(Boolean).join(', ');
  const { data, error } = await db()
    .from(src.table)
    .select(cols)
    .ilike('title', `%${term}%`)
    .limit(perSource);
  if (error) throw error;
  return (data ?? []).map((row): SearchResult => {
    const r = row as unknown as Record<string, unknown>;
    const ref = String(r[src.ref] ?? r.id);
    return {
      id: String(r.id),
      kind: src.kind,
      title: String(r.title),
      subtitle: src.subtitle ? ((r[src.subtitle] as string | null) ?? null) : null,
      to: src.route(ref),
    };
  });
}

/**
 * Busca global por título em todas as entidades. Usada tanto pelo dropdown do
 * header (perSource baixo) quanto pela página /search (perSource alto).
 */
export function useSearch(term: string, perSource = 5) {
  const q = term.trim();
  return useQuery({
    queryKey: ['search', q, perSource],
    enabled: env.configured && q.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<SearchResult[]> => {
      const groups = await Promise.all(SOURCES.map((s) => searchSource(s, q, perSource)));
      // intercala por relevância aproximada: prefixo exato primeiro
      const flat = groups.flat();
      const lower = q.toLowerCase();
      return flat.sort((a, b) => {
        const ap = a.title.toLowerCase().startsWith(lower) ? 0 : 1;
        const bp = b.title.toLowerCase().startsWith(lower) ? 0 : 1;
        return ap - bp;
      });
    },
  });
}
