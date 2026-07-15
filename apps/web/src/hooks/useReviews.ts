import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useAuth } from '@/auth/AuthProvider';

const db = () => getSupabase() as unknown as SupabaseClient;

export type ReviewSubject = 'game' | 'romhack' | 'translation' | 'tool' | 'document';

export interface ReviewRow {
  id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  profile: { username: string | null; avatar_url: string | null } | null;
}

export interface ReviewsData {
  reviews: ReviewRow[];
  avg: number;
  count: number;
}

const reviewKeys = {
  list: (t: string, id: string) => ['reviews', t, id] as const,
  mine: (t: string, id: string, uid: string) => ['reviews', 'mine', t, id, uid] as const,
};

export function useReviews(subjectType: ReviewSubject, subjectId: string | undefined) {
  return useQuery({
    queryKey: reviewKeys.list(subjectType, subjectId ?? ''),
    enabled: env.configured && Boolean(subjectId),
    queryFn: async (): Promise<ReviewsData> => {
      const { data, error } = await db()
        .from('reviews')
        .select('id, user_id, rating, comment, created_at, profile:profiles(username, avatar_url)')
        .eq('subject_type', subjectType)
        .eq('subject_id', subjectId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const reviews = (data ?? []) as unknown as ReviewRow[];
      const count = reviews.length;
      const avg = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;
      return { reviews, avg, count };
    },
  });
}

/** A avaliação do usuário logado para este item (para prefill). */
export function useMyReview(subjectType: ReviewSubject, subjectId: string | undefined) {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: reviewKeys.mine(subjectType, subjectId ?? '', uid ?? ''),
    enabled: env.configured && Boolean(subjectId && uid),
    queryFn: async (): Promise<{ rating: number; comment: string | null } | null> => {
      const { data, error } = await db()
        .from('reviews')
        .select('rating, comment')
        .eq('subject_type', subjectType)
        .eq('subject_id', subjectId as string)
        .eq('user_id', uid as string)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as { rating: number; comment: string | null } | null) ?? null;
    },
  });
}

export function useUpsertReview(subjectType: ReviewSubject, subjectId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rating, comment }: { rating: number; comment: string }) => {
      const uid = user?.id;
      if (!uid || !subjectId) throw new Error('Não autenticado.');
      const { error } = await db().from('reviews').upsert(
        { user_id: uid, subject_type: subjectType, subject_id: subjectId, rating, comment: comment || null },
        { onConflict: 'user_id,subject_type,subject_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reviews', subjectType, subjectId] });
      void qc.invalidateQueries({ queryKey: ['reviews', 'mine', subjectType, subjectId] });
    },
  });
}

export function useDeleteReview(subjectType: ReviewSubject, subjectId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const uid = user?.id;
      if (!uid || !subjectId) throw new Error('Não autenticado.');
      const { error } = await db()
        .from('reviews')
        .delete()
        .eq('user_id', uid)
        .eq('subject_type', subjectType)
        .eq('subject_id', subjectId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reviews', subjectType, subjectId] });
      void qc.invalidateQueries({ queryKey: ['reviews', 'mine', subjectType, subjectId] });
    },
  });
}
