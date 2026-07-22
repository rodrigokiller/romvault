import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';

const db = () => getSupabase() as unknown as SupabaseClient;

export interface Soundtrack {
  id: string; title: string; kind: string; parent_id: string | null;
  composer: string | null; release_date: string | null;
  disc_count: number | null; track_count: number | null; cover_url: string | null;
  external_ids: Record<string, string> | null;
}
export interface Track {
  soundtrack_id: string; disc: number; position: number; title: string; duration_ms: number | null;
  /** rótulo como está na capa ("A1", "2-14"); null = usa o número */
  position_label: string | null;
}

/**
 * Álbuns + faixas do jogo. Fica fora do componente pra que a página do jogo
 * possa decidir se mostra a GUIA sem disparar uma segunda consulta (o
 * react-query compartilha o cache pela mesma chave).
 */
export function useSoundtracks(gameId: string) {
  return useQuery({
    queryKey: ['soundtracks', gameId],
    enabled: env.configured && !!gameId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ albums: Soundtrack[]; tracks: Track[] }> => {
      const { data, error } = await db().from('game_soundtracks')
        .select('id, title, kind, parent_id, composer, release_date, disc_count, track_count, cover_url, external_ids')
        .eq('game_id', gameId).order('release_date', { ascending: true, nullsFirst: false });
      if (error) return { albums: [], tracks: [] }; // tabela ainda não migrada
      const albums = (data ?? []) as Soundtrack[];
      if (albums.length === 0) return { albums, tracks: [] };
      const { data: tk } = await db().from('soundtrack_tracks')
        .select('soundtrack_id, disc, position, title, duration_ms, position_label')
        .in('soundtrack_id', albums.map((a) => a.id))
        .order('disc').order('position');
      return { albums, tracks: (tk ?? []) as Track[] };
    },
  });
}
