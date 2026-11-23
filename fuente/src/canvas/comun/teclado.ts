// EL DESPACHADOR DE TECLAS (2026-10-02, etapa 8 de claude/pizarrita-programas.md, §16).
//
// Antes cada parte escuchaba el teclado por su cuenta en el documento, y una misma tecla la
// atendían varias a la vez: Esc con el menú de Ir abierto lo cerraba Y soltaba la tarjeta Y salía a
// la pizarrita de arriba; Esc grabando cancelaba la grabación y además soltaba la elegida. Ahora
// quien quiere teclas se anota acá con una PRIORIDAD, y la tecla la recibe uno por vez, de la
// prioridad más alta a la más baja, hasta que alguno dice que la hizo suya.
//
//   diálogo (100) > menú abierto (90) > aviso en curso, p. ej. grabando (80) > programa activo (50)
//   > tarjeta elegida (30) > tablero (10)
//
// Respuesta de cada oyente: 'hecho' (la tecla es suya: preventDefault y no sigue), 'pasar' (no es
// de nadie de acá abajo: no sigue, pero no la marca) o nada (que siga).
//
// Escucha en el DOCUMENTO, en la fase de burbuja, como escuchaban todos: lo que un programa atiende
// en su propio elemento (la hoja, el Director Cut, la calculadora…) llega antes y, si corta la
// propagación, acá no llega. Los diálogos de ui.js (Esc en captura) también ganan, como antes.
// Los que escuchan la VENTANA en captura (instrumento, piano roll, caja de ritmos, dibujo, menús de
// programa) todavía siguen por su cuenta: son los más delicados y se pasan después.

import { useEffect, useRef } from 'react';

export type Respuesta = 'hecho' | 'pasar' | void | undefined;
type Oyente = { prioridad: number; orden: number; fn: (e: KeyboardEvent) => Respuesta };

export const PRIORIDAD = {
  dialogo: 100,
  menu: 90,
  aviso: 80,
  programa: 50,
  tarjeta: 30,
  tablero: 10,
} as const;

const oyentes: Oyente[] = [];
let orden = 0;
let instalado = false;

// (No se corta por `defaultPrevented`: el editor de texto marca así su Esc —ProseMirror elige el
// nodo de arriba— y Esc igual tiene que terminar de editar. Cada oyente mira lo que necesite.)
function despachar(e: KeyboardEvent): void {
  // Copia: un oyente puede anotarse o borrarse mientras se despacha (cerrar un menú, por ejemplo).
  const lista = [...oyentes].sort((a, b) => b.prioridad - a.prioridad || b.orden - a.orden);
  for (const o of lista) {
    const r = o.fn(e);
    if (r === 'hecho') {
      e.preventDefault();
      return;
    }
    if (r === 'pasar') return;
  }
}

/** Se anota un oyente; devuelve cómo borrarlo. A igual prioridad, gana el último anotado. */
export function escucharTeclas(prioridad: number, fn: (e: KeyboardEvent) => Respuesta): () => void {
  if (!instalado && typeof document !== 'undefined') {
    document.addEventListener('keydown', despachar);
    instalado = true;
  }
  const o: Oyente = { prioridad, orden: ++orden, fn };
  oyentes.push(o);
  return () => {
    const i = oyentes.indexOf(o);
    if (i >= 0) oyentes.splice(i, 1);
  };
}

/** Lo mismo, desde un componente: escucha mientras `activo`, siempre con la función del último render. */
export function useTeclas(prioridad: number, fn: (e: KeyboardEvent) => Respuesta, activo = true): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!activo) return undefined;
    return escucharTeclas(prioridad, (e) => ref.current(e));
  }, [prioridad, activo]);
}

/** ¿Se está escribiendo en un campo o un texto editable? (Ahí las teclas son del campo.) */
export function enCampo(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}
