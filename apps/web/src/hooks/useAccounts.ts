import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useAuth } from '@/auth/AuthProvider';

const db = () => getSupabase() as unknown as SupabaseClient;

export type Provider = 'steam' | 'retroachievements' | 'psn' | 'xbox' | 'nintendo' | 'gog' | 'epic';

export interface LinkedAccount {
  provider: Provider;
  account_id: string;
  linked_at: string;
  last_sync: string | null;
}

/** Contas vinculadas do usuário logado (Steam, RetroAchievements…). */
export function useMyAccounts() {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: ['accounts', uid],
    enabled: env.configured && Boolean(uid),
    queryFn: async (): Promise<LinkedAccount[]> => {
      const { data, error } = await db()
        .from('user_accounts').select('provider, account_id, linked_at, last_sync')
        .eq('user_id', uid as string);
      if (error) throw error;
      return (data ?? []) as unknown as LinkedAccount[];
    },
  });
}

/** Vincula (upsert) uma conta e/ou registra a hora do último sync. */
export function useLinkAccount() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider, accountId, synced }: { provider: Provider; accountId: string; synced?: boolean }) => {
      const uid = user?.id;
      if (!uid) throw new Error('Não autenticado.');
      const { error } = await db().from('user_accounts').upsert(
        {
          user_id: uid, provider, account_id: accountId,
          ...(synced ? { last_sync: new Date().toISOString() } : {}),
        },
        { onConflict: 'user_id,provider' },
      );
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['accounts'] }); },
  });
}

export function useUnlinkAccount() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (provider: Provider) => {
      const uid = user?.id;
      if (!uid) throw new Error('Não autenticado.');
      const { error } = await db().from('user_accounts').delete()
        .eq('user_id', uid).eq('provider', provider);
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['accounts'] }); },
  });
}

/** "N pessoas zeraram com esta tradução/hack" (agregado público via RPC). */
export function usePatchUsage(kind: 'translation' | 'romhack', id: string | undefined) {
  return useQuery({
    queryKey: ['patchUsage', kind, id],
    enabled: env.configured && Boolean(id),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await db().rpc('patch_usage', { kind, id });
      if (error) {
        // RPC ainda não migrada: trata como zero em vez de quebrar a página
        return 0;
      }
      return Number(data ?? 0);
    },
  });
}
