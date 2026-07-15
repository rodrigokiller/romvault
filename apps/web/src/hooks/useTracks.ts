import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Game } from '@romvault/core';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useAuth } from '@/auth/AuthProvider';

const db = () => getSupabase() as unknown as SupabaseClient;

export type TrackStatus = 'playing' | 'finished' | 'abandoned' | 'backlog';
export const TRACK_STATUSES: TrackStatus[] = ['playing', 'finished', 'abandoned', 'backlog'];

export interface Track {
  user_id: string;
  game_id: string;
  status: TrackStatus;
  platform: string | null;
  hours_played: number | null;
  achievements_earned: number | null;
  achievements_total: number | null;
  notes: string | null;
  source: string;
  updated_at: string;
}

export interface TrackWithGame extends Track {
  game: Game;
}

/** O track do usuário logado para um jogo (null = fora da biblioteca). */
export function useMyTrack(gameId: string | undefined) {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: ['track', gameId, uid],
    enabled: env.configured && Boolean(gameId && uid),
    queryFn: async (): Promise<Track | null> => {
      const { data, error } = await db()
        .from('game_tracks')
        .select('*')
        .eq('user_id', uid as string)
        .eq('game_id', gameId as string)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Track | null) ?? null;
    },
  });
}

/** Define/atualiza o status de um jogo na biblioteca do usuário. */
export function useSetTrack(gameId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Track> & { status: TrackStatus }) => {
      const uid = user?.id;
      if (!uid || !gameId) throw new Error('Não autenticado.');
      const { error } = await db().from('game_tracks').upsert(
        { user_id: uid, game_id: gameId, ...patch },
        { onConflict: 'user_id,game_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['track', gameId] });
      void qc.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

export function useRemoveTrack(gameId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const uid = user?.id;
      if (!uid || !gameId) throw new Error('Não autenticado.');
      const { error } = await db().from('game_tracks').delete()
        .eq('user_id', uid).eq('game_id', gameId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['track', gameId] });
      void qc.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

/** Biblioteca completa de um usuário (com os jogos embutidos). */
export function useLibrary(userId: string | undefined) {
  return useQuery({
    queryKey: ['library', userId],
    enabled: env.configured && Boolean(userId),
    queryFn: async (): Promise<TrackWithGame[]> => {
      const { data, error } = await db()
        .from('game_tracks')
        .select('*, game:games(*)')
        .eq('user_id', userId as string)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as TrackWithGame[]).filter((t) => t.game);
    },
  });
}
