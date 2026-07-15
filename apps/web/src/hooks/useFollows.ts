import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useAuth } from '@/auth/AuthProvider';

const db = () => getSupabase() as unknown as SupabaseClient;

/** Estou seguindo este usuário? */
export function useIsFollowing(userId: string | undefined) {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: ['following', userId, uid],
    enabled: env.configured && Boolean(userId && uid) && userId !== uid,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await db()
        .from('follows').select('followed_id')
        .eq('follower_id', uid as string).eq('followed_id', userId as string)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  });
}

/** Contagens de seguidores/seguindo de um perfil. */
export function useFollowCounts(userId: string | undefined) {
  return useQuery({
    queryKey: ['followCounts', userId],
    enabled: env.configured && Boolean(userId),
    queryFn: async (): Promise<{ followers: number; following: number }> => {
      const [a, b] = await Promise.all([
        db().from('follows').select('*', { count: 'exact', head: true }).eq('followed_id', userId as string),
        db().from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId as string),
      ]);
      return { followers: a.count ?? 0, following: b.count ?? 0 };
    },
  });
}

export function useToggleFollow(userId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (isFollowing: boolean) => {
      const uid = user?.id;
      if (!uid || !userId) throw new Error('Não autenticado.');
      if (isFollowing) {
        const { error } = await db().from('follows').delete()
          .eq('follower_id', uid).eq('followed_id', userId);
        if (error) throw error;
      } else {
        const { error } = await db().from('follows')
          .insert({ follower_id: uid, followed_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['following', userId] });
      void qc.invalidateQueries({ queryKey: ['followCounts', userId] });
      void qc.invalidateQueries({ queryKey: ['friendsFeed'] });
    },
  });
}

export interface FeedItem {
  finished_on: string;
  username: string | null;
  game_title: string;
  game_slug: string;
  cover: string | null;
}

/** Feed: zeradas recentes de quem eu sigo. */
export function useFriendsFeed() {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: ['friendsFeed', uid],
    enabled: env.configured && Boolean(uid),
    queryFn: async (): Promise<FeedItem[]> => {
      const { data: follows } = await db()
        .from('follows').select('followed_id').eq('follower_id', uid as string).range(0, 999);
      const ids = (follows ?? []).map((f) => f.followed_id as string);
      if (ids.length === 0) return [];
      const { data, error } = await db()
        .from('game_playthroughs')
        .select('finished_on, profile:profiles(username), game:games(title, slug, thumbnail, cover_url)')
        .in('user_id', ids)
        .order('finished_on', { ascending: false })
        .limit(15);
      if (error) throw error;
      return ((data ?? []) as unknown as {
        finished_on: string;
        profile: { username: string | null } | null;
        game: { title: string; slug: string; thumbnail: string | null; cover_url: string | null } | null;
      }[])
        .filter((r) => r.game)
        .map((r) => ({
          finished_on: r.finished_on,
          username: r.profile?.username ?? null,
          game_title: r.game!.title,
          game_slug: r.game!.slug,
          cover: r.game!.thumbnail ?? r.game!.cover_url ?? null,
        }));
    },
  });
}
