// EL MENÚ DE LOS PROGRAMAS (nació en caja/BarraCaja.tsx el 2026-09-24 como la barra de PL Studios;
// acá desde el 2026-11-01, PLAN-CONSOLIDACION §13, fugas): lo usan la caja, PizarriSound, Shop Pro,
// la hoja, el GameEditor y también la ENTRADA (el menú Edición de los textos y los grupos de la
// navegación). BarraCaja.tsx se queda con el reloj y el medidor, que son de la caja; la ventana
// flotante está en comun/VentanaFlotante.tsx. Desde el 2026-11-23 se importa de acá, sin re-exportar.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MENU } from './capas';
import { useMenusCaja, enEscritorio } from './escritorioCtx';
import { usePerillas } from '../../estilo';
import { verAtajo } from '../comun/atajos';
import { useCerrarAfuera } from '../comun/cerrarAfuera';

export interface ItemMenu {
  texto?: string;
  /** En la notación de atajos.ts (`Mod+Z`, `Mayús+Mod+Z`, `Supr`…): se muestra con `verAtajo`. */
  atajo?: string;
  accion?: () => void;
  deshabilitado?: boolean;
  marcado?: boolean;
  separador?: boolean;
}
export interface Menu {
  nombre: string;
  items: ItemMenu[];
}

// UN SOLO MENÚ ABIERTO A LA VEZ (2026-09-29, JP): la barra de arriba junta menús de dueños
// distintos (los grupos de Navegacion.tsx y los MenuPrograma del programa y de Edición, que
// se cuelgan adentro de la misma <nav>). Cada uno cerraba solo con un clic «afuera» de sí
// mismo, y un clic en el menú del lado caía adentro de la <nav>: quedaban dos abiertos. Ahora
// el que se abre lo avisa, y los demás se cierran.
const EVENTO_MENU = 'pz-menu-abierto';
export function avisarMenuAbierto(quien: object): void {
  window.dispatchEvent(new CustomEvent(EVENTO_MENU, { detail: quien }));
}
// LA BARRA DE ARRIBA SE RECORRE CON EL MOUSE (2026-09-29, JP: «si»): como en el Mac, con un
// menú de la barra abierto, pasar por el nombre de otro lo abre, sea de la navegación o del
// programa. Solo en los temas con los menús arriba (`--pz-menus-arriba`); quién está abierto
// en la barra se anota acá.
let abiertoEnBarra: object | null = null;
export function anotarEnBarra(quien: object, abierto: boolean): void {
  if (abierto) abiertoEnBarra = quien;
  else if (abiertoEnBarra === quien) abiertoEnBarra = null;
}
export function otroAbiertoEnBarra(quien: object): boolean {
  return abiertoEnBarra !== null && abiertoEnBarra !== quien;
}
export function alAbrirseOtroMenu(quien: object, cerrar: () => void): () => void {
  const oir = (e: Event) => {
    if ((e as CustomEvent).detail !== quien) cerrar();
  };
  window.addEventListener(EVENTO_MENU, oir);
  return () => window.removeEventListener(EVENTO_MENU, oir);
}

// EL MENÚ: un clic en un nombre lo abre; con uno abierto, pasar a otro lo cambia; un clic
// afuera o Esc lo cierra, y también que se abra otro menú (avisarMenuAbierto).
// `clase`: para que un programa que no es la caja (PizarriSound) vista sus menús a su manera.
export function MenuPrograma({ menus, clase }: { menus: Menu[]; clase?: string }) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  // LA LISTA ABIERTA VA ARRIBA DE TODO (JP, 2026-09-25): se cuelga del cuerpo de la página,
  // fija bajo su nombre; adentro de la hoja quedaba debajo de las ventanas.
  const [donde, setDonde] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // Adentro de PL Studios, la lista vive en la ventana principal.
  const esc = useMenusCaja();
  const yo = useRef({});
  const { menusArriba, menusPrograma } = usePerillas();
  // LOS MENÚS COMO BOTONES (`--pz-menus-programa: botones`, Limbo): una pestaña por menú y, debajo,
  // los botones de la elegida, siempre a la vista. La primera viene elegida; un clic en la elegida
  // la pliega.
  const [pestana, setPestana] = useState<number | null>(0);
  // ¿Está en la barra de arriba? (los del programa y el de Edición, colgados en la <nav>)
  const enBarra = () => menusArriba && !!ref.current?.closest('.pz-nav');
  useEffect(() => {
    const quien = yo.current;
    anotarEnBarra(quien, abierto !== null && enBarra());
    return () => anotarEnBarra(quien, false);
  });
  const abrir = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setDonde(esc ? enEscritorio(esc, r.left, r.bottom) : { x: Math.round(r.left), y: Math.round(r.bottom) });
    setAbierto(i);
  };
  useEffect(() => {
    if (abierto === null) return;
    avisarMenuAbierto(yo.current);
    return alAbrirseOtroMenu(yo.current, () => setAbierto(null));
  }, [abierto]);
  // Afuera o Esc lo cierran, y nada más (cerrarAfuera.ts; Esc no llega a la tarjeta ni al tablero).
  useCerrarAfuera(abierto !== null, [ref, lista], () => setAbierto(null));
  if (menusPrograma === 'botones' && !menusArriba) {
    const m = pestana !== null ? menus[pestana] : undefined;
    return (
      <div className={`cr_menu cr_menu_botones${clase ? ' ' + clase : ''}`} ref={ref}>
        <div className="cr_botones_pestanas" role="tablist">
          {menus.map((mm, i) => (
            <button
              key={mm.nombre}
              type="button"
              role="tab"
              aria-selected={pestana === i}
              className={`cr_botones_pestana${pestana === i ? ' cr_botones_elegida' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPestana(pestana === i ? null : i)}
            >
              {mm.nombre}
            </button>
          ))}
        </div>
        {m && (
          <div className="cr_botones_fila" role="toolbar" aria-label={m.nombre}>
            {m.items.map((it, j) =>
              it.separador ? (
                <span key={j} className="cr_botones_raya" />
              ) : (
                <button
                  key={j}
                  type="button"
                  className={`cr_boton${it.marcado ? ' cr_boton_marcado' : ''}`}
                  aria-pressed={it.marcado === undefined ? undefined : !!it.marcado}
                  disabled={it.deshabilitado}
                  title={it.atajo ? verAtajo(it.atajo) : undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => it.accion?.()}
                >
                  {it.texto}
                </button>
              ),
            )}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={`cr_menu${clase ? ' ' + clase : ''}`} ref={ref} role="menubar">
      {menus.map((m, i) => (
        <div key={m.nombre} className={`cr_menu_grupo${abierto === i ? ' cr_menu_abierto' : ''}`}>
          <button
            type="button"
            className="cr_menu_nombre"
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={abierto === i}
            // Sin llevarse el foco: el menú Edición de los textos actúa sobre lo elegido.
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => (abierto === i ? setAbierto(null) : abrir(i, e.currentTarget))}
            onPointerEnter={(e) =>
              abierto !== i && (abierto !== null || (enBarra() && otroAbiertoEnBarra(yo.current))) && abrir(i, e.currentTarget)
            }
          >
            {m.nombre}
          </button>
          {abierto === i &&
            createPortal(
              <div className={`caja_ritmos cr_adentro cr_portal${clase ? ' ' + clase + '_portal' : ''}`}>
            <div className={`cr_menu_lista cr_menu_suelta${esc ? ' cr_en_escritorio' : ''}`} role="menu" ref={lista} style={{ left: donde.x, top: donde.y, zIndex: MENU }}>
              {m.items.map((it, j) =>
                it.separador ? (
                  <div key={j} className="cr_menu_raya" />
                ) : (
                  <button
                    key={j}
                    type="button"
                    role="menuitem"
                    className="cr_menu_item"
                    disabled={it.deshabilitado}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setAbierto(null);
                      it.accion?.();
                    }}
                  >
                    <span className="cr_menu_marca">{it.marcado ? '✓' : ''}</span>
                    <span className="cr_menu_texto">{it.texto}</span>
                    <span className="cr_menu_atajo">{it.atajo ? verAtajo(it.atajo) : ''}</span>
                  </button>
                ),
              )}
            </div>
              </div>,
              // EN PANTALLA COMPLETA (2026-10-21, JP: «en full pantalla no funciona el menú», GameEditor):
              // solo se ve lo que está dentro del elemento a pantalla completa, así que la lista se
              // cuelga de él cuando el menú vive ahí adentro
              esc || (document.fullscreenElement && ref.current && document.fullscreenElement.contains(ref.current) ? document.fullscreenElement : document.body),
            )}
        </div>
      ))}
    </div>
  );
}
