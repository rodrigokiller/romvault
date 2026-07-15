import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useAuth } from '@/auth/AuthProvider';
import type { ReviewSubject } from './useReviews';
import type { Kind } from '@/components/entities/kinds';

const db = () => getSupabase() as unknown as SupabaseClient;

export type FavoriteSubject = ReviewSubject;

/** O subject está nos favoritos do usuário logado? */
export function useIsFavorite(subjectType: FavoriteSubject, subjectId: string | undefined) {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: ['favorite', subjectType, subjectId, uid],
    enabled: env.configured && Boolean(subjectId && uid),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await db()
        .from('favorites')
        .select('subject_id')
        .eq('user_id', uid as string)
        .eq('subject_type', subjectType)
        .eq('subject_id', subjectId as string)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  });
}

/**
 * IDs de jogos favoritados pelo usuário logado — UMA query compartilhada por
 * todos os cards do grid (não uma por card).
 */
export function useMyFavoriteGameIds() {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: ['favoriteGameIds', uid],
    enabled: env.configured && Boolean(uid),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await db()
        .from('favorites').select('subject_id')
        .eq('user_id', uid as string).eq('subject_type', 'game').range(0, 9999);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.subject_id as string));
    },
  });
}

export function useToggleFavorite(subjectType: FavoriteSubject, subjectId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (isFav: boolean) => {
      const uid = user?.id;
      if (!uid || !subjectId) throw new Error('Não autenticado.');
      if (isFav) {
        const { error } = await db().from('favorites').delete()
          .eq('user_id', uid).eq('subject_type', subjectType).eq('subject_id', subjectId);
        if (error) throw error;
      } else {
        const { error } = await db().from('favorites')
          .insert({ user_id: uid, subject_type: subjectType, subject_id: subjectId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['favorite', subjectType, subjectId] });
      void qc.invalidateQueries({ queryKey: ['favorites', 'mine'] });
      void qc.invalidateQueries({ queryKey: ['favoriteGameIds'] });
    },
  });
}

/* ── Favoritos resolvidos (para o perfil) ───────────────────────────────────── */
const SUBJECT_TABLE: Record<FavoriteSubject, string> = {
  game: 'games', romhack: 'romhacks', translation: 'translations', tool: 'tools', document: 'documents',
};
const SUBJECT_KIND: Record<FavoriteSubject, Kind> = {
  game: 'game', romhack: 'romhack', translation: 'translation', tool: 'tool', document: 'doc',
};

export interface ResolvedFavorite {
  kind: Kind;
  item: Record<string, unknown>;
}

/** Favoritos do usuário resolvidos nas entidades reais (batch por tipo). */
export function useMyFavorites(userId: string | undefined) {
  return useQuery({
    queryKey: ['favorites', 'mine', userId],
    enabled: env.configured && Boolean(userId),
    queryFn: async (): Promise<ResolvedFavorite[]> => {
      const { data: favs, error } = await db()
        .from('favorites')
        .select('subject_type, subject_id')
        .eq('user_id', userId as string);
      if (error) throw error;
      const rows = (favs ?? []) as { subject_type: FavoriteSubject; subject_id: string }[];

      // agrupa ids por tipo e busca cada tabela de uma vez
      const byType = new Map<FavoriteSubject, string[]>();
      for (const r of rows) {
        const arr = byType.get(r.subject_type) ?? [];
        arr.push(r.subject_id);
        byType.set(r.subject_type, arr);
      }
      const out: ResolvedFavorite[] = [];
      await Promise.all(
        [...byType.entries()].map(async ([type, ids]) => {
          const { data } = await db().from(SUBJECT_TABLE[type]).select('*').in('id', ids);
          for (const item of data ?? []) {
            out.push({ kind: SUBJECT_KIND[type], item: item as Record<string, unknown> });
          }
        }),
      );
      return out;
    },
  });
}
