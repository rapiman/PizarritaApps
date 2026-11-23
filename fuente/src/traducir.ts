// Traducción de interfaz del lado cliente. Las carga la app heredada
// (`cambiarIdioma` -> `trad_interfaz`) y acá solo se leen, con el idioma activo.
//
// Por qué no basta con `data-title`: la rutina heredada que traduce los tooltips
// recorre el DOM una vez, al cambiar de idioma. Los nodos que React monta después
// (la columna de acciones, la confirmación) se quedarían sin traducir hasta el
// próximo cambio. Igual se deja el `data-title` puesto, para que esa rutina los
// refresque cuando corre.
//
// `respaldo` es el texto en español que se usa mientras las traducciones no están
// cargadas o si falta la palabra.
import { cloneElement, useEffect, useState, type ReactElement } from 'react';

type Tablas = Record<string, Record<string, Record<string, string>>>;

// Nombre del evento que dispara la app heredada cuando termina de cargar las
// traducciones de un idioma (`cambiarIdioma` en scripts/idiomas.js).
export const EVENTO_IDIOMA = 'pizarrita:idioma';

// Re-renderiza el componente cuando cambia el idioma. Hace falta en los que no se
// vuelven a dibujar solos: el tablero se refresca cada 5 s y toma el idioma nuevo
// de paso, pero el panel de sesión se quedaría con los textos del idioma anterior.
export function useIdioma(): string {
  const [idioma, setIdioma] = useState<string>(
    () => (window as unknown as { idioma?: string }).idioma || 'ES',
  );
  useEffect(() => {
    const alCambiar = () => setIdioma((window as unknown as { idioma?: string }).idioma || 'ES');
    window.addEventListener(EVENTO_IDIOMA, alCambiar);
    return () => window.removeEventListener(EVENTO_IDIOMA, alCambiar);
  }, []);
  return idioma;
}

// TODA LA ISLA SE VUELVE A DIBUJAR AL LLEGAR EL IDIOMA (2026-09-25, pedido de JP:
// «traducciona useIdioma para todo»). Antes cada componente tenía que acordarse de
// llamar `useIdioma()`, y los que no lo hacían —Cabecera, Miga, Navegación, Bandeja,
// el título de la pestaña…— se quedaban con el respaldo en español hasta el próximo
// repintado. `main.tsx` monta cada isla envuelta en esto: al llegar las traducciones
// (o cambiar el idioma) la raíz se clona y React vuelve a dibujar todo su árbol, sin
// desmontar nada (el estado se conserva). Un componente nuevo queda cubierto solo.
export function ConIdioma({ children }: { children: ReactElement }): ReactElement {
  useIdioma();
  return cloneElement(children);
}

// `tema` es casi siempre 'interfaz' —los textos de la interfaz— pero la tabla tiene
// otros: 'privacidad' guarda las etiquetas de los cuatro niveles de acceso, con el
// número como palabra.
export function tr(clave: string, respaldo: string, tema = 'interfaz'): string {
  try {
    const w = window as unknown as {
      idioma?: string;
      trad_interfaz?: Tablas;
      App?: { state?: { trad_interfaz?: Tablas; idioma?: string } };
    };
    const idioma = w.idioma || w.App?.state?.idioma || 'ES';
    const tablas = w.App?.state?.trad_interfaz || w.trad_interfaz;
    return tablas?.[idioma]?.[tema]?.[clave] || respaldo;
  } catch {
    return respaldo;
  }
}
