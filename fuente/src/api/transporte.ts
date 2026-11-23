// EL VIAJE AL SERVIDOR, sin jQuery (2026-09-25).
//
// Hasta acá cada pedido era un `$.ajax` de `scripts/funciones.js`. Ahora es `fetch`, y es
// el ÚNICO lugar por donde sale un pedido: React lo importa, y el jQuery que queda
// (idiomas, sesión, colores, `llenar_idea`) lo usa por `window.apiGet` / `window.apiPost`,
// que se instalan acá al cargar el bundle. El bundle es un <script> clásico al final del
// <body>, así que corre antes del `$(function…)` de rutinas.js, que es el primero que pide.
//
// Lo que devuelve un pedido es un VIAJE: una promesa que además entiende `.done`, `.fail`
// y `.always` como el jqXHR de antes. Así el código viejo no cambia de forma, y lo nuevo
// puede hacer `await`.
//
// Reglas que se mantienen iguales:
// - Lectura: POST sin cabecera CSRF. Escritura: POST con `X-CSRF-Token`.
// - Toda respuesta trae un `csrf_token` fresco, y se guarda.
// - Una escritura que no llega al servidor avisa «no se guardó» (`mensajes.ts`).

import { avisarNoSeGuardo } from './mensajes';

export interface Respuesta<F = Record<string, unknown>> {
  error?: number | string;
  mensaje?: string;
  csrf_token?: string;
  rows?: F[];
  [clave: string]: unknown;
}

type AlLlegar<F> = (data: Respuesta<F>) => void;
// El primer argumento imita al jqXHR: el jQuery que queda lee `responseText` en sus `.fail`.
type XhrFalso = { responseText: string; status: number };
type AlFallar = (xhr: XhrFalso, estado: string, error: unknown) => void;

export interface Viaje<F = Record<string, unknown>> extends Promise<Respuesta<F>> {
  done(cb: AlLlegar<F>): Viaje<F>;
  fail(cb: AlFallar): Viaje<F>;
  always(cb: () => void): Viaje<F>;
}

type Datos = Record<string, unknown> | string | FormData;

type Ventana = {
  getCSRFToken?: () => string;
  updateCSRFToken?: (t: string) => void;
};

export function tokenCsrf(): string {
  const w = window as unknown as Ventana;
  if (w.getCSRFToken) return w.getCSRFToken() || '';
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '';
}

function guardarToken(data: unknown): void {
  const t = data && typeof data === 'object' ? (data as Respuesta).csrf_token : undefined;
  if (typeof t === 'string' && t) (window as unknown as Ventana).updateCSRFToken?.(t);
}

// Como `$.param`: los anidados van con corchetes (`a[b]=…`), null e indefinido van vacíos.
function agregar(p: URLSearchParams, clave: string, valor: unknown): void {
  if (valor === null || valor === undefined) {
    p.append(clave, '');
  } else if (Array.isArray(valor)) {
    valor.forEach((v, i) => agregar(p, typeof v === 'object' && v !== null ? `${clave}[${i}]` : `${clave}[]`, v));
  } else if (typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) agregar(p, `${clave}[${k}]`, v);
  } else {
    p.append(clave, String(valor));
  }
}

function cuerpo(cual: string, datos: Datos | undefined): URLSearchParams | FormData {
  if (datos instanceof FormData) return datos;
  if (typeof datos === 'string') return new URLSearchParams(`cual=${encodeURIComponent(cual)}&${datos}`);
  const p = new URLSearchParams();
  p.append('cual', cual);
  for (const [k, v] of Object.entries(datos || {})) agregar(p, k, v);
  return p;
}

// Envuelve una promesa para que además hable como un jqXHR.
function comoViaje<F>(promesa: Promise<Respuesta<F>>): Viaje<F> {
  const v = promesa as Viaje<F>;
  v.done = (cb) => {
    promesa.then(cb, () => undefined);
    return v;
  };
  v.fail = (cb) => {
    promesa.then(undefined, (e) => cb({ responseText: '', status: 0 }, 'error', e));
    return v;
  };
  v.always = (cb) => {
    promesa.then(cb, cb);
    return v;
  };
  return v;
}

function viajar<F>(cual: string, datos: Datos | undefined, escritura: boolean, url = 'json_list.php'): Viaje<F> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (escritura) headers['X-CSRF-Token'] = tokenCsrf();
  const promesa = fetch(url, {
    method: 'POST',
    body: cuerpo(cual, datos),
    headers,
    credentials: 'same-origin',
  }).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = (await r.json()) as Respuesta<F>;
    guardarToken(data);
    return data;
  });
  // Una escritura que no llega no puede quedar en silencio: el cambio ya se ve en
  // pantalla y no se guardó. Cada llamada puede sumar su propio `.fail`.
  if (escritura) promesa.catch(() => avisarNoSeGuardo());
  // Nadie tiene por qué atrapar el rechazo: sin esto, cada pedido caído sería además
  // un «Uncaught (in promise)» en la consola.
  promesa.catch(() => undefined);
  return comoViaje(promesa);
}

/** Una escritura chica que tiene que llegar aunque la página se esté yendo (al navegar a otra
 *  pizarrita se recarga): `keepalive` deja que el pedido termine después. Sin respuesta. */
export function apiPostAlSalir(cual: string, datos: Datos): void {
  try {
    void fetch('json_list.php', {
      method: 'POST',
      body: cuerpo(cual, datos),
      headers: { Accept: 'application/json', 'X-CSRF-Token': tokenCsrf() },
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* sin keepalive: se pierde lo último, como antes */
  }
}

/** Lectura: sin CSRF y sin el aviso de «no se guardó». */
export function apiGet<F = Record<string, unknown>>(cual: string, datos?: Datos): Viaje<F> {
  return viajar<F>(cual, datos, false);
}

/** Escritura: con CSRF y con el aviso si no llega. */
export function apiPost<F = Record<string, unknown>>(cual: string, datos?: Datos): Viaje<F> {
  return viajar<F>(cual, datos, true);
}

/** Subida con archivo: el FormData lleva todo, y `cual` va en la dirección. */
export function apiSubir<F = Record<string, unknown>>(cual: string, datos: FormData): Viaje<F> {
  return viajar<F>(cual, datos, true, `json_list.php?cual=${encodeURIComponent(cual)}`);
}

/** Un error del servidor viene como `error` distinto de 0. */
export function huboError(d: Respuesta<unknown> | undefined | null): boolean {
  return !!d && !!d.error && Number(d.error) !== 0;
}

// El jQuery que queda usa los nombres de siempre.
const w = window as unknown as { apiGet: typeof apiGet; apiPost: typeof apiPost };
w.apiGet = apiGet;
w.apiPost = apiPost;
