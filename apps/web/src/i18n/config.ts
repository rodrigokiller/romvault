import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ptBR from './pt-BR.json';
import en from './en.json';

export const SUPPORTED_LANGS = [
  { code: 'pt-BR', label: 'Português', flag: 'BR' },
  { code: 'en', label: 'English', flag: 'US' },
] as const;

export type LangCode = (typeof SUPPORTED_LANGS)[number]['code'];

/** Namespaces por área — todas as strings de UI passam por aqui. */
export const NAMESPACES = [
  'common',
  'nav',
  'home',
  'browse',
  'games',
  'entities',
  'forms',
  'auth',
  'settings',
  'errors',
  'profile',
  'search',
  'admin',
  'community',
  'apidocs',
  'library',
  'collections',
  'users',
  'wrapped',
  'stats',
  'upcoming',
] as const;

// Recursos empacotados no bundle: init é síncrono, sem Suspense de rede.
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': ptBR,
      en,
    },
    fallbackLng: 'pt-BR',
    supportedLngs: SUPPORTED_LANGS.map((l) => l.code),
    ns: NAMESPACES as unknown as string[],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'romvault-lang',
      caches: ['localStorage'],
    },
    react: { useSuspense: false },
  });

export default i18n;
