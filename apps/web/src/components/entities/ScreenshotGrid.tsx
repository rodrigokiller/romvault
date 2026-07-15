import { useState } from 'react';
import { Lightbox } from '@/components/ui/Lightbox';

/** Grade de screenshots que abre o Lightbox ao clicar (em vez de nova aba). */
export function ScreenshotGrid({ images }: { images: string[] }) {
  const [index, setIndex] = useState<number | null>(null);
  if (images.length === 0) return null;
  return (
    <>
      <div className="shot-grid">
        {images.map((src, i) => (
          <button key={src} type="button" className="shot" onClick={() => setIndex(i)}>
            <img src={src} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      {index !== null && (
        <Lightbox images={images} index={index} onIndex={setIndex} onClose={() => setIndex(null)} />
      )}
    </>
  );
}
