import { useState, type ImgHTMLAttributes } from 'react';

/**
 * <img> com blur-up: entra desfocada/apagada e revela suave ao carregar.
 * Em conexões lentas os grids ficam macios em vez de "pipocar".
 */
export function FadeImg(props: ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      loading="lazy"
      {...props}
      className={`fade-img ${loaded ? 'is-loaded' : ''} ${props.className ?? ''}`}
      onLoad={(e) => { setLoaded(true); props.onLoad?.(e); }}
    />
  );
}
