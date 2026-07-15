import type { ComponentType } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wrench, Languages, FileText, Hammer, Newspaper } from 'lucide-react';
import { EmptyState } from '@/components/ui/feedback';
import { Badge, type BadgeTone } from '@/components/ui/Badge';

/**
 * Um só componente por área serve LISTA e DETALHE (placeholder por ora), sem
 * duplicar telas. Cada material (romhack, tradução, doc, ferramenta, artigo)
 * é descrito por uma config; a lista e o detalhe leem dela.
 */
type Kind = 'romhack' | 'translation' | 'doc' | 'tool' | 'article';

interface KindConfig {
  icon: ComponentType<{ className?: string }>;
  tone: BadgeTone;
  titleKey: string;
  subKey: string;
  kindKey: string;
}

const KINDS: Record<Kind, KindConfig> = {
  romhack: {
    icon: Wrench,
    tone: 'romhack',
    titleKey: 'entities:romhacksTitle',
    subKey: 'entities:romhacksSubtitle',
    kindKey: 'entities:kindRomhack',
  },
  translation: {
    icon: Languages,
    tone: 'translation',
    titleKey: 'entities:translationsTitle',
    subKey: 'entities:translationsSubtitle',
    kindKey: 'entities:kindTranslation',
  },
  doc: {
    icon: FileText,
    tone: 'doc',
    titleKey: 'entities:docsTitle',
    subKey: 'entities:docsSubtitle',
    kindKey: 'entities:kindDoc',
  },
  tool: {
    icon: Hammer,
    tone: 'tool',
    titleKey: 'entities:toolsTitle',
    subKey: 'entities:toolsSubtitle',
    kindKey: 'entities:kindTool',
  },
  article: {
    icon: Newspaper,
    tone: 'accent',
    titleKey: 'entities:articlesTitle',
    subKey: 'entities:articlesSubtitle',
    kindKey: 'entities:kindArticle',
  },
};

function humanize(value: string): string {
  return value
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function MaterialList({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const c = KINDS[kind];
  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t(c.kindKey)}</span>
        <h1>{t(c.titleKey)}</h1>
        <p className="page-sub">{t(c.subKey)}</p>
      </header>
      <EmptyState icon={c.icon} title={t('browse:emptyTitle')} text={t('browse:emptyText')} />
    </div>
  );
}

function MaterialDetail({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const params = useParams();
  const c = KINDS[kind];
  const ref = params.id ?? params.slug ?? '';
  return (
    <div className="container">
      <header className="page-head">
        <Badge tone={c.tone}>{t(c.kindKey)}</Badge>
        <h1 style={{ marginTop: 'var(--s3)' }}>{ref ? humanize(ref) : t(c.titleKey)}</h1>
      </header>
      <EmptyState
        icon={c.icon}
        title={t('common:comingSoonTitle')}
        text={t('entities:detailPlaceholder')}
      />
    </div>
  );
}

/* Wrappers finos por rota — todos apontam para os mesmos dois componentes. */
export const RomhacksList = () => <MaterialList kind="romhack" />;
export const RomhackDetail = () => <MaterialDetail kind="romhack" />;
export const TranslationsList = () => <MaterialList kind="translation" />;
export const TranslationDetail = () => <MaterialDetail kind="translation" />;
export const DocsList = () => <MaterialList kind="doc" />;
export const DocDetail = () => <MaterialDetail kind="doc" />;
export const ToolsList = () => <MaterialList kind="tool" />;
export const ToolDetail = () => <MaterialDetail kind="tool" />;
export const ArticlesList = () => <MaterialList kind="article" />;
export const ArticleDetail = () => <MaterialDetail kind="article" />;
