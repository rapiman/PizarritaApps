// LA FUENTE, EL CSS Y EL TEMA DE LA PIZARRITA QUE SE ESTA MIRANDO (2026-09-15; tema
// 2026-09-22).
//
// `consulta_estilo` (sp_estilo) devuelve el estilo EFECTIVO: lo propio de la
// pizarrita o lo heredado de la madre mas cercana que tenga —dos fuentes (titulos y
// texto), un css y un tema—, mas lo propio a secas para la ventana de configurar. Aca
// se pinta:
//
// - Cada fuente entra con un `@font-face` de familia `pz-f<id>` (el archivo esta en
//   `images/fuentes/`, y con el <base> del encabezado la ruta relativa siempre llega),
//   y `:root` recibe `--fuente_titulos` y `--fuente_texto`. La hoja de estilos las usa
//   sobre el tablero; sin fuente, la variable no existe y cae a la del sistema.
// - El tema carga su hoja (`temas/<tema>/tema.css`) y pone `data-tema` en <html>.
// - El css libre aplica a la pagina entera. Entra por `textContent`, nunca como HTML.
//
// Se vuelve a pedir cada vez que se entra a una pizarrita (lo llama `llenar_idea`,
// en scripts/ideas.js, despues de los colores) y cuando la configuracion cambia.

import { useEffect, useState } from 'react';
import { cargarFuentesComunes } from './fuentesComunes';
import { descriptoresCss } from './fuenteAjuste';

export interface Estilo {
  fuente_titulos: number | null;
  fuente_titulos_nombre: string | null;
  fuente_titulos_archivo: string | null;
  fuente_titulos_escala?: number | null;
  fuente_titulos_interlineado?: number | null;
  fuente_titulos_ascenso?: number | null;
  fuente_texto: number | null;
  fuente_texto_nombre: string | null;
  fuente_texto_archivo: string | null;
  fuente_texto_escala?: number | null;
  fuente_texto_interlineado?: number | null;
  fuente_texto_ascenso?: number | null;
  css: string | null;
  css_de: number | null;
  propia_titulos: number | null;
  propia_texto: number | null;
  css_propio: boolean;
  css_largo: number | null;
  tema: string | null; // efectivo (propio o heredado); null = el clasico
  tema_de: number | null; // de que pizarrita viene
  propio_tema: string | null; // el elegido en esta, para la ventana de configurar
  // El botón para bajar audios y videos (2026-09-28): el efectivo (heredado) y el de esta.
  boton_bajar: boolean;
  propio_bajar: boolean | null;
  // La licencia de lo que se muestra (2026-09-28): la que rige (heredada) y la elegida en esta.
  licencia: string | null;
  propia_licencia: string | null;
  // La luz 3D (2026-09-30, canvas/juegos/luz3d.ts): la que rige (heredada) y la elegida en esta. JSON.
  luz: string | null;
  propia_luz: string | null;
  // El ícono (2026-10-05): el que rige (heredado), de qué pizarrita viene y el propio. Rutas
  // como las guarda `sp_bolsa` (`../images/fondos/…`).
  icono: string | null;
  icono_de: number | null;
  propio_icono: string | null;
}

let actual: Estilo | null = null;
let ideaActual = 0;
const oyentes = new Set<() => void>();

function avisar(): void {
  oyentes.forEach((cb) => cb());
}

function numero(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || v === '' || Number.isNaN(n) ? null : n;
}

function normalizar(fila: Record<string, unknown>): Estilo {
  return {
    fuente_titulos: numero(fila.fuente_titulos),
    fuente_titulos_nombre: (fila.fuente_titulos_nombre as string) || null,
    fuente_titulos_archivo: (fila.fuente_titulos_archivo as string) || null,
    fuente_titulos_escala: numero(fila.fuente_titulos_escala),
    fuente_titulos_interlineado: numero(fila.fuente_titulos_interlineado),
    fuente_titulos_ascenso: numero(fila.fuente_titulos_ascenso),
    fuente_texto: numero(fila.fuente_texto),
    fuente_texto_nombre: (fila.fuente_texto_nombre as string) || null,
    fuente_texto_archivo: (fila.fuente_texto_archivo as string) || null,
    fuente_texto_escala: numero(fila.fuente_texto_escala),
    fuente_texto_interlineado: numero(fila.fuente_texto_interlineado),
    fuente_texto_ascenso: numero(fila.fuente_texto_ascenso),
    css: (fila.css as string) || null,
    css_de: numero(fila.css_de),
    propia_titulos: numero(fila.propia_titulos),
    propia_texto: numero(fila.propia_texto),
    css_propio: fila.css_propio === true || fila.css_propio === 't' || fila.css_propio === 'true' || fila.css_propio === 1,
    css_largo: numero(fila.css_largo),
    tema: (fila.tema as string) || null,
    tema_de: numero(fila.tema_de),
    propio_tema: (fila.propio_tema as string) || null,
    boton_bajar: fila.boton_bajar === true || fila.boton_bajar === 't' || fila.boton_bajar === 'true',
    propio_bajar:
      fila.propio_bajar === null || fila.propio_bajar === undefined || fila.propio_bajar === ''
        ? null
        : fila.propio_bajar === true || fila.propio_bajar === 't' || fila.propio_bajar === 'true',
    licencia: (fila.licencia as string) || null,
    propia_licencia: (fila.propia_licencia as string) || null,
    luz: (fila.luz as string) || null,
    propia_luz: (fila.propia_luz as string) || null,
    icono: (fila.icono as string) || null,
    icono_de: numero(fila.icono_de),
    propio_icono: (fila.propio_icono as string) || null,
  };
}

function formatoDe(archivo: string): string {
  const ext = archivo.split('.').pop()?.toLowerCase();
  if (ext === 'woff2') return 'woff2';
  if (ext === 'woff') return 'woff';
  if (ext === 'otf') return 'opentype';
  return 'truetype';
}

function fontFace(id: number, archivo: string, escala?: number | null, interlineado?: number | null, ascenso?: number | null): string {
  const seguro = archivo.replace(/[^A-Za-z0-9._-]/g, '');
  return `@font-face { font-family: 'pz-f${id}'; src: url('images/fuentes/${seguro}') format('${formatoDe(seguro)}');${descriptoresCss({ escala, interlineado, ascenso })} font-display: swap; }\n`;
}

// EL TEMA (2026-09-22). Una hoja del repo, `temas/<tema>/tema.css`, que viste la pagina
// entera. `data-tema` en <html> dice cual esta puesto, para que cualquier regla (del
// tema o de la pizarrita) lo pueda preguntar. El clasico no carga nada: es lo de
// `css/estilo.css`.
//
// EL ORDEN DE LA CASCADA es base → tema → css de la pizarrita, y se arma moviendo los
// nodos detras del <link> de `css/estilo.css` (que esta en el <body>, no en el <head>):
// a igual especificidad gana el ultimo.
export const TEMA_CLASICO = 'pizarrita-2000';
// EL DE POR DEFECTO (2026-10-06, JP: «la pizarra por defecto puede ser la llana»): una pizarrita
// sin tema propio ni heredado se viste de Llana. El clásico sigue existiendo, pero hay que elegirlo.
export const TEMA_DEFECTO = 'pizarrita-llana';

export function temaDe(e: Estilo | null): string {
  const t = e?.tema || '';
  return /^[a-z0-9-]{1,40}$/.test(t) ? t : TEMA_DEFECTO;
}

let temaListo: Promise<void> = Promise.resolve();

function hojaBase(): HTMLLinkElement | null {
  return document.querySelector('link[href^="css/estilo.css"]');
}

// La misma version que la hoja base (`?v=` de index.php): un deploy cambia las dos.
function version(): string {
  const href = hojaBase()?.getAttribute('href') || '';
  const i = href.indexOf('?');
  return i >= 0 ? href.slice(i) : '';
}

// LAS VARIANTES SON UN AGREGADO (2026-10-01, JP: «tendrían que ser agregados que cambian el
// color de algunas cosas nomás»). Un tema de un sistema —Desierto, Verde oliva, Ámbar…— ya no
// es una copia entera de su tema base: se carga la hoja del base y, detrás, la de la variante,
// que trae solo lo que cambia (temas/variantes.py). Cuál es el base lo dice la quinta columna
// de temas.txt. En <html>, `data-tema` es el BASE —así todas sus reglas valen tal cual, sin
// tocar los temas armados— y `data-variante` el tema elegido, que es lo que preguntan las
// reglas del agregado. Lo guardado sigue siendo un solo id (`pizarridos-ambar`).
//
// EL ÁRBOL DE ESTILOS (2026-10-01, JP: «llevar todo como a un árbol de estilos»). Además de las
// variantes, un tema puede ser la última CAPA de una cadena: la SEXTA columna de temas.txt dice
// qué capas van antes, de la raíz hacia él (un skin web: `pizarrita-2026 pizarrita-llana`). Cada
// capa es la hoja de su carpeta y trae solo lo suyo; la página las carga en orden. En <html>,
// `data-tema` sigue siendo el tema elegido (lo preguntan chat.css y otros) y `data-linaje` lleva
// la cadena entera: cada capa pregunta por SU nombre ahí (`:root[data-linaje~="pizarrita-llana"]`),
// así vale igual sola que debajo de otra.
type Ramas = { base: string; capas: string[] };
async function ramasDe(tema: string): Promise<Ramas> {
  if (tema === TEMA_CLASICO) return { base: '', capas: [] };
  const lista = await listaDeTemas();
  const t = lista.find((x) => x.id === tema);
  // Una variante de un tema que es capa (Verde oliva sobre XP, que va sobre el 95) carga también
  // las capas de su base.
  const capasBase = t?.base ? lista.find((x) => x.id === t.base)?.capas || [] : [];
  return { base: t?.base || '', capas: t?.base ? capasBase : t?.capas || [] };
}

// Una hoja por id, con la promesa de su carga: pedir otra vez la misma dirección devuelve la
// misma promesa (aunque todavía esté cargando), así las perillas no se leen antes de tiempo.
const cargas = new WeakMap<HTMLLinkElement, { href: string; listo: Promise<void> }>();
function hojaDeTema(id: string, href: string): { l: HTMLLinkElement; listo: Promise<void> } {
  let l = document.getElementById(id) as HTMLLinkElement | null;
  if (!l) {
    l = document.createElement('link');
    l.id = id;
    l.rel = 'stylesheet';
  }
  const hecha = cargas.get(l);
  if (hecha && hecha.href === href) return { l, listo: hecha.listo };
  const el = l;
  const listo = new Promise<void>((ok) => {
    el.onload = () => ok();
    el.onerror = () => ok(); // un tema que no carga no deja la pagina tapada
  });
  el.href = href;
  cargas.set(el, { href, listo });
  return { l: el, listo };
}

function ponerTema(tema: string, ramas: Ramas, style: HTMLStyleElement): Promise<void> {
  const { base, capas } = ramas;
  const raiz = document.documentElement;
  raiz.dataset.tema = base || tema;
  if (base) raiz.dataset.variante = tema;
  else delete raiz.dataset.variante;
  raiz.dataset.linaje = [...capas, base || tema, ...(base ? [tema] : [])].join(' ');
  // Las hojas comunes van antes del tema: estilo.css y, detrás, el PizarrAmp común (css/pizarramp.css).
  // (Desde el 26-10 ese <link> está aunque todavía no tenga href: hojasAudio.ts se lo pone.)
  const comun = document.querySelector<HTMLLinkElement>('link[data-hoja-audio="pizarramp"]') || hojaBase();
  const hojas: HTMLLinkElement[] = [];
  const cargando: Promise<void>[] = [];
  // Las capas de más arriba, en orden; las que sobren de un tema anterior se van.
  capas.forEach((c, i) => {
    const h = hojaDeTema(`tema_capa_${i}`, `temas/${c}/tema.css${version()}`);
    hojas.push(h.l);
    cargando.push(h.listo);
  });
  for (let i = capas.length; document.getElementById(`tema_capa_${i}`); i++) document.getElementById(`tema_capa_${i}`)?.remove();
  if (tema === TEMA_CLASICO) {
    document.getElementById('tema_pizarrita')?.remove();
  } else {
    const h = hojaDeTema('tema_pizarrita', `temas/${base || tema}/tema.css${version()}`);
    hojas.push(h.l);
    cargando.push(h.listo);
  }
  if (base) {
    const h = hojaDeTema('tema_variante', `temas/${tema}/tema.css${version()}`);
    hojas.push(h.l);
    cargando.push(h.listo);
  } else {
    document.getElementById('tema_variante')?.remove();
  }
  // Común → capas → tema → variante → pizarrita. Solo se mueven si no estan ya en su lugar: mover
  // un <link> puede hacer que el navegador lo vuelva a evaluar.
  let antes: Element | null = comun;
  if (comun) {
    for (const l of hojas) {
      if (antes && antes.nextElementSibling !== l) antes.after(l);
      antes = l;
    }
  }
  if (antes && antes.nextElementSibling !== style) antes.after(style);
  return Promise.all(cargando).then(() => undefined);
}

// Cada pedido lleva su número: si mientras se buscaba el base de uno llegó otro (probar temas
// rápido en la ventana de configurar), el viejo no pinta encima del nuevo.
let pedidoTema = 0;
function pintarTema(tema: string, style: HTMLStyleElement): Promise<void> {
  const n = ++pedidoTema;
  if (tema === TEMA_CLASICO) {
    temaListo = ponerTema(tema, { base: '', capas: [] }, style);
    return temaListo;
  }
  const este: Promise<void> = ramasDe(tema).then((r) => (n === pedidoTema ? ponerTema(tema, r, style) : temaListo));
  temaListo = este;
  return este;
}

function pintar(e: Estilo | null): Promise<void> {
  // Todas las fuentes del fondo común quedan declaradas (un texto puede llevar cualquiera).
  void cargarFuentesComunes();
  let style = document.getElementById('estilo_pizarrita') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'estilo_pizarrita';
    document.head.appendChild(style);
  }
  const listo = pintarTema(temaDe(e), style);
  if (!e) {
    style.textContent = '';
    return listo;
  }
  let css = '';
  const vars: string[] = [];
  if (e.fuente_titulos && e.fuente_titulos_archivo) {
    css += fontFace(e.fuente_titulos, e.fuente_titulos_archivo, e.fuente_titulos_escala, e.fuente_titulos_interlineado, e.fuente_titulos_ascenso);
    vars.push(`--fuente_titulos: 'pz-f${e.fuente_titulos}';`);
  }
  if (e.fuente_texto && e.fuente_texto_archivo) {
    if (e.fuente_texto !== e.fuente_titulos) css += fontFace(e.fuente_texto, e.fuente_texto_archivo, e.fuente_texto_escala, e.fuente_texto_interlineado, e.fuente_texto_ascenso);
    vars.push(`--fuente_texto: 'pz-f${e.fuente_texto}';`);
  }
  if (vars.length) css += `:root { ${vars.join(' ')} }\n`;
  // el interlineado de la fuente del texto (fuenteAjuste.ts) también donde el tema fija el alto de la
  // línea (la Llana: 1.55): % del tamaño de la letra
  if (e.fuente_texto && e.fuente_texto_archivo && e.fuente_texto_interlineado) {
    css += `:root:root:root #react-tablero .todo { line-height: ${e.fuente_texto_interlineado / 100}; }\n`;
  }
  // y el de la de los títulos, en los títulos (los de las ideas y el nombre de la pizarrita)
  if (e.fuente_titulos && e.fuente_titulos_archivo && e.fuente_titulos_interlineado) {
    css += `:root:root:root:root :is(#react-tablero .todo :is(h1, h2, h3, h4), .pz-cabecera-nombre h1) { line-height: ${e.fuente_titulos_interlineado / 100}; }\n`;
  }
  // El css de la pizarrita alcanza la PAGINA ENTERA (2026-09-22; antes iba dentro de
  // `@scope (#react-tablero)`): barra, ventanas, todo. Decidido por JP, sin salida de
  // emergencia. Sigue pasando por `sp_css_limpio` al guardarse.
  if (e.css) css += e.css + '\n';
  style.textContent = css;
  return listo;
}

// LAS PERILLAS DEL TEMA (2026-09-22): lo que un tema pide y el CSS solo no puede hacer,
// escrito como variables en su hoja y leído acá una vez cargada:
//   --pz-modo: lista | indice | lienzo | presentacion — el tema se ve siempre así (un
//              Palm o un cuaderno no tienen lienzo). No cambia lo guardado en la
//              pizarrita: al volver a otro tema, vuelve su modo.
//   --pz-giro: no — las tarjetas no se ven giradas (una pantalla de caracteres).
//   --pz-rejilla: 8px — al soltar, la tarjeta cae en la rejilla (MS-DOS).
//   --pz-fijas: libres | fila | columna | fondo — dónde pone el tema las fijas (revisión
//              1, §10). `libres` es lo de siempre (cada una en su lugar de la pantalla);
//              con `fila` o `columna` el tema las acomoda en su franja (destacadas,
//              íconos del escritorio) y tocar una la abre agrandada; `fondo`: detrás.
//              Además cada tarjeta lleva `data-tipo`, y una fija de atrás `data-detras`.
//              `iconos` (2026-09-27): cada fija es un icono del escritorio; doble clic (o un
//              toque) la abre agrandada.
//   --pz-escritorio: izquierda | derecha | administrador — los iconos del escritorio
//              (IconosEscritorio.tsx): Mi Pizarrita, Portada, Buscar, Panel de control, Papelera.
//   --pz-grabadora: ventana — el botón de grabar abre una ventana de grabadora (con su
//              botón de empezar) en vez de grabar directo (Ventanas 95, 2026-09-22).
//   --pz-info-medio: si — el reproductor de audio pregunta al servidor lo que dice el
//              archivo (kbps, kHz, canales, título y artista) para mostrarlo (PizarrAmp).
//   --pz-ritmo-afuera: simple | compleja — cómo se ve una caja de ritmos desde afuera si la caja
//              no eligió (`ritmo.afuera`): simple (play, tempo, una fila general) o compleja (su
//              vista achicada; una canción muestra el patrón que va sonando). Sin la perilla,
//              compleja (2026-09-29).
//   --pz-mover-ventanas: todos — cualquiera que mira (también sin sesión) mueve las
//              voladoras de su barra de título, y queda guardado (`sp_ventana_xy`, que
//              además exige que el tema efectivo sea de ventanas).
//   --pz-ventanas-propias: si — el instrumento y la caja de ritmos son su propia ventana
//              (sin tarjeta, con nombre, minimizar y cerrar; 2026-09-24). Sin la perilla
//              (Pizarrita 2000) van en su tarjeta, con el estilo de siempre de la caja.
//   --pz-pizarramp: si — el reproductor de audio es PizarrAmp (2026-09-25): espectro de
//              verdad, balance, ventanas del ecualizador y de la playlist, y plegarlas a
//              una línea. Un audio suelto también lleva su playlist (de una pista).
//   --pz-pizarrion: si — el reproductor de audio se dibuja con una cara a la manera de Audion (Pizarrión,
//              PizarritOS 8, 2026-09-25; Pizarrion.tsx). Va junto con `--pz-pizarramp: si`,
//              que pone la playlist, el ecualizador guardado y los comentarios en pantalla.
//   --pz-barra-ventana: si — cada WordPad y cada Paint lleva su barra de verdad adentro
//              (2026-09-28), apagada mientras la ventana no está elegida.
//   --pz-plegar: si — minimizar una ventana la PLIEGA a su barra de título (la persiana del
//              Mac, PizarritOS 8, 2026-09-25) en vez de mandarla a la barra de tareas: el
//              botón de minimizar y el doble clic en la barra de título pliegan y despliegan.
// LA FORMA DEL AUDIO (2026-09-29): la misma en todos los sistemas; el sistema solo pone la de
// por defecto y la viste.
export type FormaAudio = 'simple' | 'onda' | 'pizarramp';
export const FORMAS_AUDIO: FormaAudio[] = ['simple', 'onda', 'pizarramp'];
export function esFormaAudio(v: unknown): v is FormaAudio {
  return v === 'simple' || v === 'onda' || v === 'pizarramp';
}
export type Perillas = { modo: string | null; giro: boolean; rejilla: number; fijas: string; grabadora: string; infoMedio: boolean; moverVentanas: boolean; moverPropias: boolean; ritmoCompleto: boolean; audioLista: boolean; ventanasPropias: boolean; pizarramp: boolean; plegar: boolean; pizarrion: boolean; arrange: boolean; menusArriba: boolean; colores: string; pixel: number; onda: string; editorAudio: string; ritmoVista: string; celda: string; cursor: string; teclas: string; lanzador: boolean; escritorio: string; barraVentana: boolean; audioForma: FormaAudio; audioFormaAdentro: FormaAudio; acciones: string; menusPrograma: string };
let perillas: Perillas = { modo: null, giro: true, rejilla: 0, fijas: 'libres', grabadora: 'directa', infoMedio: false, moverVentanas: false, moverPropias: false, ritmoCompleto: false, audioLista: false, ventanasPropias: false, pizarramp: false, plegar: false, pizarrion: false, arrange: false, menusArriba: false, colores: '', pixel: 0, onda: '', editorAudio: '', ritmoVista: '', celda: '', cursor: '', teclas: '', lanzador: false, escritorio: '', barraVentana: false, audioForma: 'simple', audioFormaAdentro: 'simple', acciones: 'barra', menusPrograma: 'menus' };
const oyentesPerillas = new Set<() => void>();
function leerPerillas(): void {
  const cs = getComputedStyle(document.documentElement);
  const modo = cs.getPropertyValue('--pz-modo').trim().replace(/['"]/g, '');
  const giro = cs.getPropertyValue('--pz-giro').trim().replace(/['"]/g, '') !== 'no';
  const rejilla = parseFloat(cs.getPropertyValue('--pz-rejilla')) || 0;
  const fijasCss = cs.getPropertyValue('--pz-fijas').trim().replace(/['"]/g, '');
  const fijas = /^(fila|columna|fondo|iconos)$/.test(fijasCss) ? fijasCss : 'libres';
  // (2026-09-29, JP: «que todos tengan su ventana, que nadie grabe directo»: la grabadora es
  // siempre una ventana; `--pz-grabadora` ya no cambia nada.)
  const grabadora = 'ventana';
  const infoMedio = cs.getPropertyValue('--pz-info-medio').trim().replace(/['"]/g, '') === 'si';
  const moverVentanas = cs.getPropertyValue('--pz-mover-ventanas').trim().replace(/['"]/g, '') === 'todos';
  // `--pz-mover-ventanas: propias` (Limbo, Web y App Riel, 2026-09-29): quien mira mueve solo
  // lo que tiene barra de título (el instrumento y la caja de ritmos, su barra fina).
  const moverPropias = moverVentanas || cs.getPropertyValue('--pz-mover-ventanas').trim().replace(/['"]/g, '') === 'propias';
  // (2026-09-29, JP: «compleja menos en los web»): la caja desde afuera es compleja salvo que el
  // tema pida `--pz-ritmo-afuera: simple` (Limbo, App Riel y Web). `completa` sigue valiendo.
  const ritmoCompleto = cs.getPropertyValue('--pz-ritmo-afuera').trim().replace(/['"]/g, '') !== 'simple';
  // `--pz-audio-adentro: lista`: adentro de un audio con audios pegados, la lista (la
  // playlist) también, con el reproductor principal como primera pista (PizarrAmp).
  const audioLista = cs.getPropertyValue('--pz-audio-adentro').trim().replace(/['"]/g, '') === 'lista';
  const ventanasPropias = cs.getPropertyValue('--pz-ventanas-propias').trim().replace(/['"]/g, '') === 'si';
  const pizarramp = cs.getPropertyValue('--pz-pizarramp').trim().replace(/['"]/g, '') === 'si';
  const plegar = cs.getPropertyValue('--pz-plegar').trim().replace(/['"]/g, '') === 'si';
  const pizarrion = cs.getPropertyValue('--pz-pizarrion').trim().replace(/['"]/g, '') === 'si';
  // `--pz-ritmo-arrange: si` (PizarritOS 8, 2026-09-25): la playlist de la caja se ve como la
  // ventana Arrange de Logic: una fila por instrumento, con sus regiones.
  const arrange = cs.getPropertyValue('--pz-ritmo-arrange').trim().replace(/['"]/g, '') === 'si';
  // `--pz-menus-arriba: si` (PizarritOS 8): los menús del programa (la caja de ritmos adentro)
  // van en la barra de menús de arriba, como en el Mac, y no en la ventana.
  const menusArriba = cs.getPropertyValue('--pz-menus-arriba').trim().replace(/['"]/g, '') === 'si';
  // `--pz-acciones` (2026-10-02, JP: lo decide el sistema): dónde van las acciones de la tarjeta
  // elegida, uno o varios de `barra` (la barra de herramientas), `flotante` (clic derecho o mantener
  // apretado: un menú junto a la tarjeta), `menu` (la barra de menús de arriba) e `inicio`.
  const acciones = (cs.getPropertyValue('--pz-acciones').trim().replace(/['"]/g, '').match(/\b(barra|flotante|menu|inicio)\b/g) || ['barra']).join(' ');
  // `--pz-menus-programa` (2026-10-02, JP: «como pizarrita limbo»): cómo se ven los menús de los
  // programas cuando no van en la barra de arriba: `menus` (la barra de menús de la ventana) o
  // `botones` (una fila de pestañas con los nombres y, debajo, los botones de la elegida).
  const menusPrograma = cs.getPropertyValue('--pz-menus-programa').trim().replace(/['"]/g, '') === 'botones' ? 'botones' : 'menus';
  // `--pz-colores` y `--pz-pixel`: los colores de la época para imágenes, videos y fondos
  // (ver retro.ts).
  const colores = cs.getPropertyValue('--pz-colores').trim().replace(/['"]/g, '');
  const pixel = parseInt(cs.getPropertyValue('--pz-pixel'), 10) || 0;
  // `--pz-onda: soundedit` (PizarritOS 6, 2026-09-25): el audio principal se ve como la
  // ventana de SoundEdit —la onda entera, con selección, marcadores y la casetera—
  // (PizarriSound.tsx). Otros temas pueden tener su propia cara con otro valor.
  const onda = cs.getPropertyValue('--pz-onda').trim().replace(/['"]/g, '');
  // `--pz-editor-audio: cooledit` (Pizarrita 95, 2026-09-26): el reproductor sigue siendo el
  // suyo (PizarrAmp) y en su menú está «Editar», que abre PizarriSound en una ventana aparte con
  // la cara de Cool Edit.
  const editorAudio = cs.getPropertyValue('--pz-editor-audio').trim().replace(/['"]/g, '');
  // `--pz-ritmo-vista: tracker` (PizarritOS 6, 2026-09-26): adentro, la caja es un tracker
  // (Tracker.tsx) en vez del channel rack.
  const ritmoVista = cs.getPropertyValue('--pz-ritmo-vista').trim().replace(/['"]/g, '');
  // `--pz-celda: 8px 16px` (2026-09-26, para MS-DOS): la pantalla es una grilla de caracteres;
  // lo que se mueve o se agranda salta de a una columna y de a una fila (celda.ts).
  const celda = cs.getPropertyValue('--pz-celda').trim().replace(/['"]/g, '');
  // `--pz-cursor: bloque` (PizarriDOS): el puntero es el bloque del mouse de MS-DOS, que
  // invierte la celda donde está (celda.ts).
  const cursor = cs.getPropertyValue('--pz-cursor').trim().replace(/['"]/g, '');
  // `--pz-teclas: dos` (PizarriDOS): F1 abre la ayuda y F10 el primer menú (celda.ts).
  const teclas = cs.getPropertyValue('--pz-teclas').trim().replace(/['"]/g, '');
  // `--pz-lanzador: si` (PizarriPocket, 2026-09-27): las voladoras no son ventanas sino iconos
  // de un lanzador (como el del Palm); tocar uno entra a esa idea, a pantalla completa.
  const lanzador = cs.getPropertyValue('--pz-lanzador').trim().replace(/['"]/g, '') === 'si';
  // `--pz-escritorio: izquierda | derecha | administrador` (2026-09-27, JP aprobó los iconos
  // del escritorio): Mi Pizarrita, Portada, Buscar, Panel de control y Papelera como iconos del
  // escritorio (IconosEscritorio.tsx), a ese lado; el tema los viste.
  const escritorioCss = cs.getPropertyValue('--pz-escritorio').trim().replace(/['"]/g, '');
  const escritorio = /^(izquierda|derecha|administrador)$/.test(escritorioCss) ? escritorioCss : '';
  // `--pz-barra-ventana: si` (2026-09-28, JP: «que no vaya volando a otro lado la herramienta»):
  // cada ventana de texto (WordPad) y de dibujo (Paint) lleva SU barra de verdad adentro
  // (Idea.tsx), apagada mientras la ventana no está elegida, y cada Paint con sus propias
  // herramienta, color, grosor y punta. Las barras de la pizarrita quedan para lo demás.
  const barraVentana = cs.getPropertyValue('--pz-barra-ventana').trim().replace(/['"]/g, '') === 'si';
  // `--pz-audio-forma` y `--pz-audio-forma-adentro: simple | onda | pizarramp` (2026-09-29, JP:
  // «unifiquemos todos»): la forma del audio que trae el sistema, afuera y adentro. Cada idea la
  // puede cambiar (`config.forma_audio`, formaAudio.ts). Sin la perilla, la de antes: PizarrAmp
  // si el tema lo dibuja, si no el reproductor simple.
  const formaDe = (v: string, siNo: FormaAudio): FormaAudio => (esFormaAudio(v) ? v : siNo);
  const audioForma = formaDe(cs.getPropertyValue('--pz-audio-forma').trim().replace(/['"]/g, ''), pizarramp ? 'pizarramp' : 'simple');
  const audioFormaAdentro = formaDe(cs.getPropertyValue('--pz-audio-forma-adentro').trim().replace(/['"]/g, ''), audioForma);
  // `--pz-pizarramp-propio: si` (95, XP, DOS, AS/400): el tema dibuja su PizarrAmp; los demás usan
  // el común (css/pizarramp.css, que se apaga con este atributo).
  // `--pz-ventana-fina: si` (Limbo, Web y App Riel): el instrumento y la caja llevan una barra de
  // título fina, del estilo de la página, arriba de su barra (css/estilo.css).
  document.documentElement.toggleAttribute('data-ventana-fina', cs.getPropertyValue('--pz-ventana-fina').trim().replace(/['"]/g, '') === 'si');
  document.documentElement.toggleAttribute('data-pizarramp-propio', cs.getPropertyValue('--pz-pizarramp-propio').trim().replace(/['"]/g, '') === 'si');
  const nuevas = { modo: /^(lienzo|lista|indice|presentacion)$/.test(modo) ? modo : null, giro, rejilla, fijas, grabadora, infoMedio, moverVentanas, moverPropias, ritmoCompleto, audioLista, ventanasPropias, pizarramp, plegar, pizarrion, arrange, menusArriba, colores, pixel, onda, editorAudio, ritmoVista, celda, cursor, teclas, lanzador, escritorio, barraVentana, audioForma, audioFormaAdentro, acciones, menusPrograma };
  if (
    nuevas.modo === perillas.modo &&
    nuevas.giro === perillas.giro &&
    nuevas.rejilla === perillas.rejilla &&
    nuevas.fijas === perillas.fijas &&
    nuevas.escritorio === perillas.escritorio &&
    nuevas.grabadora === perillas.grabadora &&
    nuevas.infoMedio === perillas.infoMedio &&
    nuevas.moverVentanas === perillas.moverVentanas &&
    nuevas.moverPropias === perillas.moverPropias &&
    nuevas.ritmoCompleto === perillas.ritmoCompleto &&
    nuevas.audioLista === perillas.audioLista &&
    nuevas.ventanasPropias === perillas.ventanasPropias &&
    nuevas.pizarramp === perillas.pizarramp &&
    nuevas.plegar === perillas.plegar &&
    nuevas.pizarrion === perillas.pizarrion &&
    nuevas.arrange === perillas.arrange &&
    nuevas.menusArriba === perillas.menusArriba &&
    nuevas.colores === perillas.colores &&
    nuevas.pixel === perillas.pixel &&
    nuevas.onda === perillas.onda &&
    nuevas.editorAudio === perillas.editorAudio &&
    nuevas.ritmoVista === perillas.ritmoVista &&
    nuevas.celda === perillas.celda &&
    nuevas.cursor === perillas.cursor &&
    nuevas.teclas === perillas.teclas &&
    nuevas.lanzador === perillas.lanzador &&
    nuevas.barraVentana === perillas.barraVentana &&
    nuevas.audioForma === perillas.audioForma &&
    nuevas.audioFormaAdentro === perillas.audioFormaAdentro &&
    nuevas.acciones === perillas.acciones &&
    nuevas.menusPrograma === perillas.menusPrograma
  )
    return;
  perillas = nuevas;
  document.documentElement.toggleAttribute('data-sin-giro', !giro);
  oyentesPerillas.forEach((f) => f());
}
// Para lo que no es React (retro.ts): avisar cuando cambian las perillas del tema.
/** UNA PERILLA SUELTA del tema (2026-10-03, bloque G9): la variable `--pz-…` de la raíz, sin comillas
 *  (`crudo`: tal cual, p. ej. un `url("…")`). Para las que no están en `Perillas`; antes cada uno
 *  la leía con su `getComputedStyle(…).getPropertyValue(…).trim().replace(…)`. */
export function perilla(nombre: string, op: { crudo?: boolean } = {}): string {
  if (typeof document === 'undefined') return '';
  const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return op.crudo ? v : v.replace(/^["']|["']$/g, '').replace(/['"]/g, '').trim();
}

export function alCambiarPerillas(f: () => void): () => void {
  oyentesPerillas.add(f);
  return () => oyentesPerillas.delete(f);
}
export function perillasDelTema(): Perillas {
  return perillas;
}
export function usePerillas(): Perillas {
  const [p, setP] = useState(perillas);
  useEffect(() => {
    const f = () => setP(perillas);
    oyentesPerillas.add(f);
    f();
    return () => {
      oyentesPerillas.delete(f);
    };
  }, []);
  return p;
}

export function estiloActual(): Estilo | null {
  return actual;
}

// VER EN VIVO. La ventana de configurar pinta lo que se esta probando —una fuente
// bajo el mouse, el css mientras se escribe— encima de lo real, sin guardar nada.
// Con `null` vuelve lo real. Lo que llega del servidor (una navegacion, un guardado)
// tambien la pisa: lo guardado ya es lo real.
export function previsualizar(parcial: Partial<Estilo> | null): void {
  const base: Estilo = actual || {
    fuente_titulos: null,
    fuente_titulos_nombre: null,
    fuente_titulos_archivo: null,
    fuente_texto: null,
    fuente_texto_nombre: null,
    fuente_texto_archivo: null,
    css: null,
    css_de: null,
    propia_titulos: null,
    propia_texto: null,
    css_propio: false,
    css_largo: null,
    tema: null,
    tema_de: null,
    propio_tema: null,
    boton_bajar: false,
    propio_bajar: null,
    licencia: null,
    propia_licencia: null,
    luz: null,
    propia_luz: null,
    icono: null,
    icono_de: null,
    propio_icono: null,
  };
  // Y las perillas del tema que se prueba (la forma del audio, la cara de la onda…): sin esto, al
  // probar otro tema se veía su CSS con las piezas del tema de antes (2026-10-01).
  void pintar(parcial ? { ...base, ...parcial } : actual).then(leerPerillas);
}

// EL ÍCONO DE LA PESTAÑA (2026-10-05, JP: «que sea de la configuración de la pizarra»). El de
// la pizarrita que se mira (o de su madre); sin ninguno, el de Pizarrita System. Se cambian los
// `<link>` del encabezado: el de la pestaña y el del teléfono.
const ICONO_PIZARRITA = { icon: 'favicon.ico', apple: 'images/icono/apple-touch-icon.png' };
export function rutaDeIcono(ruta: string | null): string | null {
  const r = (ruta || '').replace(/^(\.\.\/)+/, '');
  return /^images\/[A-Za-z0-9_./-]+$/.test(r) && !r.includes('..') ? r : null;
}
function ponerIcono(ruta: string | null): void {
  if (typeof document === 'undefined') return;
  const propio = rutaDeIcono(ruta);
  const fijar = (rel: string, href: string, sizes: string | null) => {
    let l = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!l) {
      l = document.createElement('link');
      l.rel = rel;
      document.head.appendChild(l);
    }
    if (l.getAttribute('href') === href) return;
    l.setAttribute('href', href);
    if (sizes) l.setAttribute('sizes', sizes);
    else l.removeAttribute('sizes');
  };
  fijar('icon', propio || ICONO_PIZARRITA.icon, propio ? null : '16x16 32x32 48x48');
  fijar('apple-touch-icon', propio || ICONO_PIZARRITA.apple, null);
}

// Pide y pinta el estilo de una pizarrita. Con `idea` en 0 (la portada) se pide igual:
// la portada tambien puede tener fuente.
// (2026-11-23) Cómo se pide lo instala Pizarrita (main.tsx, api/cuentaPizarrita.ts): este archivo
// viaja con los programas fuera de Pizarrita, donde no hay API. Sin eso, no se pide nada.
type TraerEstilo = (idea: number) => Promise<Record<string, unknown> | null>;
let traerEstilo: TraerEstilo | null = null;
export function ponerTraerEstilo(f: TraerEstilo): void {
  traerEstilo = f;
}
export function aplicarEstilo(idea: number): void {
  ideaActual = Number(idea) || 0;
  const pedida = ideaActual;
  if (!traerEstilo) return;
  void traerEstilo(pedida).then((fila) => {
    if (pedida !== ideaActual) return; // ya se navego a otra
    actual = fila ? normalizar(fila) : null;
    ponerIcono(actual?.icono ?? null);
    // El velo de carga espera tambien al tema: sin esto se veia un momento el clasico
    // y despues cambiaba (rutinas.js, `__cargaLista`).
    void pintar(actual).then(() => {
      leerPerillas();
      window.__cargaLista?.('estilo', pedida);
    });
    avisar();
  });
}

// Volver a pedir el de la pizarrita actual (despues de cambiar la configuracion).
export function refrescarEstilo(): void {
  aplicarEstilo(ideaActual);
}

export function useEstilo(): Estilo | null {
  const [e, setE] = useState<Estilo | null>(actual);
  useEffect(() => {
    const h = () => setE(actual);
    oyentes.add(h);
    h();
    return () => {
      oyentes.delete(h);
    };
  }, []);
  return e;
}

declare global {
  interface Window {
    __aplicarEstilo?: (idea: number) => void;
    __refrescarEstilo?: () => void;
    __cargaLista?: (parte: string, donde: number | string) => void; // rutinas.js
  }
}

// LOS TEMAS QUE HAY. La lista es del repo (`temas/temas.txt`: `id | nombre | época` por
// línea, `#` comenta), no de la base: un tema son archivos. Se pide una vez y queda.
// Desde el 2026-09-28 hay una cuarta columna, el SISTEMA (la forma de interactuar); el nombre es
// el del tema dentro de su sistema. Sin sistema, el tema es su propio sistema.
// La QUINTA columna (2026-10-01) es el tema BASE de una variante: su hoja trae solo lo que
// cambia y se carga detrás de la del base (ver `ramasDe`). Vacía en los temas enteros.
// La SEXTA (2026-10-01) son las CAPAS de un tema del árbol: las hojas que van antes de la suya,
// separadas por espacios, de la raíz hacia él (ver `ramasDe`).
export type TemaDisponible = { id: string; nombre: string; epoca?: string; sistema: string; base?: string; capas?: string[] };

// Los sistemas, en el orden de su primera línea, con sus temas.
export type SistemaDisponible = { nombre: string; temas: TemaDisponible[] };
export function sistemasDe(temas: TemaDisponible[]): SistemaDisponible[] {
  const lista: SistemaDisponible[] = [];
  for (const t of temas) {
    let s = lista.find((x) => x.nombre === t.sistema);
    if (!s) lista.push((s = { nombre: t.sistema, temas: [] }));
    s.temas.push(t);
  }
  return lista;
}

// «Web · Ciberpunk», o solo «Pizarrita 95» si el sistema tiene un solo tema.
export function nombreDeTema(temas: TemaDisponible[], id: string): string {
  const t = temas.find((x) => x.id === id);
  if (!t) return id;
  const cuantos = temas.filter((x) => x.sistema === t.sistema).length;
  return cuantos > 1 ? `${t.sistema} · ${t.nombre}` : t.sistema;
}
let temasDisponibles: Promise<TemaDisponible[]> | null = null;
export function listaDeTemas(): Promise<TemaDisponible[]> {
  if (!temasDisponibles) {
    temasDisponibles = fetch(`temas/temas.txt${version()}`)
      .then((r) => (r.ok ? r.text() : ''))
      .then((txt) =>
        txt
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'))
          .map((l) => {
            const [id, nombre, epoca, sistema, base, capas] = l.split('|').map((s) => s.trim());
            return {
              id,
              nombre: nombre || id,
              epoca,
              sistema: sistema || nombre || id,
              base: /^[a-z0-9-]{1,40}$/.test(base || '') ? base : undefined,
              capas: (capas || '').split(/\s+/).filter((c) => /^[a-z0-9-]{1,40}$/.test(c)),
            };
          })
          .filter((t) => /^[a-z0-9-]{1,40}$/.test(t.id)),
      )
      .catch(() => []);
  }
  return temasDisponibles;
}
// LOS GANCHOS PARA EL jQUERY DE PIZARRITA (ideas.js, rutinas.js). Los pone main.tsx al arrancar (y no
// este archivo al cargarse, desde el 2026-11-23): fuera de Pizarrita no se ensucia la página.
export function instalarEstiloEnLaPagina(): void {
  window.__aplicarEstilo = aplicarEstilo;
  window.__refrescarEstilo = refrescarEstilo;
  // Para revisar un tema sin guardarlo (consola o una sesión de Claude): `__previsualizarEstilo({ tema: 'pizarritos-6' })`,
  // y `__previsualizarEstilo(null)` vuelve a lo real. Es lo mismo que hace la ventana de configurar al probar.
  (window as unknown as { __previsualizarEstilo?: typeof previsualizar }).__previsualizarEstilo = previsualizar;
}
