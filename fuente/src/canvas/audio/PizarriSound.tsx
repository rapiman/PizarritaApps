import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../../traducir';
import type { Marca } from './MediaPlayer';
import type { EdicionesAudio } from './HerramientasAudio';
import { MenuPrograma } from '../comun/MenuPrograma';
import type { Menu } from '../comun/MenuPrograma';
import { EscritorioCtx } from '../comun/escritorioCtx';
import { usePerillas } from '../../estilo';
import { ControlesTempo, TEMPO_INICIO, rayasCompas, rotuloCompas, useReglas } from './compas';
import type { Tempo } from './compas';
import { ctx as ctxComun } from './contextoAudio';
import { NOTA_ALTA, NOTA_BAJA, frecuenciaNota, nombreNota, pintarEspectro } from './espectro';
import { amplificar, conEco, darVuelta, factorEn, fundido, insertar, largo, largoTotal, quitar, reemplazar, tomar } from './montaje';
import type { Tramo } from './montaje';
import { guardarPref, leerPref } from '../comun/preferencias';
import { fmtFino, mmssDec } from '../comun/tiempo';

// PIZARRISOUND (2026-09-25, JP: «Pizarrasound… en el servidor… dale»): el audio principal
// visto como la ventana de SoundEdit (Farallon, 1986): la onda entera en negro sobre
// blanco, la regla del tiempo abajo, lo elegido invertido, el cursor que titila donde se
// va a insertar, y la casetera para escuchar. Lo pide el tema con `--pz-onda: soundedit`
// (PizarritOS 6); el aspecto es del tema (clases `ps_*`), aquí solo el dibujo y los gestos.
//
// LA ONDA NO SE CALCULA AQUÍ: la da `picos.php` (un par mínimo/máximo por centésima, de la
// mezcla a mono), que ffmpeg calcula una vez por archivo en el servidor. Se dibuja solo el
// pedazo que se ve, en un lienzo pegado a la izquierda del marco que se desplaza; lo largo
// lo pone un relleno del ancho de todo el audio, así el desplazamiento es el del navegador.

// Los picos viven en picosOnda.ts (O2, 26-10): así la onda sin editar no arrastra este archivo.
import { pedirPicos, type Picos } from './picosOnda';
import { ponerHojasAudio } from '../../hojasAudio';

// Las hojas del audio (pizarramp.css, pizarrion.css) se piden al cargarse este trozo (§13.6).
ponerHojasAudio();
export { pedirPicos };
export type { Picos };

// ---- LA EDICIÓN (2026-09-25, JP: cortar, copiar, pegar, silenciar, invertir) ----
// Quien puede editar el audio le pasa esto; sin él, PizarriSound solo muestra y reproduce.
export interface EdicionOnda {
  idea: number;
  // Dónde vive la idea (lo usa quien arma esto, para lo que le pide al servidor).
  bolsa: number;
  // (2026-11-23, docs/anfitrion.md) GUARDAR LO QUE SE GRABÓ: devuelve el nombre con que quedó (el
  // `f` del tramo) y cuánto dura, o el mensaje de error. Sin esto, no se graba. En Pizarrita sube
  // al servidor (pedazo.ts); fuera, lo guarda el anfitrión adentro del documento.
  grabar?: (grabacion: Blob, extension: string) => Promise<{ archivo: string; duracion: number } | { error: string }>;
  // REEMPLAZAR el audio entero con un archivo que elija la persona. Sin esto, no se ofrece.
  reemplazar?: () => void;
  // De dónde se baja un archivo que nombra un tramo (su `f`). Sin esto, el nombre ES la dirección
  // (Pizarrita: la ruta en el servidor). Fuera de Pizarrita lo sabe el anfitrión.
  direccion?: (archivo: string) => string;
  // Donde no hay multipista (fuera de Pizarrita, por ahora), no se ofrece pasar a esa vista.
  sinMultipista?: boolean;
  // (2026-11-23) BAJAR lo que suena como archivo suelto, en WAV o en mp3. Sin esto, no se ofrece.
  exportar?: (formato: 'wav' | 'mp3') => void;
  ediciones: EdicionesAudio;
  // El servidor está rearmando el audio, o no pudo.
  estado?: 'procesando' | 'error';
  mensaje?: string;
  aplicar: (e: EdicionesAudio) => void;
  // (2026-09-30) El tempo y el compás del audio (la regla en compases), y cómo se crea una marca (un
  // mensaje flotante pegado al audio en ese instante).
  tempo?: Tempo;
  alTempo?: (t: Tempo) => void;
  marcar?: (t: number, texto: string) => void;
  // (2026-11-03) Un pedazo a una idea nueva: los tramos y de qué idea son (el portapapeles puede ser
  // de otra). Devuelve null si salió bien, o el mensaje de error. Sin esto, no se ofrece.
  aNuevo?: (tramos: Tramo[], origen: number) => Promise<string | null>;
  nuevoEsVideo?: boolean;
  nuevoEnCaja?: boolean;
}
// El portapapeles es de la página (se puede copiar de un audio y pegar en otro momento), pero
// solo se pega en el mismo audio: los tramos nombran archivos de esa idea.
let portapapeles: { idea: number; tramos: Tramo[] } | null = null;
// Deshacer: lo que había antes de cada cambio, por idea (sobrevive a que la ventana se
// vuelva a armar cuando llega el audio nuevo).
// Con cada paso va también lo que estaba elegido, para que deshacer lo devuelva (2026-09-28).
type Paso = { ed: EdicionesAudio; sel: Seleccion | null };
const antes = new Map<number, Paso[]>();
// Rehacer: lo deshecho, por idea; un cambio nuevo lo olvida.
const despues = new Map<number, Paso[]>();
function guardarAntes(idea: number, ed: EdicionesAudio, sel: Seleccion | null) {
  const pila = antes.get(idea) || [];
  pila.push({ ed, sel });
  if (pila.length > 50) pila.shift();
  antes.set(idea, pila);
  despues.delete(idea);
}

// La onda de un montaje, armada con la de sus archivos: se ve el cambio al instante, mientras
// el servidor rearma el audio de verdad.
function componer(m: Tramo[], fuentes: Map<string, Picos>, vel: number): Picos | null {
  const hz = 100;
  const partes: Int8Array[] = [];
  let n = 0;
  for (const t of m) {
    const cuantos = Math.round(largo(t) * hz);
    const q = new Int8Array(cuantos * 2);
    if (!('s' in t)) {
      const f = fuentes.get(t.f);
      if (!f) return null;
      for (let i = 0; i < cuantos; i += 1) {
        const k = t.r ? Math.floor(t.b * f.hz) - 1 - i : Math.floor(t.a * f.hz) + i;
        if (k < 0 || k * 2 + 1 >= f.p.length) continue;
        const x = factorEn(t.e, cuantos > 0 ? i / cuantos : 0);
        q[i * 2] = Math.max(-128, Math.min(127, Math.round(f.p[k * 2] * x)));
        q[i * 2 + 1] = Math.max(-128, Math.min(127, Math.round(f.p[k * 2 + 1] * x)));
      }
    }
    partes.push(q);
    n += cuantos;
  }
  const p = new Int8Array(n * 2);
  let o = 0;
  for (const q of partes) {
    p.set(q, o);
    o += q.length;
  }
  return { hz: hz * vel, dura: n / hz / vel, p };
}

// La escala de dB de Cool Edit: amplitud (1 = el máximo) y su rótulo, arriba y abajo del cero.
const ESCALA_DB: [number, string][] = [
  [1, '0'],
  [0.5, '-6'],
  [0.25, '-12'],
  [0.125, '-18'],
  [0, '-∞'],
  [-0.125, '-18'],
  [-0.25, '-12'],
  [-0.5, '-6'],
  [-1, '0'],
];

// El reloj de Cool Edit: minutos, segundos y milésimas.
function fmtMilis(t: number): string {
  return mmssDec(t, 3);
}

// Las marcas de la regla: el paso más chico que deja al menos 60 px entre números.
const PASOS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
function pasoDeRegla(pps: number): number {
  return PASOS.find((p) => p * pps >= 60) ?? 3600;
}
function rotuloRegla(t: number, paso: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const dec = paso < 0.1 ? 2 : paso < 1 ? 1 : 0;
  const ss = s.toFixed(dec).padStart(dec ? 3 + dec : 2, '0');
  return `${m}:${ss}`;
}

const segundos = (t: number) => (Number.isFinite(t) ? t : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ALTO_ONDA = 128; // el de SoundEdit; otra cara puede pedir otro (`alto`)
const ALTO_REGLA = 18;
const ZOOM_MAX = 2000; // píxeles por segundo: a esa escala se ve cada centésima de 20 px

export interface Seleccion {
  a: number;
  b: number;
}

export function PizarriSound({
  src,
  actual,
  total,
  sonando,
  marcas,
  vivas,
  elemento,
  irA,
  onPlay,
  onStop,
  editar,
  menus: conMenus = false,
  cara = 'soundedit',
  alto: altoOnda = ALTO_ONDA,
  alTerminar,
}: {
  src: string;
  actual: number;
  total: number;
  sonando: boolean;
  marcas: Marca[] | null;
  vivas: Set<string>;
  elemento: () => HTMLMediaElement | null;
  irA: (t: number, sonar: boolean) => void;
  onPlay: () => void;
  onStop: () => void;
  editar?: EdicionOnda;
  // Los menús del programa (solo la ventana de la idea desplegada): arriba si el tema los
  // quiere en la barra de menús, si no en la ventana.
  menus?: boolean;
  // La cara: 'soundedit' (la de siempre) o 'cooledit' (Pizarrita 95: el reloj grande y los
  // cuadros de Inicio, Fin y Largo; los colores los pone el tema con `--ps-*`), 'grabadora'
  // (3.11) o 'audiomaster' (PizarrAmiga: los botones con palabras y los cuadros del rango).
  cara?: string;
  alto?: number;
  // Volver a ser un audio normal (Pizarrita 95: PizarriEdit → PizarrAmp). Con él, el menú Archivo.
  alTerminar?: () => void;
}) {
  const [picos, setPicos] = useState<Picos | null>(null);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    setPicos(null);
    if (!src) {
      setCargando(false);
      return undefined;
    }
    setCargando(true);
    let vigente = true;
    void pedirPicos(src).then((p) => {
      if (!vigente) return;
      setPicos(p);
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, [src]);

  // Lo que se acaba de editar y el servidor todavía está rearmando: se muestra ya, armado con
  // la onda de sus archivos. Se va cuando llega el audio nuevo (cambia `src`).
  const ed: EdicionesAudio = editar?.ediciones || {};
  const vel = Number(ed.velocidad) || 1;
  const [pendiente, setPendiente] = useState<Tramo[] | null>(null);
  useEffect(() => setPendiente(null), [src]);
  useEffect(() => {
    if (editar?.estado === 'error') setPendiente(null);
  }, [editar?.estado]);
  const [fuentes, setFuentes] = useState<Map<string, Picos>>(new Map());
  useEffect(() => {
    if (!pendiente) return undefined;
    let vigente = true;
    const archivos = [...new Set(pendiente.flatMap((t) => ('s' in t ? [] : [t.f])))];
    const donde = editar?.direccion;
    void Promise.all(archivos.map((f) => pedirPicos(donde ? donde(f) || f : f).then((p) => [f, p] as const))).then((r) => {
      if (!vigente) return;
      const m = new Map<string, Picos>();
      for (const [f, p] of r) if (p) m.set(f, p);
      setFuentes(m);
    });
    return () => {
      vigente = false;
    };
  }, [pendiente]);
  const compuesto = pendiente ? componer(pendiente, fuentes, vel) : null;
  // LA ONDA FINA (2026-10-08, JP: «la onda sale sin mucha calidad»): los picos del servidor son 100
  // por segundo, y con zoom (o en un audio corto que llena la ventana) cada uno ocupaba varios
  // pixeles: se veían escalones. Cuando se ven más columnas por segundo que picos hay, se sacan
  // del audio decodificado en el navegador (el mismo del espectro), hasta 4000 por segundo.
  const [fina, setFina] = useState<Picos | null>(null);
  const vistaBase = fina || picos;
  const vista = compuesto || (pendiente ? null : vistaBase);

  const dura = pendiente ? largoTotal(pendiente) / vel : total > 0 ? total : picos?.dura || 0;
  const marcoRef = useRef<HTMLDivElement>(null);
  const lienzoRef = useRef<HTMLCanvasElement>(null);
  const [ancho, setAncho] = useState(0); // lo que se ve del marco
  const [desde, setDesde] = useState(0); // su desplazamiento
  // `null` = que entre entero (el zoom de siempre de SoundEdit al abrir).
  const [zoom, setZoom] = useState<number | null>(null);
  const ppsAjuste = dura > 0 && ancho > 0 ? ancho / dura : 1;
  const pps = zoom ?? ppsAjuste;
  const anchoTodo = Math.max(ancho, Math.ceil(dura * pps));

  const [sel, setSel] = useState<Seleccion | null>(null);
  const [reglas, setReglas] = useReglas(editar?.idea || 0);
  const tempoV = editar?.tempo || TEMPO_INICIO;
  const verCompases = !!editar && reglas.compases;
  const verMinutos = !verCompases || reglas.minutos;
  // Con las dos: compases arriba, minutos abajo; la regla mide el doble.
  const altoRegla = verCompases && verMinutos ? ALTO_REGLA * 2 : ALTO_REGLA;
  // EL AUDIO DECODIFICADO (para el espectro y para oír los efectos antes de aplicarlos).
  const bufRef = useRef<{ src: string; buf: Promise<AudioBuffer | null> } | null>(null);
  const decodificado = (): Promise<AudioBuffer | null> => {
    if (!bufRef.current || bufRef.current.src !== src)
      bufRef.current = {
        src,
        buf: fetch(src)
          .then((r) => r.arrayBuffer())
          .then((b) => ctxComun().decodeAudioData(b))
          .catch(() => null),
      };
    return bufRef.current.buf;
  };
  // LA VISTA DE ESPECTRO (2026-09-30, JP: «espectro con notas do re mi…»): en vez de la onda, el
  // espectro de lo que se ve, con las notas a la izquierda. De cada uno (en este navegador).
  const [espectro, setEspectro] = useState(() => {
    try {
      return leerPref('audio', 'espectro', false);
    } catch {
      return false;
    }
  });
  const cambiarEspectro = (v: boolean) => {
    setEspectro(v);
    try {
      guardarPref('audio', 'espectro', v);
    } catch {
      /* vale mientras dure */
    }
  };
  useEffect(() => setFina(null), [src]);
  useEffect(() => {
    if (fina || !picos || pendiente || pps <= picos.hz * 1.2) return undefined;
    let vigente = true;
    void decodificado().then((buf) => {
      if (!vigente || !buf) return;
      const dur = buf.duration;
      const hz = Math.max(picos.hz, Math.min(4000, Math.floor(4e6 / Math.max(1, dur))));
      const n = Math.ceil(dur * hz);
      const p = new Int8Array(n * 2);
      const canales = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
      const nc = canales.length;
      const paso = buf.sampleRate / hz;
      for (let i = 0; i < n; i += 1) {
        const i0 = Math.floor(i * paso);
        const i1 = Math.min(buf.length, Math.max(i0 + 1, Math.floor((i + 1) * paso)));
        let mn = 1;
        let mx = -1;
        for (let k = i0; k < i1; k += 1) {
          let v = 0;
          for (let c = 0; c < nc; c += 1) v += canales[c][k];
          v /= nc;
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        if (mn > mx) mn = mx = 0;
        p[i * 2] = Math.max(-128, Math.min(127, Math.round(mn * 128)));
        p[i * 2 + 1] = Math.max(-128, Math.min(127, Math.round(mx * 128)));
      }
      setFina({ hz, dura: dur, p });
    });
    return () => {
      vigente = false;
    };
  }, [fina, picos, pendiente, pps, src]);
  const [imgEspectro, setImgEspectro] = useState<{ cv: HTMLCanvasElement; desde: number; pps: number; alto: number } | null>(null);
  // Arrastrar lo elegido: dónde caería (la raya punteada) y si es copia (con Opción/Alt).
  const [destino, setDestino] = useState<{ t: number; copia: boolean } | null>(null);
  const [cursor, setCursor] = useState(0);
  // PLAY EN BUCLE (2026-09-30, JP: «se necesita el play que loopea en vez del repetir»): repite lo
  // elegido, o el audio entero si no hay nada elegido. El play de siempre suena una vez.
  const [enBucle, setEnBucle] = useState(false);
  // LO QUE SE VE MIENTRAS SE GIRA LA PERILLA O SE TIRA DE UN FUNDIDO (antes de aplicarlo): la onda de
  // lo elegido ya con esa ganancia, o con la rampa del fundido.
  const [previa, setPrevia] = useState<null | { g: number } | { fundido: 'entra' | 'sale'; d: number }>(null);
  const [titila, setTitila] = useState(true);

  useLayoutEffect(() => {
    const m = marcoRef.current;
    if (!m) return undefined;
    const medir = () => setAncho(m.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(m);
    return () => ro.disconnect();
  }, []);

  // El cursor titila como el de un texto: marca dónde entra lo que se pegue o grabe.
  useEffect(() => {
    if (sel || sonando) {
      setTitila(true);
      return undefined;
    }
    const id = window.setInterval(() => setTitila((v) => !v), 530);
    return () => window.clearInterval(id);
  }, [sel, sonando]);

  // ---- el dibujo ----
  const dibujar = useCallback(() => {
    const cv = lienzoRef.current;
    if (!cv || ancho <= 0) return;
    const alto = altoOnda + altoRegla;
    if (cv.width !== ancho) cv.width = ancho;
    if (cv.height !== alto) cv.height = alto;
    const g = cv.getContext('2d');
    if (!g) return;
    const cs = getComputedStyle(cv);
    const tinta = cs.getPropertyValue('--ps-tinta').trim() || cs.color || '#000';
    const papel = cs.getPropertyValue('--ps-papel').trim() || '#fff';
    // Lo demás, si el tema lo pide (Cool Edit: la elección clara, la regla gris, el cabezal
    // amarillo); si no, lo de SoundEdit: todo invertido con la tinta.
    const v = (n: string, porDefecto: string) => cs.getPropertyValue(n).trim() || porDefecto;
    const selFondo = v('--ps-sel-fondo', tinta);
    const selTinta = v('--ps-sel-tinta', papel);
    const cero = v('--ps-cero', tinta);
    const reglaFondo = v('--ps-regla-fondo', papel);
    const reglaTinta = v('--ps-regla-tinta', tinta);
    const cabezal = v('--ps-cabezal', '');
    const cabezalRampa = cabezal || '#ffd000';
    // Cuánto se multiplica la onda en `t` por lo que se está previsualizando (1 = nada).
    const factorPrevia = (t: number): number => {
      if (!previa || !sel || t < sel.a || t > sel.b) return 1;
      if ('g' in previa) return Math.pow(10, previa.g / 20);
      if (previa.d <= 0) return 1;
      if (previa.fundido === 'entra') return t < sel.a + previa.d ? (t - sel.a) / previa.d : 1;
      return t > sel.b - previa.d ? (sel.b - t) / previa.d : 1;
    };
    const aT = (x: number) => (desde + x) / pps;
    const aX = (t: number) => Math.round(t * pps - desde);
    g.fillStyle = papel;
    g.fillRect(0, 0, ancho, alto);
    const medio = Math.floor(altoOnda / 2);

    // Lo elegido: el fondo en tinta (después la onda se dibuja en papel encima).
    let sx0 = -1;
    let sx1 = -1;
    if (sel) {
      sx0 = Math.max(0, aX(sel.a));
      sx1 = Math.min(ancho, aX(sel.b));
      if (sx1 > sx0) {
        g.fillStyle = selFondo;
        g.fillRect(sx0, 0, sx1 - sx0, altoOnda);
      }
    }

    // La línea del cero, punteada.
    for (let x = 0; x < ancho; x += 2) {
      g.fillStyle = x >= sx0 && x < sx1 ? selTinta : cero;
      g.fillRect(x, medio, 1, 1);
    }

    // El espectro (si está puesto y ya se calculó para esta vista; si no, la onda mientras tanto).
    const conEspectro = espectro && !!imgEspectro && imgEspectro.alto === altoOnda && Math.abs(imgEspectro.pps - pps) < 1e-6;
    if (conEspectro && imgEspectro) {
      g.drawImage(imgEspectro.cv, Math.round(imgEspectro.desde - desde), 0);
      if (sx1 > sx0) {
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.fillRect(sx0, 0, sx1 - sx0, altoOnda);
      }
      // Las notas: una raya en cada Do, y el nombre de cada nota si cabe (si no, de los Do).
      const filaNota = altoOnda / (NOTA_ALTA - NOTA_BAJA);
      g.font = '9px sans-serif';
      g.textBaseline = 'middle';
      for (let m = NOTA_BAJA; m <= NOTA_ALTA; m += 1) {
        const y = Math.round(((NOTA_ALTA - m) / (NOTA_ALTA - NOTA_BAJA)) * (altoOnda - 1));
        const esDo = m % 12 === 0;
        if (esDo) {
          g.fillStyle = 'rgba(255,255,255,0.25)';
          g.fillRect(0, y, ancho, 1);
        }
        if (esDo || (filaNota >= 9 && ![1, 3, 6, 8, 10].includes(m % 12)) || filaNota >= 13) {
          g.fillStyle = 'rgba(0,0,0,0.55)';
          g.fillRect(0, y - 5, 30, 10);
          g.fillStyle = esDo ? '#ffe680' : '#ddd';
          g.fillText(nombreNota(m), 2, y);
        }
      }
      g.textBaseline = 'top';
    }
    // La onda: por cada columna, el mínimo y el máximo de lo que cae en ella.
    if (!conEspectro && vista && vista.p.length >= 2) {
      const n = vista.p.length / 2;
      const escala = (altoOnda / 2 - 2) / 128;
      for (let x = 0; x < ancho; x += 1) {
        const t0 = aT(x);
        if (t0 > dura) break;
        let i0 = Math.floor(t0 * vista.hz);
        let i1 = Math.floor(aT(x + 1) * vista.hz);
        if (i1 <= i0) i1 = i0 + 1;
        if (i0 >= n) break;
        i0 = Math.max(0, i0);
        i1 = Math.min(n, i1);
        let mn = 127;
        let mx = -128;
        for (let i = i0; i < i1; i += 1) {
          const a = vista.p[i * 2];
          const b = vista.p[i * 2 + 1];
          if (a < mn) mn = a;
          if (b > mx) mx = b;
        }
        const k = factorPrevia(aT(x + 0.5));
        if (k !== 1) {
          mx = Math.max(-128, Math.min(127, mx * k));
          mn = Math.max(-128, Math.min(127, mn * k));
        }
        const y0 = medio - Math.round(mx * escala);
        const y1 = medio - Math.round(mn * escala);
        g.fillStyle = x >= sx0 && x < sx1 ? selTinta : tinta;
        g.fillRect(x, y0, 1, Math.max(1, y1 - y0 + 1));
      }
    }

    // La rampa del fundido que se está tirando.
    if (sel && previa && 'fundido' in previa && previa.d > 0) {
      const xa = previa.fundido === 'entra' ? aX(sel.a) : aX(sel.b - previa.d);
      const xb = previa.fundido === 'entra' ? aX(sel.a + previa.d) : aX(sel.b);
      g.strokeStyle = cabezalRampa;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(xa + 0.5, previa.fundido === 'entra' ? altoOnda - 1 : 1);
      g.lineTo(xb + 0.5, previa.fundido === 'entra' ? 1 : altoOnda - 1);
      g.stroke();
    }

    // El final del audio: más allá, gris de trama (no hay nada).
    const xFin = aX(dura);
    if (dura > 0 && xFin < ancho) {
      for (let y = 0; y < altoOnda; y += 1)
        for (let x = Math.max(0, xFin + 1) + (y % 2); x < ancho; x += 2) {
          g.fillStyle = tinta;
          g.fillRect(x, y, 1, 1);
        }
    }

    // La regla.
    g.fillStyle = reglaFondo;
    g.fillRect(0, altoOnda, ancho, altoRegla);
    g.fillStyle = reglaTinta;
    g.fillRect(0, altoOnda, ancho, 1);
    const paso = pasoDeRegla(pps);
    const chico = paso / 5;
    g.font = `9px ${cs.getPropertyValue('--ps-letra-regla').trim() || cs.fontFamily || 'sans-serif'}`;
    g.textBaseline = 'top';
    // En compases (2026-09-30): el número de cada compás y rayitas en los tiempos.
    if (verCompases) {
      for (const r of rayasCompas(aT(0), Math.min(dura, aT(ancho)), tempoV, pps)) {
        const x = aX(r.t);
        if (x < 0 || x >= ancho) continue;
        g.fillRect(x, altoOnda + 1, 1, r.grande ? 6 : 3);
        if (r.rotulo) g.fillText(r.rotulo, x + 2, altoOnda + 6);
      }
    }
    const tIni = Math.floor(aT(0) / chico) * chico;
    const filaM = altoOnda + (verCompases ? ALTO_REGLA : 0);
    if (verCompases && verMinutos) g.fillRect(0, filaM, ancho, 1);
    for (let t = tIni; verMinutos && t <= Math.min(dura, aT(ancho)) + 1e-6; t += chico) {
      const x = aX(t);
      if (x < 0 || x >= ancho) continue;
      const grande = Math.abs(t / paso - Math.round(t / paso)) < 1e-6;
      g.fillRect(x, filaM + 1, 1, grande ? 6 : 3);
      if (grande) g.fillText(rotuloRegla(Math.round(t / chico) * chico, paso), x + 2, filaM + 6);
    }

    // El cabezal (mientras suena o donde quedó) y el cursor que titila.
    const xCab = aX(actual);
    if (xCab >= 0 && xCab < ancho && (sonando || actual > 0)) {
      if (cabezal) {
        g.fillStyle = cabezal;
        g.fillRect(xCab, 0, 1, altoOnda);
      } else {
        g.globalCompositeOperation = 'difference';
        g.fillStyle = '#fff';
        g.fillRect(xCab, 0, 1, altoOnda);
        g.globalCompositeOperation = 'source-over';
      }
    }
    if (destino) {
      const xd = aX(destino.t);
      if (xd >= 0 && xd < ancho) {
        g.globalCompositeOperation = 'difference';
        g.fillStyle = '#fff';
        for (let y = 0; y < altoOnda; y += 4) g.fillRect(xd, y, 1, 2);
        if (destino.copia) g.fillRect(xd + 2, 2, 5, 1), g.fillRect(xd + 4, 0, 1, 5);
        g.globalCompositeOperation = 'source-over';
      }
    }
    if (!sel && titila) {
      const xc = aX(cursor);
      if (xc >= 0 && xc < ancho) {
        g.globalCompositeOperation = 'difference';
        g.fillStyle = '#fff';
        g.fillRect(xc, 0, 1, altoOnda);
        g.globalCompositeOperation = 'source-over';
      }
    }
  }, [ancho, desde, pps, vista, dura, sel, actual, sonando, cursor, titila, altoOnda, destino, previa, verCompases, verMinutos, altoRegla, tempoV, espectro, imgEspectro]);
  useEffect(dibujar, [dibujar]);
  useEffect(() => {
    if (!espectro || ancho <= 0 || dura <= 0) return undefined;
    let vivo = true;
    const t = window.setTimeout(() => {
      void decodificado().then(async (buf) => {
        if (!buf || !vivo) return;
        const cv = await pintarEspectro(buf, desde, pps, ancho, altoOnda, () => vivo);
        if (cv && vivo) setImgEspectro({ cv, desde, pps, alto: altoOnda });
      });
    }, 150);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [espectro, src, desde, pps, ancho, altoOnda, dura]);

  // ---- LA VISTA GENERAL (Cool Edit): todo el sonido en una franja, con lo que se ve marcado ----
  const generalRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = generalRef.current;
    if (!cv || cara !== 'cooledit') return;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (w <= 0 || h <= 0) return;
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    const g = cv.getContext('2d');
    if (!g) return;
    const cs = getComputedStyle(cv);
    const tinta = cs.getPropertyValue('--ps-tinta').trim() || '#000';
    const papel = cs.getPropertyValue('--ps-papel').trim() || '#fff';
    const marco = cs.getPropertyValue('--ps-general-vista').trim() || '#fff';
    g.fillStyle = papel;
    g.fillRect(0, 0, w, h);
    const medio = h / 2;
    if (vista && dura > 0) {
      const n = vista.p.length / 2;
      g.fillStyle = tinta;
      for (let x = 0; x < w; x += 1) {
        const i0 = Math.floor(((x / w) * dura) * vista.hz);
        const i1 = Math.max(i0 + 1, Math.floor((((x + 1) / w) * dura) * vista.hz));
        let mn = 127;
        let mx = -128;
        for (let i = Math.max(0, i0); i < Math.min(n, i1); i += 1) {
          if (vista.p[i * 2] < mn) mn = vista.p[i * 2];
          if (vista.p[i * 2 + 1] > mx) mx = vista.p[i * 2 + 1];
        }
        if (mx < mn) continue;
        const y0 = Math.round(medio - (mx / 128) * (medio - 1));
        const y1 = Math.round(medio - (mn / 128) * (medio - 1));
        g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
      }
      // Lo que se ve, con un marco; lo elegido, con una raya abajo.
      const x0 = Math.floor(((desde / pps) / dura) * w);
      const x1 = Math.ceil((((desde + ancho) / pps) / dura) * w);
      g.strokeStyle = marco;
      g.lineWidth = 1;
      g.strokeRect(x0 + 0.5, 0.5, Math.max(2, Math.min(w, x1) - x0 - 1), h - 1);
      if (sel) {
        g.fillStyle = marco;
        g.fillRect(Math.floor((sel.a / dura) * w), h - 3, Math.max(1, Math.round(((sel.b - sel.a) / dura) * w)), 2);
      }
      // El cabezal.
      g.fillStyle = cs.getPropertyValue('--ps-cabezal').trim() || tinta;
      g.fillRect(Math.floor((actual / dura) * w), 0, 1, h);
    }
  }, [cara, vista, dura, desde, pps, ancho, sel, actual]);
  // Tocar o arrastrar en la vista general: lo que se ve se centra ahí.
  const arrastreGeneral = useRef(false);
  const irEnGeneral = (clientX: number) => {
    const cv = generalRef.current;
    const m = marcoRef.current;
    if (!cv || !m || dura <= 0) return;
    const r = cv.getBoundingClientRect();
    const t = Math.min(dura, Math.max(0, ((clientX - r.left) / r.width) * dura));
    m.scrollLeft = Math.max(0, t * pps - m.clientWidth / 2);
    setDesde(m.scrollLeft);
  };
  const alBajarGeneral = (e: PointerEvent | ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    arrastreGeneral.current = true;
    irEnGeneral(e.clientX);
  };
  const alMoverGeneral = (e: ReactPointerEvent<HTMLElement>) => {
    if (arrastreGeneral.current) irEnGeneral(e.clientX);
  };

  // ---- seguir al cabezal: si se va de lo que se ve, se da vuelta la página ----
  useEffect(() => {
    const m = marcoRef.current;
    if (!m || !sonando || zoom === null) return;
    const x = actual * pps;
    if (x < m.scrollLeft || x > m.scrollLeft + m.clientWidth - 4) m.scrollLeft = Math.max(0, x - 8);
  }, [actual, sonando, pps, zoom]);

  // ---- tocar la onda ----
  const tDe = (clientX: number): number => {
    const m = marcoRef.current;
    if (!m) return 0;
    const r = m.getBoundingClientRect();
    return Math.min(dura, Math.max(0, (clientX - r.left + m.scrollLeft) / pps));
  };
  const arrastre = useRef<{ t0: number; x0: number; movio: boolean; lleva?: Seleccion } | null>(null);
  // LA HERRAMIENTA (2026-09-30, JP: «el edit pro debería tener puntero, zoom, herramientas propias de
  // la app», como el Director Cut): el puntero elige (lo de siempre), la mano corre la onda y la lupa
  // acerca (con Alt, aleja) donde se toca.
  const [herramienta, setHerramienta] = useState<'seleccion' | 'mano' | 'lupa'>('seleccion');
  const mano = useRef<{ x0: number; s0: number } | null>(null);

  // Si `t` cae en una orilla de lo elegido (a unos px), la OTRA orilla; si no, null.
  const orillaFija = (t: number): number | null => {
    if (!sel || herramienta !== 'seleccion') return null;
    const tol = 5 / pps;
    if (Math.abs(t - sel.a) <= tol) return sel.b;
    if (Math.abs(t - sel.b) <= tol) return sel.a;
    return null;
  };
  const alBajar = (e: PointerEvent | ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || dura <= 0) return;
    e.stopPropagation();
    ventanaRef.current?.focus({ preventScroll: true });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const t = tDe(e.clientX);
    if (herramienta === 'mano') {
      mano.current = { x0: e.clientX, s0: marcoRef.current?.scrollLeft || 0 };
      return;
    }
    if (herramienta === 'lupa') {
      cambiarZoom(e.altKey ? 0.5 : 2, t);
      return;
    }
    // Con mayúsculas se estira lo elegido hasta aquí (desde el cursor o desde lo elegido).
    if (e.shiftKey) {
      const ancla = sel ? (Math.abs(t - sel.a) < Math.abs(t - sel.b) ? sel.b : sel.a) : cursor;
      arrastre.current = { t0: ancla, x0: e.clientX, movio: true };
      setSel({ a: Math.min(ancla, t), b: Math.max(ancla, t) });
      return;
    }
    // LAS ORILLAS DE LO ELEGIDO (2026-09-30, JP): tomar una la corre; la otra queda fija.
    const fija = orillaFija(t);
    if (fija !== null) {
      arrastre.current = { t0: fija, x0: e.clientX, movio: true };
      return;
    }
    // Dentro de lo elegido se agarra y se lleva (como un texto): no se elige de nuevo.
    if (sel && puedeEditar && t > sel.a && t < sel.b) {
      arrastre.current = { t0: t, x0: e.clientX, movio: false, lleva: sel };
      return;
    }
    arrastre.current = { t0: t, x0: e.clientX, movio: false };
    setSel(null);
    setCursor(t);
  };
  const alMover = (e: ReactPointerEvent<HTMLElement>) => {
    if (mano.current) {
      const m = marcoRef.current;
      if (m) {
        m.scrollLeft = Math.max(0, mano.current.s0 - (e.clientX - mano.current.x0));
        setDesde(m.scrollLeft);
      }
      return;
    }
    const a = arrastre.current;
    if (!a) {
      // Sin arrastrar: en una orilla de lo elegido, la flecha de agrandar.
      if (herramienta === 'seleccion') e.currentTarget.style.cursor = orillaFija(tDe(e.clientX)) !== null ? 'ew-resize' : '';
      // En el espectro, la nota que queda bajo el mouse.
      if (espectro) {
        const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
        const m = Math.round(NOTA_ALTA - (y / Math.max(1, altoOnda - 1)) * (NOTA_ALTA - NOTA_BAJA));
        e.currentTarget.title = y < altoOnda ? `${nombreNota(m)} · ${Math.round(frecuenciaNota(m))} Hz` : '';
      }
      return;
    }
    if (!a.movio && Math.abs(e.clientX - a.x0) < 3) return;
    a.movio = true;
    const t = tDe(e.clientX);
    if (a.lleva) {
      const dentro = t > a.lleva.a && t < a.lleva.b;
      setDestino(dentro ? null : { t, copia: e.altKey });
      return;
    }
    setSel(Math.abs(t - a.t0) * pps < 1 ? null : { a: Math.min(a.t0, t), b: Math.max(a.t0, t) });
  };
  const alSoltar = (e: ReactPointerEvent<HTMLElement>) => {
    mano.current = null;
    const a = arrastre.current;
    arrastre.current = null;
    if (!a) return;
    if (a.lleva) {
      const d = destino;
      setDestino(null);
      if (!a.movio) {
        // Un clic dentro de lo elegido: el cursor ahí, como siempre.
        setSel(null);
        setCursor(a.t0);
        irA(a.t0, sonando);
        return;
      }
      if (!d || e.type === 'pointercancel') return;
      llevar(a.lleva, d.t, e.altKey || d.copia);
      return;
    }
    // Un clic deja el cursor y lleva ahí lo que suena (sonando sigue sonando); elegir un
    // tramo lleva el cabezal a su comienzo.
    if (!a.movio) irA(a.t0, sonando);
    else if (sel) irA(sel.a, false);
  };

  // ---- escuchar lo elegido (y repetirlo) ----
  const escuchar = () => {
    setEnBucle(false);
    if (sonando) {
      onPlay(); // pausa
      return;
    }
    if (sel) irA(sel.a, true);
    else if (Math.abs(actual - cursor) > 0.05 && actual >= dura - 0.05) irA(cursor, true);
    else onPlay();
  };
  const escucharEnBucle = () => {
    if (sonando && enBucle) {
      setEnBucle(false);
      onPlay(); // pausa
      return;
    }
    setEnBucle(true);
    if (sonando) return; // ya suena: desde ahora, en bucle
    if (sel) irA(sel.a, true);
    else irA(cursor >= dura - 0.05 ? 0 : cursor, true);
  };
  useEffect(() => {
    if (!sonando || (!sel && !enBucle)) return undefined;
    let id = 0;
    const mirar = () => {
      const el = elemento();
      if (el && sel && el.currentTime >= sel.b) {
        if (enBucle) irA(sel.a, true);
        else {
          el.pause();
          irA(sel.a, false);
        }
      } else if (el && !sel && enBucle && dura > 0.2 && el.currentTime >= dura - 0.06) irA(0, true);
      id = requestAnimationFrame(mirar);
    };
    id = requestAnimationFrame(mirar);
    return () => cancelAnimationFrame(id);
  }, [sonando, sel, enBucle, dura]);

  // ---- el zoom: por potencias de dos, centrado en lo elegido o en el cursor ----
  const cambiarZoom = (factor: number | null, donde?: number) => {
    const m = marcoRef.current;
    const centro = donde ?? (sel ? (sel.a + sel.b) / 2 : sonando ? actual : cursor);
    const nuevo = factor === null ? null : Math.min(ZOOM_MAX, Math.max(ppsAjuste, pps * factor));
    setZoom(nuevo !== null && nuevo <= ppsAjuste * 1.001 ? null : nuevo);
    requestAnimationFrame(() => {
      if (!m) return;
      const p = nuevo ?? ppsAjuste;
      m.scrollLeft = Math.max(0, centro * p - m.clientWidth / 2);
      setDesde(m.scrollLeft);
    });
  };
  // Mostrar lo elegido entero (el «Show Selection» de SoundEdit).
  const verSeleccion = () => {
    if (!sel || !marcoRef.current) return;
    const m = marcoRef.current;
    const nuevo = Math.min(ZOOM_MAX, Math.max(ppsAjuste, (m.clientWidth - 16) / Math.max(0.01, sel.b - sel.a)));
    setZoom(nuevo);
    requestAnimationFrame(() => {
      m.scrollLeft = Math.max(0, sel.a * nuevo - 8);
      setDesde(m.scrollLeft);
    });
  };

  const elegirTodo = () => dura > 0 && setSel({ a: 0, b: dura });

  // ---- editar ----
  const procesando = editar?.estado === 'procesando' || !!pendiente;
  const puedeEditar = !!editar && !procesando && !ed.silencios && dura > 0;
  // Lo que suena, como montaje. El recorte que haya (de la barra de herramientas) se vuelve
  // parte del montaje, así lo que se edita es exactamente lo que se oye.
  const montajeActual = (): Tramo[] => {
    const d0 = Number(ed.recorte?.desde) || 0;
    const h0 = Number(ed.recorte?.hasta) || 0;
    if (ed.montaje && ed.montaje.length > 0) return tomar(ed.montaje, d0, h0 > 0 ? h0 : largoTotal(ed.montaje));
    return [{ f: ed.orig || src, a: d0, b: h0 > 0 ? h0 : d0 + dura * vel }];
  };
  // De lo que se oye al montaje: lo acelerado se desacelera.
  const aM = (t: number) => t * vel;
  const aplicarMontaje = (m: Tramo[]) => {
    if (!editar) return;
    guardarAntes(editar.idea, ed, sel);
    const nuevo: EdicionesAudio = { ...ed, montaje: m };
    delete nuevo.recorte;
    setPendiente(m);
    editar.aplicar(nuevo);
  };
  // Llevar lo elegido a `t` (o una copia): se saca y se inserta donde cayó.
  const llevar = (s: Seleccion, t: number, copia: boolean) => {
    if (!puedeEditar || !editar) return;
    const m = montajeActual();
    const tramos = tomar(m, aM(s.a), aM(s.b));
    const largo = s.b - s.a;
    let t2 = t;
    let base = m;
    if (!copia) {
      base = quitar(m, aM(s.a), aM(s.b));
      if (t > s.b) t2 = t - largo;
    }
    aplicarMontaje(insertar(base, aM(t2), tramos));
    setSel({ a: t2, b: t2 + largo });
    setCursor(t2);
  };
  const cortar = () => {
    if (!sel || !puedeEditar || !editar) return;
    const m = montajeActual();
    portapapeles = { idea: editar.idea, tramos: tomar(m, aM(sel.a), aM(sel.b)) };
    aplicarMontaje(quitar(m, aM(sel.a), aM(sel.b)));
    setCursor(sel.a);
    setSel(null);
  };
  const copiar = () => {
    if (!sel || !editar || ed.silencios || dura <= 0) return;
    portapapeles = { idea: editar.idea, tramos: tomar(montajeActual(), aM(sel.a), aM(sel.b)) };
  };
  const sePuedePegar = puedeEditar && !!portapapeles && portapapeles.idea === editar?.idea;
  const pegar = () => {
    if (!sePuedePegar || !portapapeles) return;
    const m = montajeActual();
    const a0 = sel ? sel.a : cursor;
    const nuevo = sel ? reemplazar(m, aM(sel.a), aM(sel.b), portapapeles.tramos) : insertar(m, aM(cursor), portapapeles.tramos);
    aplicarMontaje(nuevo);
    setSel({ a: a0, b: a0 + largoTotal(portapapeles.tramos) / vel });
  };
  const borrar = () => {
    if (!sel || !puedeEditar) return;
    aplicarMontaje(quitar(montajeActual(), aM(sel.a), aM(sel.b)));
    setCursor(sel.a);
    setSel(null);
  };
  const silenciar = () => {
    if (!sel || !puedeEditar) return;
    aplicarMontaje(reemplazar(montajeActual(), aM(sel.a), aM(sel.b), [{ s: aM(sel.b) - aM(sel.a) }]));
  };
  const invertir = () => {
    if (!sel || !puedeEditar) return;
    const m = montajeActual();
    aplicarMontaje(reemplazar(m, aM(sel.a), aM(sel.b), darVuelta(tomar(m, aM(sel.a), aM(sel.b)))));
  };
  const recortar = () => {
    if (!sel || !puedeEditar) return;
    aplicarMontaje(tomar(montajeActual(), aM(sel.a), aM(sel.b)));
    setSel(null);
    setCursor(0);
  };
  // Los interruptores de siempre (los de la barra de herramientas del audio), desde el menú.
  const aplicarEd = (nuevo: EdicionesAudio) => {
    if (!editar || procesando) return;
    guardarAntes(editar.idea, ed, sel);
    editar.aplicar(nuevo);
  };
  const alternar = (clave: 'ruido' | 'silencios' | 'nivel') => {
    const nuevo: EdicionesAudio = { ...ed };
    if (nuevo[clave]) delete nuevo[clave];
    else nuevo[clave] = true;
    aplicarEd(nuevo);
  };
  const ponerVelocidad = (v: number) => {
    const nuevo: EdicionesAudio = { ...ed };
    if (v === 1) delete nuevo.velocidad;
    else nuevo.velocidad = v;
    aplicarEd(nuevo);
    setSel(null);
  };
  const hayCambios = Object.keys(ed).some((k) => k !== 'orig');
  const hayAntes = !!editar && (antes.get(editar.idea)?.length || 0) > 0;
  const hayDespues = !!editar && (despues.get(editar.idea)?.length || 0) > 0;

  // ---- los efectos sobre lo elegido (Cool Edit: fundidos, amplificar, normalizar, eco) ----
  const conSel = (f: (m: Tramo[], x: number, y: number) => Tramo[]) => {
    if (!sel || !puedeEditar) return;
    aplicarMontaje(f(montajeActual(), aM(sel.a), aM(sel.b)));
  };
  const fundirEntrada = () => conSel((m, x, y) => fundido(m, x, y, true));
  const fundirSalida = () => conSel((m, x, y) => fundido(m, x, y, false));
  // NORMALIZAR: lo más fuerte de lo elegido llega a -0,5 dB. Se mide en la onda que se ve.
  const picoElegido = (): number => {
    if (!sel || !vista) return 0;
    const n = vista.p.length / 2;
    const i0 = Math.max(0, Math.floor(sel.a * vista.hz));
    const i1 = Math.min(n, Math.ceil(sel.b * vista.hz));
    let pico = 0;
    for (let i = i0; i < i1; i += 1) pico = Math.max(pico, Math.abs(vista.p[i * 2]), Math.abs(vista.p[i * 2 + 1]));
    return pico / 128;
  };
  const normalizar = () => {
    const pico = picoElegido();
    if (pico <= 0.001) return;
    const dB = 20 * Math.log10(0.944 / pico);
    if (Math.abs(dB) < 0.05) return;
    conSel((m, x, y) => amplificar(m, x, y, dB));
  };
  // LA PERILLA FLOTANTE Y LOS TIRADORES DEL FUNDIDO (2026-09-30, JP: «al seleccionar una perilla de
  // volumen que amplifique, unas orillas que hagan fundido»), como el HUD de Audition: arriba de lo
  // elegido. La perilla sube o baja (−24…+12 dB; con Shift, más fino) y al soltar amplifica; los
  // cuadraditos de las esquinas de arriba se tiran hacia adentro y dejan un fundido de entrada o de
  // salida del largo que se tiró. Mientras tanto la onda muestra cómo queda (`previa`). El bajar es
  // nativo (la ventana corta la propagación antes de que llegue a React).
  const gestoHud = useRef<null | { tipo: 'g'; y0: number; g: number } | { tipo: 'entra' | 'sale'; d: number }>(null);
  const bajarHud = (tipo: 'g' | 'entra' | 'sale') => (el: HTMLElement | null) => {
    if (!el) return;
    el.onpointerdown = (e: PointerEvent) => {
      if (e.button !== 0 || !sel || !puedeEditar) return;
      e.stopPropagation();
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      gestoHud.current = tipo === 'g' ? { tipo, y0: e.clientY, g: 0 } : { tipo, d: 0 };
      setPrevia(tipo === 'g' ? { g: 0 } : { fundido: tipo, d: 0 });
    };
  };
  const moverHud = (e: ReactPointerEvent<HTMLElement>) => {
    const h = gestoHud.current;
    if (!h || !sel) return;
    if (h.tipo === 'g') {
      const g = Math.max(-24, Math.min(12, Math.round((h.y0 - e.clientY) * (e.shiftKey ? 0.25 : 1)) / 10));
      h.g = g;
      setPrevia({ g });
      return;
    }
    const t = tDe(e.clientX);
    const d = Math.max(0, Math.min(sel.b - sel.a, h.tipo === 'entra' ? t - sel.a : sel.b - t));
    h.d = d;
    setPrevia({ fundido: h.tipo, d });
  };
  const soltarHud = () => {
    const h = gestoHud.current;
    gestoHud.current = null;
    setPrevia(null);
    if (!h || !sel || !puedeEditar) return;
    if (h.tipo === 'g') {
      if (Math.abs(h.g) >= 0.1) conSel((m, x, y) => amplificar(m, x, y, h.g));
      return;
    }
    if (h.d * pps < 2) return;
    const x = h.tipo === 'entra' ? sel.a : sel.b - h.d;
    const y = h.tipo === 'entra' ? sel.a + h.d : sel.b;
    aplicarMontaje(fundido(montajeActual(), aM(x), aM(y), h.tipo === 'entra'));
  };

  // Los que piden un número abren su cuadrito, como los de Cool Edit.
  const [dialogo, setDialogo] = useState<
    null | { tipo: 'amplificar'; db: string } | { tipo: 'eco'; ms: string; vuelve: string } | { tipo: 'marca'; t: number; texto: string }
  >(null);
  // OÍR EL EFECTO ANTES DE APLICARLO (2026-09-30, JP): lo elegido (o unos segundos desde el cursor)
  // con el efecto del cuadrito, desde el audio decodificado; no cambia nada.
  const previaNodo = useRef<AudioBufferSourceNode | null>(null);
  const [oyendo, setOyendo] = useState(false);
  const pararPrevia = () => {
    try {
      previaNodo.current?.stop();
    } catch {
      /* ya paró */
    }
    previaNodo.current = null;
    setOyendo(false);
  };
  useEffect(() => () => pararPrevia(), []);
  const oirPrevia = async () => {
    const d = dialogo;
    if (!d || d.tipo === 'marca') return;
    pararPrevia();
    if (sonando) onPlay();
    const b = await decodificado();
    if (!b) return;
    const c = ctxComun();
    if (c.state === 'suspended') await c.resume();
    const a = sel ? sel.a : cursor;
    const fin = sel ? sel.b : Math.min(dura, a + 6);
    const fuente = c.createBufferSource();
    fuente.buffer = b;
    const salida = c.createGain();
    salida.connect(c.destination);
    if (d.tipo === 'amplificar') {
      const g = c.createGain();
      g.gain.value = Math.pow(10, (Number(d.db.replace(',', '.')) || 0) / 20);
      fuente.connect(g).connect(salida);
    } else {
      fuente.connect(salida);
      const dl = c.createDelay(3.5);
      dl.delayTime.value = Math.max(0.02, Math.min(3, (Number(d.ms.replace(',', '.')) || 300) / 1000));
      const fb = c.createGain();
      fb.gain.value = Math.max(0, Math.min(0.95, (Number(d.vuelve.replace(',', '.')) || 40) / 100));
      fuente.connect(dl);
      dl.connect(fb).connect(dl);
      dl.connect(salida);
    }
    fuente.onended = () => {
      if (previaNodo.current === fuente) {
        previaNodo.current = null;
        setOyendo(false);
      }
      window.setTimeout(() => salida.disconnect(), 3000);
    };
    fuente.start(0, Math.max(0, a), Math.max(0.05, fin - a));
    previaNodo.current = fuente;
    setOyendo(true);
  };
  const pedirMarca = (t: number) => {
    if (editar?.marcar) setDialogo({ tipo: 'marca', t: Math.max(0, Math.min(dura, t)), texto: '' });
  };
  const aceptarDialogo = () => {
    const d = dialogo;
    setDialogo(null);
    if (!d) return;
    if (d.tipo === 'marca') {
      editar?.marcar?.(d.t, d.texto.trim());
      return;
    }
    if (d.tipo === 'amplificar') {
      const dB = Number(d.db.replace(',', '.'));
      if (isFinite(dB) && Math.abs(dB) >= 0.1 && Math.abs(dB) <= 40) conSel((m, x, y) => amplificar(m, x, y, dB));
    } else {
      const ms = Number(d.ms.replace(',', '.'));
      const vuelve = Number(d.vuelve.replace(',', '.')) / 100;
      if (ms >= 20 && ms <= 3000 && vuelve > 0 && vuelve < 1) conSel((m, x, y) => conEco(m, x, y, ms, vuelve));
    }
  };
  const deshacer = () => {
    if (!editar || procesando) return;
    const paso = antes.get(editar.idea)?.pop();
    if (!paso) return;
    const prev = paso.ed;
    const pila = despues.get(editar.idea) || [];
    pila.push({ ed, sel });
    despues.set(editar.idea, pila);
    setPendiente(prev.montaje && prev.montaje.length > 0 && !prev.recorte ? prev.montaje : null);
    editar.aplicar(prev);
    setSel(paso.sel);
  };
  const rehacer = () => {
    if (!editar || procesando) return;
    const paso = despues.get(editar.idea)?.pop();
    if (!paso) return;
    const sig = paso.ed;
    const pila = antes.get(editar.idea) || [];
    pila.push({ ed, sel });
    antes.set(editar.idea, pila);
    setPendiente(sig.montaje && sig.montaje.length > 0 && !sig.recorte ? sig.montaje : null);
    editar.aplicar(sig);
    setSel(paso.sel);
  };

  // ---- grabar (el MacRecorder): con el micrófono, en el cursor o en lugar de lo elegido ----
  const [grabando, setGrabando] = useState(false);
  const [tGrab, setTGrab] = useState(0);
  const [subiendo, setSubiendo] = useState(false);
  const [avisoLocal, setAvisoLocal] = useState('');
  const grabacion = useRef<{ rec: MediaRecorder; inicio: number } | null>(null);
  useEffect(() => {
    if (!grabando) return undefined;
    const id = window.setInterval(() => {
      if (grabacion.current) setTGrab((performance.now() - grabacion.current.inicio) / 1000);
    }, 100);
    return () => window.clearInterval(id);
  }, [grabando]);
  // Si la ventana se va mientras graba, el micrófono se suelta.
  useEffect(
    () => () => {
      const g = grabacion.current;
      if (g && g.rec.state !== 'inactive') g.rec.stop();
    },
    [],
  );
  const grabar = async () => {
    if (grabando) {
      grabacion.current?.rec.stop();
      return;
    }
    if (!puedeEditar || !editar || !editar.grabar || subiendo) return;
    const guardarGrabacion = editar.grabar;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setAvisoLocal(tr('sinMicrofono', 'No se pudo usar el micrófono'));
      return;
    }
    if (sonando) onPlay();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      setAvisoLocal(tr('sinMicrofono', 'No se pudo usar el micrófono'));
      return;
    }
    const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    const mime = candidatos.find((t) => {
      try {
        return MediaRecorder.isTypeSupported(t);
      } catch {
        return false;
      }
    });
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const trozos: Blob[] = [];
    const donde = sel ? { ...sel } : { a: cursor, b: cursor };
    const montaje0 = montajeActual();
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) trozos.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      grabacion.current = null;
      setGrabando(false);
      const tipo = rec.mimeType || mime || 'audio/webm';
      const blob = new Blob(trozos, { type: tipo });
      if (blob.size === 0) return;
      const ext = tipo.includes('webm') ? 'webm' : tipo.includes('ogg') ? 'ogg' : tipo.includes('mp4') ? 'm4a' : 'webm';
      setSubiendo(true);
      void guardarGrabacion(blob, ext).then((r) => {
        setSubiendo(false);
        if ('error' in r || r.duracion <= 0) {
          setAvisoLocal(('error' in r && r.error) || tr('ps_grabacionerror', 'No se pudo guardar la grabación'));
          return;
        }
        const { archivo, duracion } = r;
        const tramo: Tramo[] = [{ f: archivo, a: 0, b: duracion }];
        aplicarMontaje(
          donde.b > donde.a ? reemplazar(montaje0, aM(donde.a), aM(donde.b), tramo) : insertar(montaje0, aM(donde.a), tramo),
        );
        setSel({ a: donde.a, b: donde.a + duracion / vel });
      });
    };
    setAvisoLocal('');
    rec.start(250);
    grabacion.current = { rec, inicio: performance.now() };
    setTGrab(0);
    setGrabando(true);
  };

  const { menusArriba, celda } = usePerillas();
  // A las pistas (2026-09-30): lo escucha la idea (Idea.tsx), que pone el multipista en lugar de la onda.
  const verMultipista = () => {
    if (editar) window.dispatchEvent(new CustomEvent('pz-multipista', { detail: editar.idea }));
  };
  // LOS ICONOS (2026-09-30, JP: «hay que arreglar esos iconos»): en Pizarrita Edit Pro todos del
  // mismo juego, de línea y del color de la letra de la ventana, en todos los sistemas (antes cada
  // tema ponía los suyos a algunos y los otros quedaban con caracteres). Los sistemas de texto
  // (PizarriDOS, AS/400) siguen con sus caracteres.
  const conIconos = cara === 'cooledit' && !celda;
  const ic = (bi: string) => (conIconos ? <i className={`bi ${bi}`} aria-hidden="true"></i> : null);
  const di = (nombre: string) => (conIconos ? undefined : nombre);
  // REEMPLAZAR CON UN ARCHIVO (2026-10-08, JP: «debería abrir un archivo y reemplazarlo»): el mismo
  // camino que «Importar» del menú de la idea: el archivo nuevo pasa a ser el audio y el de ahora
  // queda sellado como versión (con lo editado). El servidor olvida lo editado sobre el viejo.
  const reemplazarConArchivo = () => {
    editar?.reemplazar?.();
  };
  // UN PEDAZO A UNO NUEVO (2026-11-03, JP: «elegir un tramo… y crear con eso un audio o video nuevo,
  // cortando esto y pegándolo en uno nuevo; también de algo ya cortado»): lo elegido (cortado o
  // copiado) o lo del portapapeles pasa a una idea nueva, al lado o como fila de la caja de donde se vino.
  const [enviandoPedazo, setEnviandoPedazo] = useState(false);
  const aUnoNuevo = (que: 'cortar' | 'copiar' | 'pegar') => {
    if (!editar?.aNuevo || enviandoPedazo) return;
    const m = montajeActual();
    const s = sel;
    let tramos: Tramo[];
    let origen = editar.idea;
    if (que === 'pegar') {
      if (!portapapeles) return;
      tramos = portapapeles.tramos;
      origen = portapapeles.idea;
    } else {
      if (!s) return;
      tramos = tomar(m, aM(s.a), aM(s.b));
    }
    if (largoTotal(tramos) <= 0.01) return;
    setEnviandoPedazo(true);
    setAvisoLocal('');
    void editar.aNuevo(tramos, origen).then((error) => {
      setEnviandoPedazo(false);
      if (error !== null) {
        setAvisoLocal(error || tr('ps_pedazo_error', 'No se pudo crear el pedazo'));
        return;
      }
      if (que === 'cortar' && s) {
        aplicarMontaje(quitar(m, aM(s.a), aM(s.b)));
        setCursor(s.a);
        setSel(null);
      }
    });
  };
  const nuevoQue = editar?.nuevoEsVideo ? tr('ps_video_nuevo', 'un video nuevo') : tr('ps_audio_nuevo', 'un audio nuevo');
  const nuevoDonde = editar?.nuevoEnCaja ? ` (${tr('ps_fila_nueva', 'fila nueva de la caja')})` : '';
  const itemsPedazo = editar?.aNuevo
    ? [
        { separador: true },
        { texto: `${tr('ps_cortar_a', 'Cortar a')} ${nuevoQue}${nuevoDonde}`, accion: () => aUnoNuevo('cortar'), deshabilitado: !sel || !puedeEditar || enviandoPedazo },
        { texto: `${tr('ps_copiar_a', 'Copiar a')} ${nuevoQue}${nuevoDonde}`, accion: () => aUnoNuevo('copiar'), deshabilitado: !sel || dura <= 0 || !!ed.silencios || enviandoPedazo },
        { texto: `${tr('ps_pegar_en_nuevo', 'Pegar en uno nuevo')}${nuevoDonde}`, accion: () => aUnoNuevo('pegar'), deshabilitado: !portapapeles || enviandoPedazo },
      ]
    : [];
  const itemsArchivo = [
    ...(editar?.exportar
      ? [
          { texto: tr('ps_bajar_mp3', 'Bajar en mp3'), accion: () => editar.exportar?.('mp3'), deshabilitado: grabando || subiendo || procesando },
          { texto: tr('ps_bajar_wav', 'Bajar en WAV'), accion: () => editar.exportar?.('wav'), deshabilitado: grabando || subiendo || procesando },
        ]
      : []),
    ...(editar?.exportar && (editar?.reemplazar || alTerminar) ? [{ separador: true }] : []),
    ...(editar?.reemplazar
      ? [{ texto: tr('ps_reemplazar', 'Reemplazar con un archivo…'), accion: reemplazarConArchivo, deshabilitado: grabando || subiendo || procesando }]
      : []),
    ...(editar?.reemplazar && alTerminar ? [{ separador: true }] : []),
    ...(alTerminar ? [{ texto: tr('ps_terminar', 'Terminar de editar'), accion: alTerminar, deshabilitado: grabando || subiendo }] : []),
  ];
  const listaMenus: Menu[] = [
    ...(itemsArchivo.length ? [{ nombre: tr('ps_m_archivo', 'Archivo'), items: itemsArchivo }] : []),
    {
      nombre: tr('ps_m_edicion', 'Edición'),
      items: [
        { texto: tr('deshacer', 'Deshacer'), atajo: 'Mod+Z', accion: deshacer, deshabilitado: !hayAntes || procesando },
        { texto: tr('rehacer', 'Rehacer'), atajo: 'Mayús+Mod+Z', accion: rehacer, deshabilitado: !hayDespues || procesando },
        { separador: true },
        { texto: tr('cortar', 'Cortar'), atajo: 'Mod+X', accion: cortar, deshabilitado: !sel || !puedeEditar },
        { texto: tr('copiar', 'Copiar'), atajo: 'Mod+C', accion: copiar, deshabilitado: !sel || !editar },
        { texto: tr('pegar', 'Pegar'), atajo: 'Mod+V', accion: pegar, deshabilitado: !sePuedePegar },
        { texto: tr('borrar', 'Borrar'), atajo: 'Supr', accion: borrar, deshabilitado: !sel || !puedeEditar },
        ...itemsPedazo,
        { separador: true },
        { texto: tr('elegirTodo', 'Elegir todo'), atajo: 'Mod+A', accion: () => elegirTodo(), deshabilitado: dura <= 0 },
        { texto: tr('ps_recortar', 'Dejar solo lo elegido'), accion: recortar, deshabilitado: !sel || !puedeEditar },
        { separador: true },
        {
          texto: tr('audiooriginal', 'Volver al audio original'),
          accion: () => {
            aplicarEd({});
            setSel(null);
          },
          deshabilitado: !editar || procesando || !hayCambios,
        },
      ],
    },
    {
      nombre: tr('ps_m_efectos', 'Efectos'),
      items: [
        { texto: tr('ps_amplificar', 'Amplificar…'), accion: () => setDialogo({ tipo: 'amplificar', db: '3' }), deshabilitado: !sel || !puedeEditar },
        { texto: tr('ps_normalizar', 'Normalizar'), accion: normalizar, deshabilitado: !sel || !puedeEditar },
        { texto: tr('ps_fundidoentrada', 'Fundido de entrada'), accion: fundirEntrada, deshabilitado: !sel || !puedeEditar },
        { texto: tr('ps_fundidosalida', 'Fundido de salida'), accion: fundirSalida, deshabilitado: !sel || !puedeEditar },
        { texto: tr('ps_eco', 'Eco…'), accion: () => setDialogo({ tipo: 'eco', ms: '300', vuelve: '40' }), deshabilitado: !sel || !puedeEditar },
        { separador: true },
        { texto: tr('ps_silencio', 'Silencio'), accion: silenciar, deshabilitado: !sel || !puedeEditar },
        { texto: tr('ps_invertir', 'Al revés'), accion: invertir, deshabilitado: !sel || !puedeEditar },
        { separador: true },
        { texto: tr('audioruido', 'Limpiar el ruido de fondo'), accion: () => alternar('ruido'), marcado: !!ed.ruido, deshabilitado: !editar || procesando },
        { texto: tr('audionivel', 'Emparejar el volumen'), accion: () => alternar('nivel'), marcado: !!ed.nivel, deshabilitado: !editar || procesando },
        {
          texto: tr('audiosilencios', 'Quitar el silencio del comienzo y del final'),
          accion: () => alternar('silencios'),
          marcado: !!ed.silencios,
          deshabilitado: !editar || procesando,
        },
      ],
    },
    {
      nombre: tr('audiovelocidad', 'Velocidad'),
      items: [0.75, 1, 1.25, 1.5, 2].map((v) => ({
        texto: `${v}×`,
        accion: () => ponerVelocidad(v),
        marcado: vel === v,
        deshabilitado: !editar || procesando,
      })),
    },
    {
      nombre: tr('ps_m_ver', 'Ver'),
      items: [
        { texto: tr('acercar', 'Acercar'), accion: () => cambiarZoom(2), deshabilitado: pps >= ZOOM_MAX },
        { texto: tr('alejar', 'Alejar'), accion: () => cambiarZoom(0.5), deshabilitado: zoom === null },
        { texto: tr('verTodo', 'Ver todo'), accion: () => cambiarZoom(null), deshabilitado: zoom === null },
        { texto: tr('verSeleccion', 'Ver lo elegido'), accion: verSeleccion, deshabilitado: !sel },
        ...(editar && !editar.sinMultipista && conMenus ? [{ separador: true }, { texto: tr('ps_multipista', 'Vista multipista'), accion: verMultipista }] : []),
      ],
    },
  ];
  const lugarMenus = conMenus && menusArriba ? document.getElementById('pz-nav-programa') : null;

  // El teclado, con la ventana enfocada (se enfoca al tocar la onda).
  const ventanaRef = useRef<HTMLDivElement>(null);
  // Los gestos se quedan en la ventana también para los oyentes nativos de afuera (la tarjeta se
  // arrastra con interact.js, que escucha en el DOM): si no, un clic en un menú no llegaba a ser
  // clic, porque la tarjeta se apropiaba del puntero.
  useEffect(() => {
    const v = ventanaRef.current;
    if (!v) return undefined;
    const parar = (e: Event) => e.stopPropagation();
    v.addEventListener('pointerdown', parar);
    v.addEventListener('mousedown', parar);
    v.addEventListener('touchstart', parar);
    return () => {
      v.removeEventListener('pointerdown', parar);
      v.removeEventListener('mousedown', parar);
      v.removeEventListener('touchstart', parar);
    };
  }, []);
  // Por lo mismo, el bajar del puntero en la onda y en la vista general es nativo: la ventana corta
  // la propagación, y React (que escucha arriba, en la raíz) no se enteraba.
  const bajarRef = useRef(alBajar);
  bajarRef.current = alBajar;
  const bajarGeneralRef = useRef(alBajarGeneral);
  bajarGeneralRef.current = alBajarGeneral;
  useEffect(() => {
    const l = lienzoRef.current;
    const g = generalRef.current;
    const enLienzo = (e: PointerEvent) => bajarRef.current(e);
    const enGeneral = (e: PointerEvent) => bajarGeneralRef.current(e);
    l?.addEventListener('pointerdown', enLienzo);
    g?.addEventListener('pointerdown', enGeneral);
    return () => {
      l?.removeEventListener('pointerdown', enLienzo);
      g?.removeEventListener('pointerdown', enGeneral);
    };
  }, [cara]);
  const alTeclear = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const cmd = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    const hacer = (f: () => void) => {
      e.preventDefault();
      e.stopPropagation();
      f();
    };
    if (e.key === 'F8' && editar?.marcar) {
      hacer(() => pedirMarca(sel ? sel.a : sonando ? actual : cursor));
      return;
    }
    // ATAJOS (2026-09-30, JP; como los del multipista): Enter al comienzo; ⌘/Ctrl+Espacio o ⇧R graba;
    // ⌘/Ctrl+⇧L suena en bucle; [ y ] saltan de marca en marca; E, el espectro.
    if (!cmd && e.key === 'Enter') {
      hacer(() => {
        setSel(null);
        setCursor(0);
        irA(0, sonando);
      });
      return;
    }
    if (editar && ((cmd && e.key === ' ') || (!cmd && e.shiftKey && k === 'r'))) {
      hacer(() => void grabar());
      return;
    }
    if (cmd && e.shiftKey && k === 'l') {
      hacer(escucharEnBucle);
      return;
    }
    if (!cmd && (e.key === '[' || e.key === ']') && marcas?.length) {
      const ts = marcas.map((m) => m.t).sort((x, y) => x - y);
      const aqui = sonando ? actual : cursor;
      const t = e.key === ']' ? ts.find((x) => x > aqui + 0.01) : [...ts].reverse().find((x) => x < aqui - 0.01);
      if (t !== undefined)
        hacer(() => {
          setSel(null);
          setCursor(t);
          irA(t, sonando);
        });
      return;
    }
    if (!cmd && !e.shiftKey && k === 'e') {
      hacer(() => cambiarEspectro(!espectro));
      return;
    }
    if (cmd && ((k === 'z' && e.shiftKey) || k === 'y')) hacer(rehacer);
    else if (cmd && k === 'z') hacer(deshacer);
    else if (cmd && k === 'x') hacer(cortar);
    else if (cmd && k === 'c') hacer(copiar);
    else if (cmd && k === 'v') hacer(pegar);
    else if (cmd && k === 'a') hacer(elegirTodo);
    else if (!cmd && (e.key === 'Delete' || e.key === 'Backspace')) hacer(borrar);
    else if (!cmd && e.key === ' ') hacer(escuchar);
    else if (!cmd && !e.altKey && k === 'a') hacer(() => setHerramienta('seleccion'));
    else if (!cmd && !e.altKey && k === 'h') hacer(() => setHerramienta('mano'));
    else if (!cmd && !e.altKey && k === 'z') hacer(() => setHerramienta('lupa'));
  };

  const hayMarcas = !!marcas && marcas.length > 0;
  const aviso = grabando
    ? `${tr('ps_grabando', 'Grabando…')} ${fmtFino(tGrab)}`
    : subiendo
      ? tr('ps_subiendo', 'Guardando la grabación…')
      : enviandoPedazo
        ? tr('ps_pedazo_creando', 'Creando el pedazo…')
        : avisoLocal ||
        (editar?.estado === 'procesando'
          ? tr('ps_rearmando', 'Rearmando el sonido…')
          : editar?.estado === 'error'
            ? editar.mensaje || tr('audioerror', 'No se pudo editar el audio')
            : editar && ed.silencios
              ? tr('ps_sinsilencios', 'Para editar, apagar «quitar el silencio del comienzo y del final»')
              : '');
  const estado = sel
    ? `${tr('seleccion', 'Selección')}: ${fmtFino(sel.a)} – ${fmtFino(sel.b)} (${(sel.b - sel.a).toFixed(2)} s)`
    : `${tr('cursor', 'Cursor')}: ${fmtFino(cursor)}`;

  return (
    // Los clics se quedan en la ventana: la tarjeta de abajo no se elige ni se pone a sonar.
    <div
      className={`ps_ventana ps_cara_${cara}${conMenus ? '' : ' ps_compacta'}`}
      ref={ventanaRef}
      tabIndex={-1}
      onKeyDown={alTeclear}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {conMenus &&
        (lugarMenus
          ? createPortal(
              <EscritorioCtx.Provider value={{ ventanas: null, menus: null }}>
                <MenuPrograma menus={listaMenus} clase={`ps_menu ps_menu_${cara}`} />
              </EscritorioCtx.Provider>,
              lugarMenus,
            )
          : <MenuPrograma menus={listaMenus} clase={`ps_menu ps_menu_${cara}`} />)}
      {/* LA GRABADORA DE SONIDOS (Pizarrita 3.11): la posición y el largo arriba de la onda. */}
      {cara === 'grabadora' && (
        <div className="ps_grab_tiempos">
          <span>{tr('ps_posicion', 'Posición')}: {segundos(actual)} s</span>
          <span>{tr('ps_longitud', 'Longitud')}: {segundos(dura)} s</span>
        </div>
      )}
      {/* LA BARRA DE HERRAMIENTAS (2026-09-30, JP: «como el Director Cut»): las herramientas del
          puntero, lo de editar y los efectos más usados, con el mismo juego de iconos. Lo mismo está
          en los menús. */}
      {conMenus && conIconos && (
        <div className="ps_barra" role="toolbar" aria-label={tr('ev_herramientas', 'Herramientas')}>
          {/* LA VISTA (2026-09-30, JP): onda o multipista, a la izquierda, igual en las dos. */}
          {editar && !editar.sinMultipista && (
            <>
              <button type="button" className="ps_btn ps_btn_multipista pz_vista_edit" title={tr('ps_multipista', 'Vista multipista')} onClick={verMultipista}>
                {ic('bi-list-nested')}
                <span className="ps_btn_texto">{tr('ps_multipista_corto', 'Multipista')}</span>
              </button>
              <span className="ps_barra_raya" />
            </>
          )}
          {(
            [
              ['seleccion', 'bi-cursor-fill', tr('ev_h_seleccion', 'Selección'), 'A'],
              ['mano', 'bi-hand-index-thumb', tr('ev_h_mano', 'Mano'), 'H'],
              ['lupa', 'bi-search', tr('ev_h_lupa', 'Lupa'), 'Z'],
            ] as const
          ).map(([id, bi, nombre, tecla]) => (
            <button
              key={id}
              type="button"
              className={`ps_btn${herramienta === id ? ' activo' : ''}`}
              aria-pressed={herramienta === id}
              title={`${nombre} (${tecla})`}
              onClick={() => setHerramienta(id)}
            >
              {ic(bi)}
            </button>
          ))}
          <span className="ps_barra_raya" />
          <button type="button" className="ps_btn" title={`${tr('deshacer', 'Deshacer')} (⌘Z)`} onClick={deshacer} disabled={!hayAntes || procesando}>{ic('bi-arrow-counterclockwise')}</button>
          <button type="button" className="ps_btn" title={`${tr('rehacer', 'Rehacer')} (⇧⌘Z)`} onClick={rehacer} disabled={!hayDespues || procesando}>{ic('bi-arrow-clockwise')}</button>
          <span className="ps_barra_raya" />
          <button type="button" className="ps_btn" title={`${tr('cortar', 'Cortar')} (⌘X)`} onClick={cortar} disabled={!sel || !puedeEditar}>{ic('bi-scissors')}</button>
          <button type="button" className="ps_btn" title={`${tr('copiar', 'Copiar')} (⌘C)`} onClick={copiar} disabled={!sel || !editar}>{ic('bi-copy')}</button>
          <button type="button" className="ps_btn" title={`${tr('pegar', 'Pegar')} (⌘V)`} onClick={pegar} disabled={!sePuedePegar}>{ic('bi-clipboard')}</button>
          <button type="button" className="ps_btn" title={`${tr('borrar', 'Borrar')} (⌫)`} onClick={borrar} disabled={!sel || !puedeEditar}>{ic('bi-trash')}</button>
          <button type="button" className="ps_btn" title={tr('ps_recortar', 'Dejar solo lo elegido')} onClick={recortar} disabled={!sel || !puedeEditar}>{ic('bi-crop')}</button>
          <span className="ps_barra_raya" />
          <button type="button" className="ps_btn" title={tr('ps_amplificar', 'Amplificar…')} onClick={() => setDialogo({ tipo: 'amplificar', db: '3' })} disabled={!sel || !puedeEditar}>{ic('bi-volume-up')}</button>
          <button type="button" className="ps_btn" title={tr('ps_normalizar', 'Normalizar')} onClick={normalizar} disabled={!sel || !puedeEditar}>{ic('bi-bar-chart-steps')}</button>
          <button type="button" className="ps_btn" title={tr('ps_fundidoentrada', 'Fundido de entrada')} onClick={fundirEntrada} disabled={!sel || !puedeEditar}>{ic('bi-graph-up')}</button>
          <button type="button" className="ps_btn" title={tr('ps_fundidosalida', 'Fundido de salida')} onClick={fundirSalida} disabled={!sel || !puedeEditar}>{ic('bi-graph-down')}</button>
          <button type="button" className="ps_btn" title={tr('ps_silencio', 'Silencio')} onClick={silenciar} disabled={!sel || !puedeEditar}>{ic('bi-volume-mute')}</button>
          <button type="button" className="ps_btn" title={tr('ps_invertir', 'Al revés')} onClick={invertir} disabled={!sel || !puedeEditar}>{ic('bi-arrow-left-right')}</button>
          {editar && (
            <>
              <span className="ps_barra_raya" />
              {editar.marcar && (
                <button type="button" className="ps_btn" title={`${tr('ev_marcar', 'Poner una marca en el cabezal')} (F8)`} onClick={() => pedirMarca(sel ? sel.a : sonando ? actual : cursor)}>
                  {ic('bi-bookmark-plus')}
                </button>
              )}
              <ControlesTempo tempo={tempoV} alTempo={editar.alTempo} reglas={reglas} alReglas={setReglas} clase="ps_btn" />
              <span className="ps_barra_raya" />
              <button type="button" className={`ps_btn${espectro ? ' activo' : ''}`} aria-pressed={espectro} title={`${tr('ps_espectro', 'Espectro con las notas')} (E)`} onClick={() => cambiarEspectro(!espectro)}>
                {ic('bi-music-note-list')}
              </button>
            </>
          )}

        </div>
      )}
      {cara === 'cooledit' && (
        <canvas
          ref={generalRef}
          className="ps_general"
          title={tr('ps_general', 'Todo el sonido: tocar o arrastrar para ir ahí')}
          onPointerMove={alMoverGeneral}
          onPointerUp={() => (arrastreGeneral.current = false)}
          onPointerCancel={() => (arrastreGeneral.current = false)}
        />
      )}
      <div className="ps_fila_onda">
      <div
        className="ps_marco"
        ref={marcoRef}
        onScroll={(e) => setDesde(e.currentTarget.scrollLeft)}
        style={{ '--ps-alto': `${altoOnda + altoRegla}px` } as CSSProperties}
      >
        <div className="ps_relleno" style={{ width: anchoTodo }}>
          {hayMarcas && (
            <div className="ps_marcas">
              {marcas!
                .filter((m) => m.t >= 0 && m.t <= dura)
                .map((m) => (
                  <button
                    type="button"
                    key={m.llave}
                    className={`ps_marca${vivas.has(m.llave) ? ' ps_marca_viva' : ''}${m.tipo === 'audio' ? ' ps_marca_voz' : ''}`}
                    style={{ left: Math.round(m.t * pps) }}
                    title={`${fmtFino(m.t)}${m.rotulo ? ' · ' + m.rotulo : ''}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSel(null);
                      setCursor(m.t);
                      irA(m.t, true);
                    }}
                  >
                    {m.autor && m.tipo === 'texto' ? `${m.autor}: ${m.rotulo}` : m.rotulo}
                  </button>
                ))}
            </div>
          )}
          <div className="ps_pegado">
            <canvas
              ref={lienzoRef}
              className="ps_lienzo"
              style={{ width: ancho, height: altoOnda + altoRegla, cursor: herramienta === 'mano' ? 'grab' : herramienta === 'lupa' ? 'zoom-in' : undefined }}
              onPointerMove={alMover}
              onPointerUp={alSoltar}
              onPointerCancel={alSoltar}
              onDoubleClick={(e) => {
                // En la regla (abajo de la onda): una marca ahí.
                const r = e.currentTarget.getBoundingClientRect();
                if (e.clientY - r.top >= altoOnda) pedirMarca(tDe(e.clientX));
              }}
            />
            {sel && puedeEditar && herramienta === 'seleccion' && (() => {
              const xa = Math.round(sel.a * pps - desde);
              const xb = Math.round(sel.b * pps - desde);
              if (xb < 0 || xa > ancho) return null;
              const dEntra = previa && 'fundido' in previa && previa.fundido === 'entra' ? previa.d * pps : 0;
              const dSale = previa && 'fundido' in previa && previa.fundido === 'sale' ? previa.d * pps : 0;
              const g = previa && 'g' in previa ? previa.g : 0;
              const gira = (Math.max(-24, Math.min(12, g)) / 24) * 135;
              return (
                <>
                  <span
                    ref={bajarHud('entra')}
                    className="ps_fundido_tirador ps_fundido_entra"
                    style={{ left: xa + dEntra }}
                    title={tr('ps_fundidoentrada', 'Fundido de entrada')}
                    onPointerMove={moverHud}
                    onPointerUp={soltarHud}
                    onPointerCancel={soltarHud}
                  />
                  <span
                    ref={bajarHud('sale')}
                    className="ps_fundido_tirador ps_fundido_sale"
                    style={{ left: xb - dSale }}
                    title={tr('ps_fundidosalida', 'Fundido de salida')}
                    onPointerMove={moverHud}
                    onPointerUp={soltarHud}
                    onPointerCancel={soltarHud}
                  />
                  {xb - xa >= 44 && (
                    <span className="ps_hud" style={{ left: Math.round((Math.max(0, xa) + Math.min(ancho, xb)) / 2) }}>
                      <span
                        ref={bajarHud('g')}
                        className="cr_perilla ps_hud_perilla"
                        title={tr('ps_amplificar', 'Amplificar…').replace('…', '')}
                        onPointerMove={moverHud}
                        onPointerUp={soltarHud}
                        onPointerCancel={soltarHud}
                      >
                        <span className="pz-i cr_perilla_dibujo" data-icono="perilla" style={{ transform: `rotate(${gira}deg)` }} />
                      </span>
                      {previa && 'g' in previa && <span className="ps_hud_valor">{`${g > 0 ? '+' : ''}${g.toFixed(1)} dB`}</span>}
                    </span>
                  )}
                </>
              );
            })()}
            {cargando && <div className="ps_aviso">{tr('leyendoOnda', 'Leyendo la onda…')}</div>}
            {!cargando && !picos && <div className="ps_aviso">{tr('sinOnda', 'No se pudo leer la onda de este sonido')}</div>}
          </div>
        </div>
      </div>
      {/* LA ESCALA DE dB (Cool Edit): a la derecha de la onda, a la altura de cada nivel. */}
      {cara === 'cooledit' && (
        <div className="ps_db" aria-hidden="true">
          {hayMarcas && <div className="ps_db_marcas" />}
          <div className="ps_db_escala" style={{ height: altoOnda }}>
            {ESCALA_DB.map(([amp, rotulo], k) => (
              <span key={k} className="ps_db_marca" style={{ top: Math.round(altoOnda / 2 - amp * (altoOnda / 2 - 2)) }}>
                {rotulo}
              </span>
            ))}
          </div>
        </div>
      )}
      </div>
      {dialogo && (
        <div className="ps_dialogo" role="dialog" onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') aceptarDialogo();
          if (e.key === 'Escape') setDialogo(null);
        }}>
          <div className="ps_dialogo_titulo">
            {dialogo.tipo === 'marca'
              ? `${tr('ev_marca_t', 'Marca en')} ${verCompases ? rotuloCompas(dialogo.t, tempoV) + ' · ' : ''}${fmtFino(dialogo.t)}`
              : dialogo.tipo === 'amplificar'
                ? tr('ps_amplificar', 'Amplificar…').replace('…', '')
                : tr('ps_eco', 'Eco…').replace('…', '')}
          </div>
          <div className="ps_dialogo_cuerpo">
            {dialogo.tipo === 'marca' ? (
              <label>
                {tr('ev_marca_texto', 'Lo que dice (queda como un mensaje pegado al audio en este momento)')}{' '}
                <input autoFocus maxLength={200} value={dialogo.texto} onChange={(e) => setDialogo({ ...dialogo, texto: e.target.value })} />
              </label>
            ) : dialogo.tipo === 'amplificar' ? (
              <label>
                {tr('ps_ganancia', 'Ganancia')}{' '}
                <input autoFocus type="number" step="0.5" min="-40" max="40" value={dialogo.db} onChange={(e) => setDialogo({ tipo: 'amplificar', db: e.target.value })} /> dB
              </label>
            ) : (
              <>
                <label>
                  {tr('ps_retardo', 'Retardo')}{' '}
                  <input autoFocus type="number" step="10" min="20" max="3000" value={dialogo.ms} onChange={(e) => setDialogo({ ...dialogo, ms: e.target.value })} /> ms
                </label>
                <label>
                  {tr('ps_vuelve', 'Cuánto vuelve')}{' '}
                  <input type="number" step="5" min="5" max="95" value={dialogo.vuelve} onChange={(e) => setDialogo({ ...dialogo, vuelve: e.target.value })} /> %
                </label>
              </>
            )}
          </div>
          <div className="ps_dialogo_botones">
            {dialogo.tipo !== 'marca' && (
              <button type="button" className={`ps_btn${oyendo ? ' activo' : ''}`} onClick={() => (oyendo ? pararPrevia() : void oirPrevia())}>
                {oyendo ? `■ ${tr('detener', 'Detener')}` : `▶ ${tr('ps_escuchar', 'Escuchar')}`}
              </button>
            )}
            <button type="button" className="ps_btn principal" onClick={() => { pararPrevia(); aceptarDialogo(); }}>{tr('aceptar', 'Aceptar')}</button>
            <button type="button" className="ps_btn" onClick={() => { pararPrevia(); setDialogo(null); }}>{tr('cancelar', 'Cancelar')}</button>
          </div>
        </div>
      )}
      <div className="ps_pie">
        <div className="ps_casetera">
          <button type="button" className="ps_btn" data-icono={di('parar')} title={tr('detener', 'Detener')} onClick={onStop}>{ic('bi-stop-fill')}</button>
          <button
            type="button"
            className="ps_btn ps_solo_cooledit"
            data-icono={di('ir-inicio')}
            title={tr('ps_irinicio', 'Ir al comienzo')}
            onClick={() => {
              setSel(null);
              setCursor(0);
              irA(0, sonando);
            }}
          >
            {ic('bi-skip-start-fill')}
          </button>
          <button
            type="button"
            className="ps_btn ps_solo_cooledit"
            data-icono={di('ir-fin')}
            title={tr('ps_irfin', 'Ir al final')}
            onClick={() => {
              setSel(null);
              setCursor(dura);
              irA(Math.max(0, dura - 0.01), false);
            }}
          >
            {ic('bi-skip-end-fill')}
          </button>
          <button
            type="button"
            className={`ps_btn ps_play${sonando && !enBucle ? ' activo' : ''}`}
            data-icono={di(sonando ? 'pausa' : 'play')}
            title={sonando ? tr('pausa', 'Pausa') : sel ? tr('escucharSeleccion', 'Escuchar lo elegido') : tr('reproducir', 'Reproducir')}
            onClick={escuchar}
          >
            {ic(sonando ? 'bi-pause-fill' : 'bi-play-fill')}
          </button>
          <button
            type="button"
            className={`ps_btn ps_bucle${sonando && enBucle ? ' activo' : ''}`}
            data-icono={di('repetir')}
            title={sel ? tr('ps_bucle_sel', 'Reproducir lo elegido en bucle') : tr('ps_bucle', 'Reproducir en bucle')}
            onClick={escucharEnBucle}
          >
            {ic('bi-repeat')}
          </button>
          {editar && (
            <button
              type="button"
              className={`ps_btn ps_grabar${grabando ? ' activo' : ''}`}
              data-icono={di('grabar')}
              title={grabando ? tr('ps_parargrabar', 'Terminar de grabar') : sel ? tr('ps_grabarsel', 'Grabar en lugar de lo elegido') : tr('ps_grabar', 'Grabar aquí')}
              disabled={!grabando && (!puedeEditar || subiendo)}
              onClick={() => void grabar()}
            >
              {ic('bi-record-fill')}
            </button>
          )}
        </div>
        <div className="ps_zoom">
          <button type="button" className="ps_btn" data-icono={di('alejar')} title={tr('alejar', 'Alejar')} onClick={() => cambiarZoom(0.5)} disabled={zoom === null}>{ic('bi-zoom-out')}</button>
          <button type="button" className="ps_btn" data-icono={di('acercar')} title={tr('acercar', 'Acercar')} onClick={() => cambiarZoom(2)} disabled={pps >= ZOOM_MAX}>{ic('bi-zoom-in')}</button>
          <button type="button" className="ps_btn" data-icono={di('ver-todo')} title={tr('verTodo', 'Ver todo')} onClick={() => cambiarZoom(null)} disabled={zoom === null}>{ic('bi-arrows-angle-expand')}</button>
          <button type="button" className="ps_btn" data-icono={di('ver-seleccion')} title={tr('verSeleccion', 'Ver lo elegido')} onClick={verSeleccion} disabled={!sel}>{ic('bi-bounding-box-circles')}</button>
          <button type="button" className="ps_btn" data-icono={di('elegir-todo')} title={tr('elegirTodo', 'Elegir todo')} onClick={elegirTodo} disabled={dura <= 0}>{ic('bi-border-all')}</button>
        </div>
        {/* COOL EDIT: el reloj grande y los cuadros de lo elegido (la base los esconde). */}
        <div className="ps_reloj" aria-hidden="true">
          {fmtMilis(actual)}
        </div>
        <div className="ps_rango">
          <span className="ps_rango_fila">
            <span />
            <b>{tr('ps_inicio', 'Inicio')}</b>
            <b>{tr('ps_fin', 'Fin')}</b>
            <b>{tr('ps_largo', 'Largo')}</b>
          </span>
          <span className="ps_rango_fila">
            <b>{tr('ps_eleccion', 'Elegido')}</b>
            <span className="ps_rango_num">{fmtMilis(sel ? sel.a : cursor)}</span>
            <span className="ps_rango_num">{sel ? fmtMilis(sel.b) : ''}</span>
            <span className="ps_rango_num">{fmtMilis(sel ? sel.b - sel.a : 0)}</span>
          </span>
          <span className="ps_rango_fila">
            <b>{tr('ps_vista', 'Vista')}</b>
            <span className="ps_rango_num">{fmtMilis(desde / pps)}</span>
            <span className="ps_rango_num">{fmtMilis(Math.min(dura, (desde + ancho) / pps))}</span>
            <span className="ps_rango_num">{fmtMilis(Math.min(dura, ancho / pps))}</span>
          </span>
        </div>
        <div className="ps_estado">
          {aviso && <span className="ps_estado_aviso">{aviso}</span>}
          <span className="ps_estado_sel">{estado}</span>
          <span className="ps_estado_tiempo">
            {fmtFino(actual)} / {fmtFino(dura)}
          </span>
        </div>
      </div>
    </div>
  );
}
