import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Game } from '@romvault/core';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useAuth } from '@/auth/AuthProvider';

const db = () => getSupabase() as unknown as SupabaseClient;

export type TrackStatus = 'playing' | 'finished' | 'abandoned' | 'backlog' | 'owned';
export const TRACK_STATUSES: TrackStatus[] = ['playing', 'finished', 'abandoned', 'backlog', 'owned'];

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
  /** jogo escondido da biblioteca/vitrine públicas (só o dono vê) */
  is_private?: boolean;
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
      void qc.invalidateQueries({ queryKey: ['trackMap'] });
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
      void qc.invalidateQueries({ queryKey: ['trackMap'] });
      void qc.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

/* ── Cópias (nível coleção: N por usuário+jogo) ─────────────────────────────── */
export interface GameCopy {
  id: string;
  user_id: string;
  game_id: string;
  platform: string;
  distribution: 'physical' | 'digital';
  store: string | null;
  edition: string | null;
  region: string | null;
  notes: string | null;
  acquired_at: string | null;
  price_paid: number | null;
  /** Cópia patcheada (repro/EverDrive/ISO): qual tradução/hack está gravada. */
  patch_kind: 'translation' | 'romhack' | null;
  patch_id: string | null;
}

/** Cópias do usuário logado para um jogo. */
export function useMyCopies(gameId: string | undefined) {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: ['copies', gameId, uid],
    enabled: env.configured && Boolean(gameId && uid),
    queryFn: async (): Promise<GameCopy[]> => {
      const { data, error } = await db()
        .from('game_copies').select('*')
        .eq('user_id', uid as string).eq('game_id', gameId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as GameCopy[];
    },
  });
}

export function useAddCopy(gameId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (copy: Partial<GameCopy> & { platform: string }) => {
      const uid = user?.id;
      if (!uid || !gameId) throw new Error('Não autenticado.');
      const { error } = await db().from('game_copies').insert({ ...copy, user_id: uid, game_id: gameId });
      if (error) throw error;
      // cópia sem status = jogo "Na coleção": entra na biblioteca automaticamente
      // (nunca sobrescreve um status já marcado — só cria quando não existe track)
      const { count } = await db().from('game_tracks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid).eq('game_id', gameId);
      if ((count ?? 0) === 0) {
        await db().from('game_tracks').insert({
          user_id: uid, game_id: gameId, status: 'owned', platform: copy.platform, source: 'manual',
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['copies', gameId] });
      void qc.invalidateQueries({ queryKey: ['libraryCopies'] });
      void qc.invalidateQueries({ queryKey: ['track', gameId] });
      void qc.invalidateQueries({ queryKey: ['trackMap'] });
      void qc.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

/**
 * Privacidade POR JOGO (estilo Steam): marca track E cópias como privados —
 * a RLS garante que linha privada só sai pro dono; aqui é só o interruptor.
 */
export function useSetGamePrivacy() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ gameId, isPrivate }: { gameId: string; isPrivate: boolean }) => {
      const uid = user?.id;
      if (!uid) throw new Error('Não autenticado.');
      const { error: e1 } = await db().from('game_tracks')
        .update({ is_private: isPrivate })
        .eq('user_id', uid).eq('game_id', gameId);
      if (e1) throw e1;
      const { error: e2 } = await db().from('game_copies')
        .update({ is_private: isPrivate })
        .eq('user_id', uid).eq('game_id', gameId);
      if (e2) throw e2;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['track', v.gameId] });
      void qc.invalidateQueries({ queryKey: ['copies', v.gameId] });
      void qc.invalidateQueries({ queryKey: ['library'] });
      void qc.invalidateQueries({ queryKey: ['libraryCopies'] });
      void qc.invalidateQueries({ queryKey: ['ownedGames'] });
    },
  });
}

/**
 * Privacidade EM MASSA (modo seleção da Library): mesmo interruptor do
 * useSetGamePrivacy, mas pra N jogos de uma vez — ids em blocos de 200 pra
 * não estourar o limite de URL do PostgREST.
 */
export function useSetGamesPrivacyBulk() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ gameIds, isPrivate }: { gameIds: string[]; isPrivate: boolean }) => {
      const uid = user?.id;
      if (!uid) throw new Error('Não autenticado.');
      for (let i = 0; i < gameIds.length; i += 200) {
        const chunk = gameIds.slice(i, i + 200);
        const { error: e1 } = await db().from('game_tracks')
          .update({ is_private: isPrivate })
          .eq('user_id', uid).in('game_id', chunk);
        if (e1) throw e1;
        const { error: e2 } = await db().from('game_copies')
          .update({ is_private: isPrivate })
          .eq('user_id', uid).in('game_id', chunk);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['library'] });
      void qc.invalidateQueries({ queryKey: ['libraryCopies'] });
      void qc.invalidateQueries({ queryKey: ['ownedGames'] });
      void qc.invalidateQueries({ queryKey: ['track'] });
      void qc.invalidateQueries({ queryKey: ['copies'] });
    },
  });
}

/**
 * Arte custom do usuário pra um jogo (vitrine): atualiza o track; se o jogo
 * ainda não tem track, cria um "Na coleção" — nunca mexe num status existente.
 */
export function useSetCustomArt() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ gameId, url }: { gameId: string; url: string | null }) => {
      const uid = user?.id;
      if (!uid) throw new Error('Não autenticado.');
      const { data, error } = await db().from('game_tracks')
        .update({ custom_art: url })
        .eq('user_id', uid).eq('game_id', gameId)
        .select('game_id');
      if (error) throw error;
      if (!data?.length) {
        const { error: insErr } = await db().from('game_tracks').insert({
          user_id: uid, game_id: gameId, status: 'owned', custom_art: url, source: 'manual',
        });
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ownedGames'] });
      void qc.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

export function useRemoveCopy(gameId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (copyId: string) => {
      const { error } = await db().from('game_copies').delete().eq('id', copyId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['copies', gameId] });
      void qc.invalidateQueries({ queryKey: ['libraryCopies'] });
    },
  });
}

/** Todas as cópias de um usuário (para a estante agrupar por plataforma). */
export function useLibraryCopies(userId: string | undefined) {
  return useQuery({
    queryKey: ['libraryCopies', userId],
    staleTime: 5 * 60_000,
    enabled: env.configured && Boolean(userId),
    queryFn: async (): Promise<GameCopy[]> => {
      const { data, error } = await db()
        .from('game_copies').select('*').eq('user_id', userId as string).range(0, 9999);
      if (error) throw error;
      return (data ?? []) as unknown as GameCopy[];
    },
  });
}

/* ── Dados de SYNC por provedor (game_sync_data): o dado bruto de cada conta ── */
export interface SyncData {
  provider: string;
  platform: string | null;
  hours_played: number | null;
  achievements_earned: number | null;
  achievements_total: number | null;
  progress: number | null;
  last_played: string | null;
  synced_at: string;
}

/** Linhas de sync do usuário logado pra um jogo (Steam, RA, PSN, Xbox, GOG…). */
export function useMySyncData(gameId: string | undefined) {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: ['syncData', gameId, uid],
    enabled: env.configured && Boolean(gameId && uid),
    queryFn: async (): Promise<SyncData[]> => {
      const { data, error } = await db()
        .from('game_sync_data')
        .select('provider, platform, hours_played, achievements_earned, achievements_total, progress, last_played, synced_at')
        .eq('user_id', uid as string).eq('game_id', gameId as string)
        .order('provider');
      if (error) return [];
      return (data ?? []) as unknown as SyncData[];
    },
  });
}

/** Linhas cruas de sync de um usuário (painel de stats: heatmap/períodos). */
export function useUserSyncRows(userId: string | undefined) {
  return useQuery({
    queryKey: ['syncRows', userId],
    enabled: env.configured && Boolean(userId),
    staleTime: 60_000,
    queryFn: async (): Promise<{ game_id: string; provider: string; platform: string | null; hours_played: number | null; last_played: string | null }[]> => {
      const { data, error } = await db()
        .from('game_sync_data')
        .select('game_id, provider, platform, hours_played, last_played')
        .eq('user_id', userId as string)
        .range(0, 9999);
      if (error) return [];
      return (data ?? []) as { game_id: string; provider: string; platform: string | null; hours_played: number | null; last_played: string | null }[];
    },
  });
}

/** Map game_id -> último jogado (max entre provedores) — ordenação "Atividade". */
export function useUserLastPlayed(userId: string | undefined) {
  return useQuery({
    queryKey: ['lastPlayed', userId],
    enabled: env.configured && Boolean(userId),
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await db()
        .from('game_sync_data')
        .select('game_id, last_played')
        .eq('user_id', userId as string)
        .not('last_played', 'is', null)
        .range(0, 9999);
      if (error) return new Map();
      const map = new Map<string, string>();
      for (const r of (data ?? []) as { game_id: string; last_played: string }[]) {
        const prev = map.get(r.game_id);
        if (!prev || r.last_played > prev) map.set(r.game_id, r.last_played);
      }
      return map;
    },
  });
}

/**
 * Resumo do sync POR PROVEDOR de um usuário (a "aba tracking" dentro da
 * Library): jogos, horas somadas e conquistas por conta conectada.
 */
export function useUserSyncSummary(userId: string | undefined) {
  return useQuery({
    queryKey: ['syncSummary', userId],
    enabled: env.configured && Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db()
        .from('game_sync_data')
        .select('provider, hours_played, achievements_earned, achievements_total')
        .eq('user_id', userId as string)
        .range(0, 9999);
      if (error) return [];
      const agg = new Map<string, { games: number; hours: number; earned: number; total: number }>();
      for (const r of (data ?? []) as { provider: string; hours_played: number | null; achievements_earned: number | null; achievements_total: number | null }[]) {
        const a = agg.get(r.provider) ?? { games: 0, hours: 0, earned: 0, total: 0 };
        a.games += 1;
        a.hours += r.hours_played ?? 0;
        a.earned += r.achievements_earned ?? 0;
        a.total += r.achievements_total ?? 0;
        agg.set(r.provider, a);
      }
      return [...agg.entries()].map(([provider, a]) => ({ provider, ...a, hours: Math.round(a.hours) }));
    },
  });
}

/**
 * Relações (remaster/remake/port...) ENTRE jogos da biblioteca — pro modo
 * "Agrupar versões" da estante. Só devolve arestas com as DUAS pontas na
 * biblioteca; consulta um lado em blocos de 200 e filtra o outro no cliente.
 */
export function useLibraryRelations(gameIds: string[]) {
  const sorted = [...gameIds].sort();
  return useQuery({
    // chave barata mas sensível a mudanças reais do conjunto
    queryKey: ['libRelations', sorted.length, sorted[0] ?? '', sorted[sorted.length - 1] ?? ''],
    enabled: env.configured && gameIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ a: string; b: string }[]> => {
      const inLib = new Set(gameIds);
      const edges: { a: string; b: string }[] = [];
      for (let i = 0; i < sorted.length; i += 200) {
        const { data, error } = await db()
          .from('game_relations')
          .select('game_id, related_id')
          .in('game_id', sorted.slice(i, i + 200));
        if (error) return []; // tabela ainda não migrada: modo simplesmente não liga
        for (const r of (data ?? []) as { game_id: string; related_id: string }[]) {
          if (inLib.has(r.related_id)) edges.push({ a: r.game_id, b: r.related_id });
        }
      }
      return edges;
    },
  });
}

/**
 * Mapa game_id -> status do usuário logado — UMA query compartilhada por todos
 * os cards do grid (não uma por card).
 */
export function useMyTrackMap() {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: ['trackMap', uid],
    enabled: env.configured && Boolean(uid),
    queryFn: async (): Promise<Map<string, TrackStatus>> => {
      const { data, error } = await db()
        .from('game_tracks').select('game_id, status')
        .eq('user_id', uid as string).range(0, 9999);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.game_id as string, r.status as TrackStatus]));
    },
  });
}

/* ── Zeradas (playthroughs): N por usuário+jogo, data obrigatória ───────────── */
export type PatchKind = 'translation' | 'romhack';

export interface Playthrough {
  id: string;
  finished_on: string;
  precision: 'day' | 'month' | 'year';
  notes: string | null;
  /** A PONTE hub<->tracker: com qual tradução/hack o jogo foi zerado. */
  patch_kind: PatchKind | null;
  patch_id: string | null;
}

export function useMyPlaythroughs(gameId: string | undefined) {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: ['playthroughs', gameId, uid],
    enabled: env.configured && Boolean(gameId && uid),
    queryFn: async (): Promise<Playthrough[]> => {
      const { data, error } = await db()
        .from('game_playthroughs').select('id, finished_on, precision, notes, patch_kind, patch_id')
        .eq('user_id', uid as string).eq('game_id', gameId as string)
        .order('finished_on', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Playthrough[];
    },
  });
}

export function useAddPlaythrough(gameId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      finished_on: string;
      precision: Playthrough['precision'];
      notes?: string | null;
      patch_kind?: PatchKind | null;
      patch_id?: string | null;
    }) => {
      const uid = user?.id;
      if (!uid || !gameId) throw new Error('Não autenticado.');
      const { error } = await db().from('game_playthroughs')
        .insert({ ...p, user_id: uid, game_id: gameId });
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['playthroughs', gameId] }); void qc.invalidateQueries({ queryKey: ['userPlaythroughs'] }); },
  });
}

/** Todas as zeradas de um usuário (timeline por ano, meta anual, badge ×N). */
export function useUserPlaythroughs(userId: string | undefined) {
  return useQuery({
    queryKey: ['userPlaythroughs', userId],
    staleTime: 5 * 60_000,
    enabled: env.configured && Boolean(userId),
    queryFn: async (): Promise<{ game_id: string; finished_on: string }[]> => {
      const { data, error } = await db()
        .from('game_playthroughs').select('game_id, finished_on')
        .eq('user_id', userId as string)
        .order('finished_on', { ascending: false })
        .range(0, 9999);
      if (error) throw error;
      return (data ?? []) as { game_id: string; finished_on: string }[];
    },
  });
}

export function useRemovePlaythrough(gameId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from('game_playthroughs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['playthroughs', gameId] }); void qc.invalidateQueries({ queryKey: ['userPlaythroughs'] }); },
  });
}

/** Biblioteca completa de um usuário (com os jogos embutidos). */
export function useLibrary(userId: string | undefined) {
  return useQuery({
    queryKey: ['library', userId],
    staleTime: 5 * 60_000,
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
