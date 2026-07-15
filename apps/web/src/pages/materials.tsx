import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UseQueryResult } from '@tanstack/react-query';
import { ArrowLeft, Download, Star, Gamepad2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';
import { MaterialCard } from '@/components/entities/MaterialCard';
import { Reviews } from '@/components/entities/Reviews';
import { FavoriteButton } from '@/components/entities/FavoriteButton';
import { KIND_META, type Kind } from '@/components/entities/kinds';
import {
  useRomhacks, useRomhack,
  useTranslations, useTranslationDetail,
  useDocuments, useDocument,
  useTools, useTool,
  type MaterialFilters, type WithGame,
} from '@/hooks/useMaterials';
import { useArticles, useArticle } from '@/hooks/useArticles';
import { trackDownload, type DownloadSubject } from '@/hooks/useMutations';
import type { Article } from '@romvault/core';

const SUBJECT_OF: Record<string, DownloadSubject> = {
  romhack: 'romhack', translation: 'translation', doc: 'document', tool: 'tool',
};

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const num = (v: unknown) => (typeof v === 'number' ? v : null);

/* ═══════════════════════════════════════════════════════════════════════════
 * LISTA (genérica, apresentacional) — recebe a query já resolvida
 * ═══════════════════════════════════════════════════════════════════════════ */
function MaterialListView({
  kind,
  query,
  filters,
  setFilters,
}: {
  kind: Kind;
  query: UseQueryResult<Row[]>;
  filters: MaterialFilters;
  setFilters: (f: MaterialFilters) => void;
}) {
  const { t } = useTranslation();
  const meta = KIND_META[kind];
  const items = useMemo(() => query.data ?? [], [query.data]);

  const hasLanguage = kind === 'translation' || kind === 'doc';

  // opções de categoria derivadas dos dados carregados
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const cats = it.categories;
      if (Array.isArray(cats)) cats.forEach((c) => typeof c === 'string' && set.add(c));
      else if (typeof it.category === 'string') set.add(it.category);
    }
    return [...set].sort();
  }, [items]);

  const languages = useMemo(() => {
    if (!hasLanguage) return [];
    return [...new Set(items.map((i) => str(i.language)).filter(Boolean) as string[])].sort();
  }, [items, hasLanguage]);

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t(meta.kindKey)}</span>
        <h1>{t(meta.titleKey)}</h1>
        <p className="page-sub">{t(meta.subKey)}</p>
      </header>

      <div className="filter-bar">
        <Field label={t('browse:searchPlaceholder')}>
          {(id) => (
            <Input
              id={id}
              type="search"
              value={filters.search ?? ''}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder={t('browse:searchPlaceholder')}
            />
          )}
        </Field>
        {categories.length > 0 && (
          <Field label={t('browse:filterCategory')}>
            {(id) => (
              <Select
                id={id}
                value={filters.category ?? ''}
                onChange={(e) => setFilters({ ...filters, category: e.target.value || undefined })}
              >
                <option value="">{t('browse:filterAll')}</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {hasLanguage && languages.length > 0 && (
          <Field label={t('browse:filterLanguage')}>
            {(id) => (
              <Select
                id={id}
                value={filters.language ?? ''}
                onChange={(e) => setFilters({ ...filters, language: e.target.value || undefined })}
              >
                <option value="">{t('browse:filterAll')}</option>
                {languages.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label={t('browse:sort')}>
          {(id) => (
            <Select
              id={id}
              value={filters.sort ?? 'downloads'}
              onChange={(e) => setFilters({ ...filters, sort: e.target.value as MaterialFilters['sort'] })}
            >
              <option value="downloads">{t('browse:sortDownloads')}</option>
              <option value="rating">{t('browse:sortRating')}</option>
              <option value="recent">{t('browse:sortRecent')}</option>
            </Select>
          )}
        </Field>
        {items.length > 0 && (
          <span className="filter-count">{t('browse:results', { count: items.length })}</span>
        )}
      </div>

      {query.isLoading ? (
        <LoadingPage />
      ) : items.length === 0 ? (
        <EmptyState icon={meta.icon} title={t('browse:emptyTitle')} text={t('browse:emptyText')} />
      ) : (
        <div className="card-grid">
          {items.map((item) => (
            <MaterialCard key={String(item.id)} kind={kind} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Estado de filtros local a cada lista. */
function useFilters() {
  const [filters, setFilters] = useState<MaterialFilters>({ sort: 'downloads' });
  return { filters, setFilters };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * DETALHE (genérico, apresentacional) — full page
 * ═══════════════════════════════════════════════════════════════════════════ */
function MetaItem({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="meta-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function MaterialDetailView({ kind, query }: { kind: Kind; query: UseQueryResult<WithGame<Row> | null> }) {
  const { t } = useTranslation();
  const meta = KIND_META[kind];
  const Icon = meta.icon;

  if (query.isLoading) return <LoadingPage />;
  const item = query.data;
  if (!item) {
    return (
      <div className="container">
        <EmptyState icon={meta.icon} title={t('entities:notFoundTitle')} text={t('entities:notFoundText')} />
        <Link to={`/${meta.route}`} className="back-link">
          <ArrowLeft aria-hidden /> {t('entities:backToList')}
        </Link>
      </div>
    );
  }

  const title = str(item.title) ?? '—';
  const description = str(item.description);
  const fileUrl = str(item.file_url);
  const sourceUrl = str(item.source_code_url);
  const screenshots = Array.isArray(item.screenshots)
    ? (item.screenshots.filter((s) => typeof s === 'string') as string[])
    : [];
  const tags = Array.isArray(item.tags) ? (item.tags.filter((x) => typeof x === 'string') as string[]) : [];
  const game = item.game;

  return (
    <div className="container">
      <Link to={`/${meta.route}`} className="back-link">
        <ArrowLeft aria-hidden /> {t('entities:backToList')}
      </Link>

      <div className="detail-head">
        <div className="detail-cover detail-cover-wide">
          {str(item.thumbnail) ? (
            <img src={str(item.thumbnail) as string} alt={title} />
          ) : (
            <Icon aria-hidden />
          )}
        </div>
        <div className="detail-info">
          <Badge tone={meta.tone}>{t(meta.kindKey)}</Badge>
          <h1>{title}</h1>
          {description && <p className="page-sub">{description}</p>}

          <div className="detail-stats">
            <span className="tile-stat">
              <Download aria-hidden /> {(num(item.downloads) ?? 0).toLocaleString()} {t('entities:metaDownloads')}
            </span>
            {num(item.rating) ? (
              <span className="tile-stat">
                <Star aria-hidden /> {(num(item.rating) as number).toFixed(1)}
              </span>
            ) : null}
          </div>

          <div className="detail-actions">
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => { if (SUBJECT_OF[kind]) void trackDownload(SUBJECT_OF[kind], String(item.id)); }}
              >
                <Button variant="primary"><Download /> {t('entities:download')}</Button>
              </a>
            )}
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary">{t('entities:sourceCode')}</Button>
              </a>
            )}
            {SUBJECT_OF[kind] && <FavoriteButton subjectType={SUBJECT_OF[kind]} subjectId={String(item.id)} />}
          </div>
        </div>
      </div>

      {/* jogo de origem */}
      {game && (
        <Link to={`/games/${str(game.slug)}`} className="source-game">
          <Gamepad2 aria-hidden />
          <div>
            <span className="source-game-label">{t('entities:sourceGame')}</span>
            <span className="source-game-title">{str(game.title)}</span>
          </div>
          <ArrowLeft aria-hidden className="source-game-arrow" />
        </Link>
      )}

      <dl className="meta-grid detail-meta">
        <MetaItem label={t('entities:metaVersion')} value={str(item.version)} />
        <MetaItem label={t('entities:metaDifficulty')} value={str(item.difficulty)} />
        <MetaItem label="Patch" value={str(item.patch_type)} />
        <MetaItem label={t('entities:metaLanguage')} value={str(item.language)} />
        <MetaItem label={t('browse:filterCategory')} value={str(item.category)} />
        <MetaItem label={t('entities:completion')} value={num(item.completion_percentage) !== null ? `${item.completion_percentage}%` : null} />
        <MetaItem label={t('games:released')} value={str(item.release_date)} />
        <MetaItem label={t('entities:license')} value={str(item.license)} />
        <MetaItem label={t('entities:credits')} value={str(item.credits)} />
      </dl>

      {tags.length > 0 && (
        <div className="tile-badges" style={{ marginTop: 'var(--s4)' }}>
          {tags.map((tag) => (
            <span key={tag} className="chip">#{tag}</span>
          ))}
        </div>
      )}

      {screenshots.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>{t('games:tabImages')}</h2></div>
          <div className="shot-grid">
            {screenshots.map((src) => (
              <a key={src} href={src} target="_blank" rel="noopener noreferrer" className="shot">
                <img src={src} alt="" loading="lazy" />
              </a>
            ))}
          </div>
        </section>
      )}

      {str(item.changelog) && (
        <section className="section">
          <div className="section-head"><h2>Changelog</h2></div>
          <div className="prose"><p>{str(item.changelog)}</p></div>
        </section>
      )}

      {SUBJECT_OF[kind] && <Reviews subjectType={SUBJECT_OF[kind]} subjectId={String(item.id)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * WRAPPERS por rota (cada um chama seu hook específico — regra dos hooks)
 * ═══════════════════════════════════════════════════════════════════════════ */
export function RomhacksList() {
  const { filters, setFilters } = useFilters();
  return <MaterialListView kind="romhack" query={useRomhacks(filters) as UseQueryResult<Row[]>} filters={filters} setFilters={setFilters} />;
}
export function RomhackDetail() {
  const { id } = useParams();
  return <MaterialDetailView kind="romhack" query={useRomhack(id) as UseQueryResult<WithGame<Row> | null>} />;
}
export function TranslationsList() {
  const { filters, setFilters } = useFilters();
  return <MaterialListView kind="translation" query={useTranslations(filters) as UseQueryResult<Row[]>} filters={filters} setFilters={setFilters} />;
}
export function TranslationDetail() {
  const { id } = useParams();
  return <MaterialDetailView kind="translation" query={useTranslationDetail(id) as UseQueryResult<WithGame<Row> | null>} />;
}
export function DocsList() {
  const { filters, setFilters } = useFilters();
  return <MaterialListView kind="doc" query={useDocuments(filters) as UseQueryResult<Row[]>} filters={filters} setFilters={setFilters} />;
}
export function DocDetail() {
  const { id } = useParams();
  return <MaterialDetailView kind="doc" query={useDocument(id) as UseQueryResult<WithGame<Row> | null>} />;
}
export function ToolsList() {
  const { filters, setFilters } = useFilters();
  return <MaterialListView kind="tool" query={useTools(filters) as UseQueryResult<Row[]>} filters={filters} setFilters={setFilters} />;
}
export function ToolDetail() {
  const { id } = useParams();
  return <MaterialDetailView kind="tool" query={useTool(id) as UseQueryResult<WithGame<Row> | null>} />;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ARTIGOS (forma própria: sem downloads/rating)
 * ═══════════════════════════════════════════════════════════════════════════ */
export function ArticlesList() {
  const { t } = useTranslation();
  const meta = KIND_META.article;
  const { data: articles = [], isLoading } = useArticles();

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t(meta.kindKey)}</span>
        <h1>{t(meta.titleKey)}</h1>
        <p className="page-sub">{t(meta.subKey)}</p>
      </header>
      {isLoading ? (
        <LoadingPage />
      ) : articles.length === 0 ? (
        <EmptyState icon={meta.icon} title={t('home:latestTitle')} text={t('home:latestEmpty')} />
      ) : (
        <div className="article-list">
          {articles.map((a) => (
            <Link key={a.id} to={`/articles/${a.slug}`} className="article-row">
              <div className="article-row-body">
                {a.category && <Badge tone="accent">{a.category}</Badge>}
                <h2>{a.title}</h2>
                {a.excerpt && <p>{a.excerpt}</p>}
                <span className="article-row-meta">
                  {a.published_at ? new Date(a.published_at).toLocaleDateString() : ''}
                  {typeof a.views === 'number' ? ` · ${a.views.toLocaleString()} views` : ''}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function ArticleDetail() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const { data: article, isLoading } = useArticle(slug);

  if (isLoading) return <LoadingPage />;
  if (!article) {
    return (
      <div className="container">
        <EmptyState title={t('entities:notFoundTitle')} text={t('entities:notFoundText')} />
        <Link to="/articles" className="back-link"><ArrowLeft aria-hidden /> {t('entities:backToList')}</Link>
      </div>
    );
  }
  return <ArticleView article={article} />;
}

function ArticleView({ article }: { article: Article }) {
  const { t } = useTranslation();
  return (
    <div className="container container-narrow">
      <Link to="/articles" className="back-link"><ArrowLeft aria-hidden /> {t('entities:backToList')}</Link>
      <header className="page-head">
        {article.category && <Badge tone="accent">{article.category}</Badge>}
        <h1 style={{ marginTop: 'var(--s3)' }}>{article.title}</h1>
        <p className="article-meta">
          {article.published_at ? new Date(article.published_at).toLocaleDateString() : ''}
          {typeof article.views === 'number' ? ` · ${article.views.toLocaleString()} views` : ''}
        </p>
      </header>
      <article className="prose article-body">
        {(article.content ?? article.excerpt ?? '').split('\n').map((line, i) => {
          const key = `${i}-${line.slice(0, 12)}`;
          if (line.startsWith('## ')) return <h3 key={key}>{line.slice(3)}</h3>;
          if (line.startsWith('# ')) return <h2 key={key}>{line.slice(2)}</h2>;
          if (line.startsWith('- ')) return <li key={key}>{line.slice(2)}</li>;
          if (line.trim() === '') return null;
          return <p key={key}>{line}</p>;
        })}
      </article>
    </div>
  );
}
