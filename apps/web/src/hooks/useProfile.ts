import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile, Romhack, Translation, Document, Tool } from '@romvault/core';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useAuth } from '@/auth/AuthProvider';

/** Shim sem tipagem de tabela (colunas novas até o próximo db:types). */
const db = () => getSupabase() as unknown as SupabaseClient;

export const profileKeys = {
  me: ['profile', 'me'] as const,
  byUsername: (u: string) => ['profile', 'byUsername', u] as const,
  contributions: (id: string) => ['profile', 'contributions', id] as const,
};

/** Perfil do usuário logado (inclui is_admin). null se deslogado. */
export function useMyProfile() {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: profileKeys.me,
    enabled: env.configured && Boolean(uid),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await getSupabase()
        .from('profiles')
        .select('*')
        .eq('id', uid as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Conveniência: o usuário logado é admin? */
export function useIsAdmin(): boolean {
  const { data } = useMyProfile();
  return Boolean(data?.is_admin);
}

/** O usuário optou por VER conteúdo adulto? (padrão: escondido) */
export function useShowAdult(): boolean {
  const { data } = useMyProfile();
  return Boolean((data as unknown as { show_adult?: boolean } | null)?.show_adult);
}

export function useProfileByUsername(username: string | undefined) {
  return useQuery({
    queryKey: profileKeys.byUsername(username ?? ''),
    enabled: env.configured && Boolean(username),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await getSupabase()
        .from('profiles')
        .select('*')
        .eq('username', username as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export interface Contributions {
  romhacks: Romhack[];
  translations: Translation[];
  documents: Document[];
  tools: Tool[];
}

/** Tudo que um usuário já enviou, por tabela. */
export function useContributions(userId: string | undefined) {
  return useQuery({
    queryKey: profileKeys.contributions(userId ?? ''),
    enabled: env.configured && Boolean(userId),
    queryFn: async (): Promise<Contributions> => {
      const sb = getSupabase();
      const uid = userId as string;
      const [romhacks, translations, documents, tools] = await Promise.all([
        sb.from('romhacks').select('*').eq('submitted_by', uid),
        sb.from('translations').select('*').eq('submitted_by', uid),
        sb.from('documents').select('*').eq('submitted_by', uid),
        sb.from('tools').select('*').eq('submitted_by', uid),
      ]);
      return {
        romhacks: romhacks.data ?? [],
        translations: translations.data ?? [],
        documents: documents.data ?? [],
        tools: tools.data ?? [],
      };
    },
  });
}

/** Atualiza o próprio perfil (username, bio, avatar, privacidade). */
export function useUpdateProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<Profile, 'username' | 'bio' | 'avatar_url'>> & { yearly_goal?: number | null; library_public?: boolean; email_digest?: boolean; show_adult?: boolean }) => {
      const uid = user?.id;
      if (!uid) throw new Error('Não autenticado.');
      const { data, error } = await db()
        .from('profiles')
        .update(patch)
        .eq('id', uid)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
