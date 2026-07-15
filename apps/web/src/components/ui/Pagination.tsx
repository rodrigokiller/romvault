import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Janela de páginas: primeira, última, atual ±1, com reticências no meio. */
function windowPages(page: number, total: number): (number | 'gap')[] {
  const set = new Set<number>([0, total - 1, page, page - 1, page + 1]);
  const arr = [...set].filter((p) => p >= 0 && p < total).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  let prev = -1;
  for (const p of arr) {
    if (prev !== -1 && p - prev > 1) out.push('gap');
    out.push(p);
    prev = p;
  }
  return out;
}

/** Paginação numerada (0-indexada internamente; exibe 1-indexado). */
export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;
  const pages = windowPages(page, totalPages);
  return (
    <nav className="pagination" aria-label={t('browse:pagination')}>
      <button
        type="button"
        className="page-btn page-arrow"
        disabled={page <= 0}
        onClick={() => onPage(page - 1)}
        aria-label={t('browse:prevPage')}
      >
        <ChevronLeft aria-hidden />
      </button>
      {pages.map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="page-gap" aria-hidden>
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={`page-btn ${p === page ? 'is-active' : ''}`}
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onPage(p)}
          >
            {p + 1}
          </button>
        ),
      )}
      <button
        type="button"
        className="page-btn page-arrow"
        disabled={page >= totalPages - 1}
        onClick={() => onPage(page + 1)}
        aria-label={t('browse:nextPage')}
      >
        <ChevronRight aria-hidden />
      </button>
    </nav>
  );
}
