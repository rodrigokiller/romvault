import { useQuery } from '@tanstack/react-query';
import type { Article } from '@romvault/core';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';

export const articleKeys = {
  list: (limit?: number) => ['articles', 'list', limit ?? 0] as const,
  detail: (slug: string) => ['articles', 'detail', slug] as const,
};

/** Artigos publicados, mais recentes primeiro. `limit` opcional (ex.: home). */
export function useArticles(limit?: number) {
  return useQuery({
    queryKey: articleKeys.list(limit),
    enabled: env.configured,
    queryFn: async (): Promise<Article[]> => {
      let q = getSupabase()
        .from('articles')
        .select('*')
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useArticle(slug: string | undefined) {
  return useQuery({
    queryKey: articleKeys.detail(slug ?? ''),
    enabled: env.configured && Boolean(slug),
    queryFn: async (): Promise<Article | null> => {
      const { data, error } = await getSupabase()
        .from('articles')
        .select('*')
        .eq('slug', slug as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
