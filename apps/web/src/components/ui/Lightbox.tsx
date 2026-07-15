import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Visualizador de imagem em tela cheia. Portaleado para o body (escapa os
 * contextos de empilhamento). Setas navegam, Esc fecha, clique no fundo fecha.
 */
export function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const many = images.length > 1;

  const prev = useCallback(() => onIndex((index - 1 + images.length) % images.length), [index, images.length, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % images.length), [index, images.length, onIndex]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && many) prev();
      else if (e.key === 'ArrowRight' && many) next();
    }
    window.addEventListener('keydown', onKey);
    // trava o scroll do body enquanto aberto
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, prev, next, many]);

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <button type="button" className="lightbox-close" onClick={onClose} aria-label={t('common:close')}>
        <X aria-hidden />
      </button>

      {many && (
        <button
          type="button"
          className="lightbox-nav lightbox-prev"
          onClick={(e) => { e.stopPropagation(); prev(); }}
          aria-label={t('browse:prevPage')}
        >
          <ChevronLeft aria-hidden />
        </button>
      )}

      <img
        className="lightbox-img"
        src={images[index]}
        alt=""
        onClick={(e) => e.stopPropagation()}
      />

      {many && (
        <>
          <button
            type="button"
            className="lightbox-nav lightbox-next"
            onClick={(e) => { e.stopPropagation(); next(); }}
            aria-label={t('browse:nextPage')}
          >
            <ChevronRight aria-hidden />
          </button>
          <div className="lightbox-count">{index + 1} / {images.length}</div>
        </>
      )}
    </div>,
    document.body,
  );
}
