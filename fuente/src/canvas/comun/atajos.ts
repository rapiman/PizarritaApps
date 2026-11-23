// LOS ATAJOS DE TECLADO (2026-10-02, etapa 8 de claude/pizarrita-programas.md, §16).
//
// Cada programa DECLARA sus atajos (programas.ts los cuelga de su declaración); los menús los
// muestran con `verAtajo` y la ayuda los lista todos («Atajos» en Ayuda.tsx). Por ahora es solo la
// declaración: cada programa sigue atendiendo sus teclas como antes. El despachador único (las del
// programa con foco primero, las que nadie toma al sistema) viene después, leyendo esto mismo.
//
// NOTACIÓN de `teclas`: partes unidas con «+». `Mod` es Ctrl (⌘ en Mac), `Mayús` es Shift (⇧),
// `Alt` es Alt (⌥). Las demás partes se muestran tal cual (Supr, Espacio, Enter, Esc, F2, ↑ ↓…).
// Un texto con espacios que no es una combinación («Clic en el nombre», «1 – 9») también va tal cual.

import { tr } from '../../traducir';

export type Atajo = {
  /** Las teclas, en la notación de arriba. */
  teclas: string;
  /** Qué hace: la clave de traducción y el texto en castellano. */
  clave: string;
  texto: string;
};

export type GrupoAtajos = {
  /** El nombre del grupo (clave de traducción y castellano). */
  clave: string;
  nombre: string;
  atajos: Atajo[];
};

const esMac = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

/** Cómo se lee un atajo en esta máquina: «Ctrl+Mayús+Z» o «⇧⌘Z». */
export function verAtajo(teclas: string): string {
  const mac = esMac();
  return teclas
    .split(' / ')
    .map((una) => {
      const partes = una.split('+');
      if (partes.length < 2) return una;
      const mods = partes.slice(0, -1);
      const tecla = partes[partes.length - 1];
      if (mac) {
        const orden = ['Ctrl', 'Alt', 'Mayús', 'Mod'];
        const signo: Record<string, string> = { Ctrl: '⌃', Alt: '⌥', Mayús: '⇧', Mod: '⌘' };
        return mods.sort((a, b) => orden.indexOf(a) - orden.indexOf(b)).map((m) => signo[m] || m).join('') + tecla;
      }
      const orden = ['Mod', 'Ctrl', 'Alt', 'Mayús'];
      return [...mods.sort((a, b) => orden.indexOf(a) - orden.indexOf(b)).map((m) => (m === 'Mod' ? 'Ctrl' : m)), tecla].join('+');
    })
    .join(' / ');
}

const a = (teclas: string, clave: string, texto: string): Atajo => ({ teclas, clave, texto });

// LOS COMUNES (§16): iguales en todos los programas. Los que todavía no hacen nada en todas partes
// (pegar como cita, buscar dentro, imprimir, F1) quedan marcados en la ayuda como «próximamente»
// hasta que el despachador los atienda.
export const ATAJOS_COMUNES: Atajo[] = [
  a('F2', 'at_f2', 'Editar la tarjeta elegida'),
  a('Enter', 'at_enter', 'Entrar a la tarjeta elegida'),
  a('Esc', 'at_esc', 'Terminar de editar; después, soltar la elección; sin nada elegido, salir a la pizarrita de arriba'),
  a('↑ ↓', 'at_hermanas', 'Elegir la tarjeta de arriba o la de abajo'),
  a('Mod+Z', 'at_deshacer', 'Deshacer'),
  a('Mod+Y / Mayús+Mod+Z', 'at_rehacer', 'Rehacer'),
  a('Mod+X / Mod+C / Mod+V', 'at_portapapeles', 'Cortar, copiar y pegar'),
  a('Supr', 'at_supr', 'Borrar lo elegido adentro del programa'),
  a('Supr (con la tarjeta elegida)', 'at_supr_tarjeta', 'Borrar la tarjeta (pregunta antes)'),
  a('F1', 'at_f1', 'Ayuda: los atajos del programa de la tarjeta'),
  a('Mod+S', 'at_guardar', 'Guardar una versión ahora (el guardado ya es automático)'),
  a('Mod+F', 'at_buscar', 'Buscar'),
];

// LOS DE CADA PROGRAMA, como los atiende hoy cada uno.
export const ATAJOS_TEXTO: Atajo[] = [
  a('Mod+B / Mod+I / Mod+U', 'at_tx_bis', 'Negrita, cursiva, subrayado'),
  a('Mod+1 / Mod+2 / Mod+3', 'at_tx_titulos', 'Título 1, 2 y 3'),
  a('Mod+0', 'at_tx_parrafo', 'Párrafo común'),
  a('Mod+L / Mod+E / Mod+R / Mod+J', 'at_tx_alinear', 'Alinear a la izquierda, al centro, a la derecha, justificar'),
  a('Mayús+Mod+8 / Mayús+Mod+7', 'at_tx_listas', 'Lista con viñetas, lista numerada'),
  a('Mod+Espacio', 'at_tx_limpiar', 'Quitar el formato'),
];

export const ATAJOS_DIBUJO: Atajo[] = [
  a('Mod+Z / Mod+Y', 'at_db_deshacer', 'Con el lápiz abierto: deshacer y rehacer el último trazo'),
  a('Supr', 'at_db_borrar', 'Borrar el trazo elegido'),
  a('Esc', 'at_db_poligono', 'Terminar el polígono que se está dibujando'),
];

export const ATAJOS_HOJA: Atajo[] = [
  a('← → ↑ ↓', 'at_hj_mover', 'Moverse de celda (con Mod: de a 10; con Mayús: elegir)'),
  a('Enter / Tab', 'at_hj_enter', 'Bajar o pasar a la derecha (con Mayús: al revés)'),
  a('F2', 'at_hj_f2', 'Escribir en la celda sin borrarla'),
  a('Esc', 'at_hj_esc', 'Dejar la celda como estaba'),
  a('Inicio / RePág / AvPág', 'at_hj_saltar', 'Al comienzo de la fila; 20 filas arriba o abajo'),
  a('Supr', 'at_hj_borrar', 'Vaciar las celdas elegidas'),
  a('Mod+Z / Mod+Y', 'at_hj_deshacer', 'Deshacer y rehacer'),
  a('Mod+B / Mod+I / Mod+U', 'at_hj_formato', 'Negrita, cursiva, subrayado'),
  a('Mod+A', 'at_hj_todo', 'Elegir toda la hoja'),
];

export const ATAJOS_CALCULADORA: Atajo[] = [
  a('0 – 9 . + − × ÷ ^ %', 'at_ca_teclas', 'Las teclas de la calculadora'),
  a('Enter / =', 'at_ca_igual', 'Resultado'),
  a('Retroceso', 'at_ca_atras', 'Borrar la última cifra'),
  a('Esc / Supr', 'at_ca_borrar', 'Borrar todo / borrar el número'),
];

// PIZARRITA SHOP PRO (ShopPro.tsx: `alTeclear`).
export const ATAJOS_IMAGEN: Atajo[] = [
  a('V', 'at_sp_mover', 'Mover'),
  a('B / E', 'at_sp_pincel', 'Pincel / goma'),
  a('S', 'at_sp_clonar', 'Clonar (Alt + clic: de dónde copiar)'),
  a('I', 'at_sp_gotero', 'Cuentagotas'),
  a('G / Mayús+G', 'at_sp_bote', 'Bote de pintura / degradado'),
  a('U', 'at_sp_formas', 'Formas'),
  a('M / L / W', 'at_sp_selec', 'Rectángulo / lazo / varita mágica'),
  a('H / Espacio', 'at_sp_mano', 'Mano (mover la vista)'),
  a('T', 'at_sp_texto', 'Texto nuevo'),
  a('C', 'at_sp_recortar', 'Recortar'),
  a('R / Mayús+R', 'at_sp_girar', 'Girar a la derecha / a la izquierda'),
  a('Alt+R', 'at_sp_girarlibre', 'Girar la imagen en cualquier ángulo'),
  a('Mod+T', 'at_sp_transformar', 'Girar o mover lo elegido (pasa a una capa)'),
  a('[ / ]', 'at_sp_grosor', 'Pincel más fino / más grueso'),
  a(', / .', 'at_sp_girar1', 'Girar la capa 1° (Mayús: 15°); en el fondo, enderezar 0,1° (Mayús: 1°)'),
  a('Mod+J / Mayús+Mod+J', 'at_sp_capasel', 'Capa vía copiar / cortar'),
  a('Mod+E / Mayús+Mod+E', 'at_sp_combinar', 'Combinar hacia abajo / visibles'),
  a('Alt+Mod+G', 'at_sp_recorta', 'Recortar a la capa de abajo (máscara de recorte)'),
  a('Mod+A / Mod+D / Mayús+Mod+I', 'at_sp_seleccion', 'Elegir todo / nada / invertir'),
  a('Mod+[ / Mod+]', 'at_sp_orden', 'Bajar / subir la capa'),
  a('← → ↑ ↓', 'at_sp_flechas', 'Mover la capa (en el fondo: todo; Mayús: de a 10)'),
  a('Supr', 'at_sp_quitar', 'Quitar la capa'),
  a('Mod+Z / Mayús+Mod+Z', 'at_sp_deshacer', 'Deshacer / rehacer'),
  a('Mod+S', 'at_sp_guardar', 'Guardar'),
  a('Mod++ / Mod+- / Mod+0 / Mod+1', 'at_sp_zoom', 'Acercar / alejar / que entre / tamaño real'),
];

export const ATAJOS_TERMINAL: Atajo[] = [
  a('Enter', 'at_tm_enter', 'Ejecutar'),
  a('↑ ↓', 'at_tm_historial', 'Las órdenes anteriores'),
  a('Ctrl+L', 'at_tm_limpiar', 'Limpiar la pantalla'),
];

export const ATAJOS_INSTRUMENTO: Atajo[] = [
  a('Z…M, Q…P', 'at_in_notas', 'Con el teclado encendido: tocan notas (Q = Do central)'),
  a('↑ ↓', 'at_in_octava', 'Subir o bajar una octava'),
];

export const ATAJOS_AUDIO: Atajo[] = [
  a('Espacio', 'at_au_escuchar', 'Escuchar / parar'),
  a('Enter', 'at_au_comienzo', 'Volver al comienzo'),
  a('Mod+Espacio / Mayús+R', 'at_au_grabar', 'Grabar'),
  a('Mayús+Mod+L', 'at_au_bucle', 'Escuchar en bucle'),
  a('F8', 'at_au_marca', 'Poner una marca en el cabezal'),
  a('[ / ]', 'at_au_marcas', 'Ir a la marca anterior o a la siguiente'),
  a('Mod+Z / Mod+Y', 'at_au_deshacer', 'Deshacer y rehacer'),
  a('Mod+X / Mod+C / Mod+V', 'at_au_portapapeles', 'Cortar, copiar y pegar'),
  a('Mod+A', 'at_au_todo', 'Elegir todo'),
  a('Supr', 'at_au_borrar', 'Borrar lo elegido'),
  a('A / H / Z', 'at_au_herr', 'Elegir, mano, lupa'),
  a('E', 'at_au_espectro', 'Ver el espectro'),
];

export const ATAJOS_VIDEO: Atajo[] = [
  a('Espacio / K / L', 'at_vd_tocar', 'Tocar o parar; parar; tocar'),
  a('← → (Mayús: de a 1 s)', 'at_vd_cuadro', 'Un cuadro atrás o adelante'),
  a('Inicio / Fin', 'at_vd_extremos', 'Al comienzo o al final'),
  a('I / O', 'at_vd_io', 'Marcar el comienzo o el final de la elección'),
  a('Mod+B', 'at_vd_dividir', 'Dividir el clip en el cabezal'),
  a('Mod+D', 'at_vd_transicion', 'Transición por omisión'),
  a('Mod+R', 'at_vd_retime', 'Cambiar la velocidad del clip'),
  a('Alt+G / Mayús+Alt+G', 'at_vd_agrupar', 'Agrupar o desagrupar'),
  a('Mayús+H', 'at_vd_congelar', 'Congelar el cuadro'),
  a('Alt+[ / Alt+]', 'at_vd_recortar', 'Recortar hasta el cabezal'),
  a('M, [ / ]', 'at_vd_marcas', 'Poner o quitar una marca; ir de marca en marca'),
  a('F8', 'at_vd_marca', 'Una marca con texto en el cabezal'),
  a('S / N', 'at_vd_vistas', 'Repasar al pasar el puntero; imán'),
  a('Mod+Z / Mod+Y', 'at_vd_deshacer', 'Deshacer y rehacer'),
  a('Mod+X / Mod+C / Mod+V (Mayús: pegar encima)', 'at_vd_portapapeles', 'Cortar, copiar y pegar'),
  a('Supr (Mayús: sin cerrar el hueco)', 'at_vd_borrar', 'Borrar lo elegido'),
  a('Letra de la herramienta', 'at_vd_herr', 'Elegir la herramienta (mantenerla apretada: mientras dura)'),
  a('Esc', 'at_vd_soltar', 'Soltar la elección'),
];

export const ATAJOS_RITMO: Atajo[] = [
  a('Espacio', 'ritmo_at_espacio', 'Tocar / pausa (afuera: tocar / parar). Adentro, la caja; afuera, la última tocada'),
  a('1 – 9', 'ritmo_at_pads', 'Con la caja andando, tocan la fila de ese número (grabando, dejan el golpe en el paso más cercano)'),
  a('REC, Z…M, Q…P', 'ritmo_at_teclado', 'Con una fila elegida: tocan notas con su sonido (Q = Do central); con la caja andando quedan en su piano roll'),
  a('↑ ↓', 'ritmo_at_elegir', 'Elegir la fila de arriba o la de abajo'),
  a('Alt+↑ ↓', 'ritmo_at_mover', 'Mover la fila elegida'),
  a('Mayús+Mod+← →', 'ritmo_at_correr', 'Correr su ritmo un paso (lo que sale por un lado entra por el otro)'),
  a('Mod+C / Mod+X / Mod+V', 'ritmo_at_copiar', 'Copiar, cortar y pegar su ritmo (solo el ritmo, no el sonido)'),
  a('Esc', 'ritmo_at_soltar', 'Soltar la fila elegida'),
];

/** Lo que se lee en la ayuda: el atajo con las teclas de esta máquina y el texto traducido. */
export function leerAtajo(x: Atajo): { teclas: string; texto: string } {
  return { teclas: verAtajo(x.teclas), texto: tr(x.clave, x.texto) };
}
