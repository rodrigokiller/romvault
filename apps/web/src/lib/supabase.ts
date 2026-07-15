import { createRomvaultClient, type RomvaultClient } from '@romvault/core';
import { env } from './env';

let client: RomvaultClient | null = null;

/**
 * Cria (uma vez) o cliente Supabase singleton. Quando o env falta, lança um
 * erro amigável em vez de quebrar na importação — assim o app renderiza a tela
 * de "Configuração pendente" em vez de uma página branca.
 */
export function getSupabase(): RomvaultClient {
  if (!env.configured) {
    throw new Error(
      'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
    );
  }
  if (!client) {
    client = createRomvaultClient({
      url: env.supabaseUrl,
      anonKey: env.supabaseAnonKey,
    });
  }
  return client;
}
