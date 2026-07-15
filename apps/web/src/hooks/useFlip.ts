import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * FLIP: anima itens de um grid quando eles TROCAM DE POSIÇÃO (filtro/ordenação).
 * Marque cada item com `data-flip="chave-estável"`; ao mudar `depsKey`, cada
 * item desliza da posição antiga para a nova (em vez de teleportar).
 * Respeita prefers-reduced-motion.
 */
export function useFlip(containerRef: RefObject<HTMLElement | null>, depsKey: string) {
  const positions = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nodes = container.querySelectorAll<HTMLElement>('[data-flip]');
    const next = new Map<string, DOMRect>();

    nodes.forEach((node) => {
      const key = node.dataset.flip as string;
      const rect = node.getBoundingClientRect();
      next.set(key, rect);
      if (reduced) return;
      const prev = positions.current.get(key);
      if (!prev) return;
      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    });

    positions.current = next;
  }, [containerRef, depsKey]);
}
