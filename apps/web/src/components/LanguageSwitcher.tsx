import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { SUPPORTED_LANGS } from '@/i18n/config';

/** Alterna o idioma da interface (flip visível entre os idiomas suportados). */
export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current =
    SUPPORTED_LANGS.find((l) => i18n.language?.startsWith(l.code.slice(0, 2))) ??
    SUPPORTED_LANGS[0];

  function cycle() {
    const idx = SUPPORTED_LANGS.findIndex((l) => l.code === current.code);
    const next = SUPPORTED_LANGS[(idx + 1) % SUPPORTED_LANGS.length];
    void i18n.changeLanguage(next.code);
  }

  return (
    <button
      type="button"
      className="lang-switch"
      onClick={cycle}
      title={t('nav:language')}
      aria-label={`${t('nav:language')}: ${current.label}`}
    >
      <Languages aria-hidden />
      <span className="lang-switch-code">{current.flag}</span>
    </button>
  );
}
