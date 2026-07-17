import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';

const db = () => getSupabase() as unknown as SupabaseClient;

/**
 * Idioma -> CÓDIGO curto (sem emoji — proibido no projeto).
 * Ex.: "Portuguese (Brazil)" -> BR · "English" -> EN · "Polish" -> PL
 */
export function langCode(language: string): string {
  const l = language.toLowerCase();
  if (l.includes('brazil') || l.includes('brasil') || (l.includes('portug') && l.includes('br'))) return 'BR';
  if (l.includes('portug')) return 'PT';
  if (l.includes('english') || l.includes('ingl')) return 'EN';
  if (l.includes('spanish') || l.includes('espa')) return 'ES';
  if (l.includes('french') || l.includes('franc')) return 'FR';
  if (l.includes('german') || l.includes('alem')) return 'DE';
  if (l.includes('italian') || l.includes('ital')) return 'IT';
  if (l.includes('polish') || l.includes('polon')) return 'PL';
  if (l.includes('russian') || l.includes('russo')) return 'RU';
  if (l.includes('chinese') || l.includes('chin')) return 'ZH';
  if (l.includes('korean') || l.includes('corea')) return 'KO';
  if (l.includes('japanese') || l.includes('japon')) return 'JA';
  if (l.includes('dutch') || l.includes('holand')) return 'NL';
  if (l.includes('swedish') || l.includes('sueco')) return 'SE';
  if (l.includes('catalan') || l.includes('catal')) return 'CA';
  if (l.includes('arabic') || l.includes('arab')) return 'AR';
  if (l.includes('greek') || l.includes('grego')) return 'EL';
  if (l.includes('turkish') || l.includes('turco')) return 'TR';
  return language.slice(0, 2).toUpperCase();
}

/** Código do idioma DA INTERFACE (o card só mostra selinho se casar com ele). */
export function uiLangCode(i18nLanguage: string): string {
  return i18nLanguage.toLowerCase().startsWith('pt') ? 'BR' : 'EN';
}

/**
 * Códigos de idioma de tradução disponíveis para um LOTE de jogos (uma query
 * por página, não por card). Map<game_id, códigos únicos>.
 */
export function useTranslationLangs(gameIds: string[]) {
  const key = [...gameIds].sort().join(',');
  return useQuery({
    queryKey: ['translationLangs', key],
    enabled: env.configured && gameIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, string[]>> => {
      // .in() em CHUNKS de 200 ids: uma biblioteca grande estourava o limite
      // de tamanho da URL e o filtro "jogável no meu idioma" falhava calado.
      const rows: { game_id: string; language: string }[] = [];
      for (let i = 0; i < gameIds.length; i += 200) {
        const { data, error } = await db()
          .from('translations')
          .select('game_id, language')
          .in('game_id', gameIds.slice(i, i + 200))
          .eq('is_public', true)
          .not('language', 'is', null);
        if (error) throw error;
        rows.push(...((data ?? []) as { game_id: string; language: string }[]));
      }
      const map = new Map<string, Set<string>>();
      for (const r of rows) {
        const code = langCode(String(r.language));
        map.set(r.game_id, (map.get(r.game_id) ?? new Set()).add(code));
      }
      const out = new Map<string, string[]>();
      for (const [id, set] of map) {
        out.set(id, [...set].sort((a, b) => (a === 'BR' ? -1 : b === 'BR' ? 1 : a.localeCompare(b))));
      }
      return out;
    },
  });
}
