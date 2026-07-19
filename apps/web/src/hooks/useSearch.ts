import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useShowAdult } from '@/hooks/useProfile';

/** Shim sem tipagem de tabela: a busca varre várias tabelas por nome dinâmico. */
const db = () => getSupabase() as unknown as SupabaseClient;

export type SearchKind = 'game' | 'romhack' | 'translation' | 'document' | 'tool' | 'article';

export interface SearchResult {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string | null;
  to: string;
  /** plataformas do jogo (ou do jogo PAI, em hack/tradução/doc). */
  platforms: string[];
  /** main | remake | remaster | expanded | port | mod (só jogos). */
  gameType?: string | null;
  /** valor calculado diariamente (compute_game_relevance) pra ordenação. */
  relevance?: number;
}

type Row = Record<string, unknown>;

/** Uma tabela pesquisável: como buscar, rotear e rotular cada acerto. */
interface Source {
  table: string;
  kind: SearchKind;
  /** coluna usada como identificador na rota (id ou slug). */
  ref: 'id' | 'slug';
  route: (ref: string) => string;
  subtitle?: string;
  /** select extra + extração das plataformas (próprias ou do jogo pai). */
  platsSelect?: string;
  plats?: (row: Row) => string[];
}

const ownPlats = (row: Row) => (row.platforms as string[] | null) ?? [];
const parentPlats = (row: Row) =>
  ((row.game as { platforms?: string[] } | null)?.platforms) ?? [];

const SOURCES: Source[] = [
  { table: 'games', kind: 'game', ref: 'slug', route: (r) => `/games/${r}`, subtitle: 'developer', platsSelect: 'platforms', plats: ownPlats },
  { table: 'romhacks', kind: 'romhack', ref: 'id', route: (r) => `/romhacks/${r}`, platsSelect: 'game:games(platforms)', plats: parentPlats },
  { table: 'translations', kind: 'translation', ref: 'id', route: (r) => `/translations/${r}`, subtitle: 'language', platsSelect: 'game:games(platforms)', plats: parentPlats },
  { table: 'documents', kind: 'document', ref: 'id', route: (r) => `/docs/${r}`, subtitle: 'category', platsSelect: 'game:games(platforms)', plats: parentPlats },
  { table: 'tools', kind: 'tool', ref: 'id', route: (r) => `/tools/${r}`, subtitle: 'category' },
  { table: 'articles', kind: 'article', ref: 'slug', route: (r) => `/articles/${r}`, subtitle: 'excerpt' },
];

async function searchSource(src: Source, term: string, perSource: number, hideAdult: boolean): Promise<SearchResult[]> {
  const isGames = src.table === 'games';
  const cols = ['id', 'title', src.ref, src.subtitle, src.platsSelect, isGames ? 'game_type, relevance' : null]
    .filter(Boolean).join(', ');
  let q = db().from(src.table).select(cols);
  if (isGames) {
    // jogos: busca no título E nos títulos alternativos (FF III acha o FF VI);
    // vírgula/parêntese quebram a sintaxe do .or, então saem do termo
    const safe = term.replace(/[,()]/g, ' ').trim();
    q = q.or(`title.ilike.%${safe}%,alt_search.ilike.%${safe}%`)
      .order('relevance', { ascending: false });
    if (hideAdult) q = q.eq('is_adult', false); // +18 fora da busca por padrão
  } else {
    q = q.ilike('title', `%${term}%`);
  }
  const { data, error } = await q.limit(perSource);
  if (error) {
    // colunas novas ainda não migradas: repete no formato antigo
    if (!isGames) throw error;
    const fb = await db().from('games').select('id, title, slug, developer, platforms')
      .ilike('title', `%${term}%`).limit(perSource);
    if (fb.error) throw fb.error;
    return (fb.data ?? []).map((row): SearchResult => {
      const r = row as unknown as Record<string, unknown>;
      return {
        id: String(r.id), kind: 'game', title: String(r.title),
        subtitle: (r.developer as string | null) ?? null,
        to: src.route(String(r.slug)), platforms: (r.platforms as string[] | null) ?? [],
      };
    });
  }
  return (data ?? []).map((row): SearchResult => {
    const r = row as unknown as Record<string, unknown>;
    const ref = String(r[src.ref] ?? r.id);
    return {
      id: String(r.id),
      kind: src.kind,
      title: String(r.title),
      subtitle: src.subtitle ? ((r[src.subtitle] as string | null) ?? null) : null,
      to: src.route(ref),
      platforms: src.plats ? src.plats(r) : [],
      gameType: isGames ? ((r.game_type as string | null) ?? null) : undefined,
      relevance: isGames ? Number(r.relevance ?? 0) : undefined,
    };
  });
}

/**
 * Busca global por título em todas as entidades. Usada tanto pelo dropdown do
 * header (perSource baixo) quanto pela página /search (perSource alto).
 */
export function useSearch(term: string, perSource = 5) {
  const q = term.trim();
  const showAdult = useShowAdult();
  return useQuery({
    queryKey: ['search', q, perSource, showAdult],
    enabled: env.configured && q.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<SearchResult[]> => {
      const groups = await Promise.all(SOURCES.map((s) => searchSource(s, q, perSource, !showAdult)));
      // ordena: prefixo exato primeiro; empate resolvido pela RELEVÂNCIA
      // calculada diariamente (jogo main do IGDB vence tradução/rom de teste
      // quando o nome digitado é o mesmo)
      const flat = groups.flat();
      const lower = q.toLowerCase();
      return flat.sort((a, b) => {
        const ap = a.title.toLowerCase().startsWith(lower) ? 0 : 1;
        const bp = b.title.toLowerCase().startsWith(lower) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (b.relevance ?? 0) - (a.relevance ?? 0);
      });
    },
  });
}
