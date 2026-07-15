import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type RomvaultClient = SupabaseClient<Database>;

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/**
 * Cria um cliente Supabase tipado. Compartilhado por todas as superfícies
 * (web, e futuros clientes) — cada plataforma passa sua própria config.
 */
export function createRomvaultClient(
  config: SupabaseConfig,
  options?: Parameters<typeof createClient>[2],
): RomvaultClient {
  if (!config.url || !config.anonKey) {
    throw new Error(
      'Config do Supabase ausente. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
    );
  }
  return createClient<Database>(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...options?.auth,
    },
    ...options,
  });
}
