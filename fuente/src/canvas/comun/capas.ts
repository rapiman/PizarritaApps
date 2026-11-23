// LAS CAPAS (los z-index) de las ventanas y los menús de los programas (sacadas de tablero/frente.ts
// el 2026-11-23: los menús viajan fuera de Pizarrita). Las ventanas se apilan entre BASE y TOPE,
// entre los diálogos comunes de la página (8500) y los avisos y confirmaciones (9000). El menú
// abierto va más arriba todavía (MENU).
export const BASE = 8510;
export const TOPE = 8900;
export const MENU = 8950;
// El browser pegado a la izquierda: sobre la hoja, pero debajo de la barra de tareas y su menú
// de inicio (Pizarrita 95, ~1005) y de todas las ventanas.
export const PANEL = 990;
