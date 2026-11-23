// EL LUGAR DONDE FLOTAN LAS VENTANAS Y LOS MENÚS DE UN PROGRAMA (sacado de tablero/escritorio.ts el
// 2026-11-23, docs/anfitrion.md: lo usan los menús y la onda, que viajan fuera de Pizarrita).
// `ventanas` es el escritorio con su propio scroll y `menus` la ventana principal entera, para las
// listas de los menús (que no se tienen que cortar en el borde del escritorio). Sin escritorio
// (los dos en null) todo cuelga del cuerpo de la página. Quién lo arma: tablero/escritorio.ts.
import { createContext, useContext } from 'react';

export const EscritorioCtx = createContext<{ ventanas: HTMLElement | null; menus: HTMLElement | null }>({ ventanas: null, menus: null });
export const useEscritorio = (): HTMLElement | null => useContext(EscritorioCtx).ventanas;
export const useMenusCaja = (): HTMLElement | null => useContext(EscritorioCtx).menus;

// Un punto de la pantalla, en coordenadas del contenido de `el` (con su scroll).
export function enEscritorio(el: HTMLElement, x: number, y: number): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: Math.round(x - r.left - el.clientLeft + el.scrollLeft), y: Math.round(y - r.top - el.clientTop + el.scrollTop) };
}
