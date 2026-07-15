import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';

const db = () => getSupabase() as unknown as SupabaseClient;

/** Idioma -> bandeira/código curto pro selinho dos cards. */
export function langBadge(language: string): string {
  const l = language.toLowerCase();
  if (l.includes('portug') || l.includes('brazil')) return '🇧🇷';
  if (l.includes('spanish') || l.includes('espa')) return '🇪🇸';
  if (l.includes('english') || l.includes('ingl')) return '🇺🇸';
  if (l.includes('french') || l.includes('franc')) return '🇫🇷';
  if (l.includes('german') || l.includes('alem')) return '🇩🇪';
  if (l.includes('italian') || l.includes('ital')) return '🇮🇹';
  if (l.includes('polish')) return '🇵🇱';
  if (l.includes('russian')) return '🇷🇺';
  if (l.includes('chinese')) return '🇨🇳';
  if (l.includes('korean')) return '🇰🇷';
  if (l.includes('japanese') || l.includes('japon')) return '🇯🇵';
  if (l.includes('dutch')) return '🇳🇱';
  if (l.includes('swedish')) return '🇸🇪';
  if (l.includes('catalan')) return '🏳️';
  return '🌐';
}

/**
 * Idiomas de tradução disponíveis para um LOTE de jogos (uma query pela página,
 * não uma por card). Retorna Map<game_id, bandeiras únicas ordenadas (BR 1º)>.
 */
export function useTranslationLangs(gameIds: string[]) {
  const key = [...gameIds].sort().join(',');
  return useQuery({
    queryKey: ['translationLangs', key],
    enabled: env.configured && gameIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, string[]>> => {
      const { data, error } = await db()
        .from('translations')
        .select('game_id, language')
        .in('game_id', gameIds)
        .eq('is_public', true)
        .not('language', 'is', null);
      if (error) throw error;
      const map = new Map<string, Set<string>>();
      for (const r of data ?? []) {
        const badge = langBadge(String(r.language));
        map.set(r.game_id as string, (map.get(r.game_id as string) ?? new Set()).add(badge));
      }
      const out = new Map<string, string[]>();
      for (const [id, set] of map) {
        // 🇧🇷 sempre primeiro (público-alvo), resto em ordem estável
        out.set(id, [...set].sort((a, b) => (a === '🇧🇷' ? -1 : b === '🇧🇷' ? 1 : 0)));
      }
      return out;
    },
  });
}
