/** Acesso centralizado e validado às variáveis de ambiente do Vite. */

interface Env {
  supabaseUrl: string;
  supabaseAnonKey: string;
  appEnv: string;
  /** true quando URL e anon key estão presentes — o app roda sem elas. */
  configured: boolean;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const env: Env = {
  supabaseUrl: supabaseUrl ?? '',
  supabaseAnonKey: supabaseAnonKey ?? '',
  appEnv: (import.meta.env.VITE_APP_ENV as string | undefined) ?? 'development',
  configured: Boolean(supabaseUrl && supabaseAnonKey),
};
