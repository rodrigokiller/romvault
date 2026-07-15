import { useTranslation } from 'react-i18next';

/** Marca ROMVault: glifo quadrado de terminal + wordmark. */
export function Logo({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="logo" aria-label={t('common:appName')}>
      <svg className="logo-glyph" viewBox="0 0 32 32" width="26" height="26" aria-hidden>
        <rect x="1.5" y="1.5" width="29" height="29" fill="none" stroke="var(--accent)" strokeWidth="2" />
        <path
          d="M8 11 L12 16 L8 21"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.4"
          strokeLinecap="square"
        />
        <rect x="15" y="19.8" width="9" height="2.4" fill="var(--accent)" />
      </svg>
      {!compact && (
        <span className="logo-word">
          ROM<span className="logo-word-dim">Vault</span>
        </span>
      )}
    </span>
  );
}
