import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useAuth } from '@/auth/AuthProvider';

const db = () => getSupabase() as unknown as SupabaseClient;

export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  usage_count: number;
  last_used: string | null;
  created_at: string;
}

/** SHA-256 hex (Web Crypto). Guardamos só o hash da chave, nunca o texto plano. */
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `rv_${hex}`;
}

export function useApiKeys() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['apiKeys', user?.id],
    enabled: env.configured && Boolean(user?.id),
    queryFn: async (): Promise<ApiKeyRow[]> => {
      const { data, error } = await db()
        .from('api_keys')
        .select('id, name, key_prefix, is_active, usage_count, last_used, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ApiKeyRow[];
    },
  });
}

/** Cria uma chave; retorna o TEXTO PLANO uma única vez (não é recuperável). */
export function useCreateApiKey() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<string> => {
      if (!user?.id) throw new Error('Não autenticado.');
      const key = generateKey();
      const row = {
        user_id: user.id,
        name: name.trim() || 'API key',
        key_prefix: key.slice(0, 11),
        key_hash: await sha256Hex(key),
        permissions: ['read'],
        is_active: true,
      };
      const { error } = await db().from('api_keys').insert(row);
      if (error) throw error;
      return key;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['apiKeys'] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from('api_keys').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['apiKeys'] }),
  });
}
