import { Wrench, Languages, FileText, Hammer, Newspaper, Gamepad2 } from 'lucide-react';
import type { ComponentType } from 'react';
import type { BadgeTone } from '@/components/ui/Badge';
import type { MaterialKind } from '@/hooks/useMaterials';

/**
 * Fonte única de verdade sobre cada "tipo" de conteúdo: ícone, cor do badge,
 * rota e chaves de i18n. Cards, listas, detalhes e busca leem daqui.
 */
export type Kind = 'game' | 'romhack' | 'translation' | 'doc' | 'tool' | 'article';

export interface KindMeta {
  icon: ComponentType<{ className?: string }>;
  tone: BadgeTone;
  /** segmento de rota no plural (ex.: 'romhacks' → /romhacks/:id). */
  route: string;
  /** tabela no Supabase para os hooks de material (null p/ game e article). */
  table: MaterialKind | null;
  kindKey: string;
  titleKey: string;
  subKey: string;
}

export const KIND_META: Record<Kind, KindMeta> = {
  game: {
    icon: Gamepad2, tone: 'accent', route: 'games', table: null,
    kindKey: 'entities:kindGame', titleKey: 'games:title', subKey: 'games:subtitle',
  },
  romhack: {
    icon: Wrench, tone: 'romhack', route: 'romhacks', table: 'romhacks',
    kindKey: 'entities:kindRomhack', titleKey: 'entities:romhacksTitle', subKey: 'entities:romhacksSubtitle',
  },
  translation: {
    icon: Languages, tone: 'translation', route: 'translations', table: 'translations',
    kindKey: 'entities:kindTranslation', titleKey: 'entities:translationsTitle', subKey: 'entities:translationsSubtitle',
  },
  doc: {
    icon: FileText, tone: 'doc', route: 'docs', table: 'documents',
    kindKey: 'entities:kindDoc', titleKey: 'entities:docsTitle', subKey: 'entities:docsSubtitle',
  },
  tool: {
    icon: Hammer, tone: 'tool', route: 'tools', table: 'tools',
    kindKey: 'entities:kindTool', titleKey: 'entities:toolsTitle', subKey: 'entities:toolsSubtitle',
  },
  article: {
    icon: Newspaper, tone: 'accent', route: 'articles', table: null,
    kindKey: 'entities:kindArticle', titleKey: 'entities:articlesTitle', subKey: 'entities:articlesSubtitle',
  },
};
