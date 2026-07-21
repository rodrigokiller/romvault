/** Acesso centralizado e validado às variáveis de ambiente do Vite. */

interface Env {
  supabaseUrl: string;
  supabaseAnonKey: string;
  appEnv: string;
  /** DSN do Sentry (público por natureza: vai no bundle). Vazio = desligado. */
  sentryDsn: string;
  /** true quando URL e anon key estão presentes — o app roda sem elas. */
  configured: boolean;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const env: Env = {
  supabaseUrl: supabaseUrl ?? '',
  supabaseAnonKey: supabaseAnonKey ?? '',
  // ambiente: NÃO use import.meta.env.MODE — ele é derivado do build do Vite e
  // não pode ser definido no .env. VITE_APP_ENV é a nossa variável.
  appEnv: (import.meta.env.VITE_APP_ENV as string | undefined) ?? 'development',
  sentryDsn: (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? '',
  configured: Boolean(supabaseUrl && supabaseAnonKey),
};
