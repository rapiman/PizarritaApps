// CERRAR AL TOCAR AFUERA O CON ESC (2026-10-04, bloque G4 del progreso de los programas). Cada menú,
// lista o desplegable armaba lo mismo a mano: escuchar el `pointerdown` del documento mientras está
// abierto y cerrarse si el toque no cayó adentro; y algunos, además, Esc por el despachador de teclas
// (teclado.ts, con prioridad de menú: se lleva la tecla antes que la tarjeta y el tablero). Ahora es
// uno solo, y todos se cierran también con Esc.
//
// `adentro` dice qué cuenta como adentro: refs (lo de cualquiera de ellos), un selector (el toque cae
// en algo que lo cumple) o una función. Se lee al momento del toque, así que puede ir armado en línea.
import { useEffect, useRef, type RefObject } from 'react';
import { PRIORIDAD, useTeclas } from './teclado';

export type Adentro = ReadonlyArray<RefObject<Element | null>> | string | ((t: Element) => boolean);

function cae(adentro: Adentro, t: Element): boolean {
  if (typeof adentro === 'string') return !!t.closest?.(adentro);
  if (typeof adentro === 'function') return adentro(t);
  return adentro.some((r) => !!r.current && r.current.contains(t));
}

export function useCerrarAfuera(
  abierto: boolean,
  adentro: Adentro,
  cerrar: () => void,
  op: { esc?: boolean; captura?: boolean } = {},
): void {
  const { esc = true, captura = true } = op;
  const adentroRef = useRef(adentro);
  adentroRef.current = adentro;
  const cerrarRef = useRef(cerrar);
  cerrarRef.current = cerrar;
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e: PointerEvent) => {
      const t = e.target;
      if (t instanceof Element && cae(adentroRef.current, t)) return;
      cerrarRef.current();
    };
    document.addEventListener('pointerdown', fuera, captura);
    return () => document.removeEventListener('pointerdown', fuera, captura);
  }, [abierto, captura]);
  useTeclas(
    PRIORIDAD.menu,
    (e) => {
      if (e.key !== 'Escape') return undefined;
      cerrarRef.current();
      return 'hecho';
    },
    abierto && esc,
  );
}
