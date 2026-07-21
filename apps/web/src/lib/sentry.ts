/**
 * Telemetria de erro do FRONT (Sentry).
 *
 * Por que só o front: a Vercel só guarda log de build/function e o site é
 * estático — erro de JavaScript no navegador do usuário não aparece em lugar
 * nenhum hoje. O Supabase guarda log cru das edge functions, sem agrupamento
 * nem alerta. O buraco real é o browser.
 *
 * Liga sozinho quando VITE_SENTRY_DSN existe; sem a variável, o app roda igual
 * (desenvolvimento local não precisa enviar nada).
 */
import * as Sentry from '@sentry/react';
import { env } from '@/lib/env';

declare global {
  interface Window {
    romvaultSentry?: { enabled: boolean; environment: string; test: () => void };
  }
}

export function initSentry() {
  /*
   * Diagnóstico no console do site (`romvaultSentry`): o DSN é embutido em
   * tempo de BUILD, então adicionar a variável na Vercel só vale a partir do
   * PRÓXIMO deploy — sem isso o bundle sai sem Sentry e nada é enviado.
   * `romvaultSentry.test()` manda um evento de propósito pra provar a ponta a
   * ponta (o Sentry só sai da tela de "aguardando" quando recebe algo).
   */
  window.romvaultSentry = {
    enabled: Boolean(env.sentryDsn),
    environment: env.appEnv,
    test: () => {
      if (!env.sentryDsn) {
        console.warn('[ROMVault] Sentry DESLIGADO: VITE_SENTRY_DSN não entrou neste build. Refaça o deploy depois de criar a variável.');
        return;
      }
      Sentry.captureMessage('Teste de integração do ROMVault', 'info');
      console.info('[ROMVault] evento de teste enviado — confira em Issues no Sentry.');
    },
  };

  if (!env.sentryDsn) return; // sem DSN = desligado (padrão no local)
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.appEnv, // VITE_APP_ENV: 'production' na Vercel
    // integrações DECLARADAS: sem elas, tracesSampleRate/replays* são ignorados
    // silenciosamente (replay não é integração padrão no SDK v8+).
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    // 10% das transações de performance: dá pra ver tendência sem estourar cota.
    tracesSampleRate: 0.1,
    // grava o replay da sessão SÓ quando dá erro (nunca em sessão normal)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // ruído conhecido de browser que não é bug nosso
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'AbortError',
      'Non-Error promise rejection captured',
    ],
  });
}

/** Reporta um erro capturado pelo ErrorBoundary (no-op sem DSN). */
export function reportError(error: unknown, extra?: Record<string, unknown>) {
  if (!env.sentryDsn) return;
  Sentry.captureException(error, extra ? { extra } : undefined);
}
