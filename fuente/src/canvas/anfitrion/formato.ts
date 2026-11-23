// EL FORMATO DEL ARCHIVO de un programa fuera de Pizarrita (2026-11-23, docs/anfitrion.md, paso 3b).
//
// Dos formas del mismo documento:
//   · sin archivos adentro (la calculadora): un `.json` a secas, como en el paso 3a;
//   · con archivos adentro (un audio y sus grabaciones, los sonidos de una caja): un `.zip` con
//       documento.json     el documento (lo mismo que el .json a secas)
//       archivos/…         el original, el resultado y los demás, sin comprimir (ya vienen comprimidos)
//
// Adentro del documento un archivo se nombra por su RUTA en el zip ('archivos/tema.mp3'): en
// `archivo` (el original), en `resultado` (lo ya armado, que es lo que se muestra), en el
// `archivo` de una pieza, o en la config del programa (los tramos de un montaje). Al guardar va
// al zip todo archivo cuya ruta siga nombrada en el documento; lo que ya nadie nombra se queda afuera.
//
// REGLA: este archivo no importa nada de Pizarrita ni de React (lo prueba pruebas/formato.prueba.ts
// sin navegador).
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { Pieza } from './anfitrion';

/** La versión del formato del archivo. Un archivo con una mayor no se abre. */
export const VERSION_ARCHIVO = 1;
export const CARPETA_ARCHIVOS = 'archivos/';
const NOMBRE_DOCUMENTO = 'documento.json';

/** Un archivo que viaja adentro del documento. */
export type ArchivoAdentro = { ruta: string; tipo: string; nombre: string; duracion?: number };

export type DocumentoArchivo = {
  pz: number;
  programa: string;
  nombre: string;
  config: Record<string, unknown>;
  /** El `archivo` de una pieza es su ruta adentro ('archivos/…'). */
  piezas: Pieza[];
  /** Lo que el programa recuerda «del documento» (la vista, un panel): viaja con el archivo. */
  preferencias: Record<string, unknown>;
  /** EL ORIGINAL (el audio, la imagen, el video que se edita): no se pisa nunca. */
  archivo?: ArchivoAdentro;
  /** EL RESULTADO ya armado desde el proyecto: lo que ve y oye quien solo mira. */
  resultado?: ArchivoAdentro;
};

/** El documento con sus archivos, por ruta. */
export type Paquete = { documento: DocumentoArchivo; archivos: Map<string, Uint8Array> };

type Traducir = (clave: string, porDefecto: string) => string;
const tal: Traducir = (_c, d) => d;

export function documentoVacio(programa: string, nombre = ''): DocumentoArchivo {
  return { pz: VERSION_ARCHIVO, programa, nombre, config: {}, piezas: [], preferencias: {} };
}

const TIPOS: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac',
  flac: 'audio/flac', webm: 'video/webm', mp4: 'video/mp4', mov: 'video/quicktime', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mid: 'audio/midi', json: 'application/json',
};
/** El tipo MIME que le toca a un nombre de archivo, por su extensión. */
export function tipoDeNombre(nombre: string): string {
  const ext = (/\.([A-Za-z0-9]+)$/.exec(nombre)?.[1] || '').toLowerCase();
  return TIPOS[ext] || 'application/octet-stream';
}

/** Una ruta adentro que no choque con las que ya hay, para un archivo con ese nombre. */
export function rutaLibre(archivos: ReadonlyMap<string, unknown>, nombre: string): string {
  // Las tildes se van (Joaquín → Joaquin); lo demás que no sea letra, número, punto o guion, a «_».
  const limpio = nombre.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(-80) || 'archivo';
  const punto = limpio.lastIndexOf('.');
  const base = punto > 0 ? limpio.slice(0, punto) : limpio;
  const ext = punto > 0 ? limpio.slice(punto) : '';
  let ruta = CARPETA_ARCHIVOS + limpio;
  for (let n = 2; archivos.has(ruta); n += 1) ruta = `${CARPETA_ARCHIVOS}${base}_${n}${ext}`;
  return ruta;
}

const rutaValida = (r: unknown): r is string => typeof r === 'string' && r.startsWith(CARPETA_ARCHIVOS) && r.length > CARPETA_ARCHIVOS.length && !r.includes('..') && !r.includes('\\');

function adentro(x: unknown): ArchivoAdentro | undefined {
  const a = x as Partial<ArchivoAdentro> | null;
  if (!a || typeof a !== 'object' || !rutaValida(a.ruta)) return undefined;
  const nombre = typeof a.nombre === 'string' && a.nombre ? a.nombre : a.ruta.slice(CARPETA_ARCHIVOS.length);
  const out: ArchivoAdentro = { ruta: a.ruta, tipo: typeof a.tipo === 'string' && a.tipo ? a.tipo : tipoDeNombre(a.ruta), nombre };
  if (typeof a.duracion === 'number' && a.duracion > 0) out.duracion = a.duracion;
  return out;
}

/** Lee el texto de un documento. Tira un Error con el motivo si no es de este programa o no se
 *  entiende. `t` traduce el motivo (clave, texto de por defecto). */
export function leerDocumento(texto: string, programa: string, t: Traducir = tal): DocumentoArchivo {
  let o: unknown;
  try {
    o = JSON.parse(texto);
  } catch {
    throw new Error(t('pza_no_leer', 'El archivo no se pudo leer'));
  }
  const d = o as Partial<DocumentoArchivo> | null;
  if (!d || typeof d !== 'object' || typeof d.pz !== 'number' || typeof d.programa !== 'string') throw new Error(t('pza_no_es', 'No es un archivo de estos programas'));
  if (d.pz > VERSION_ARCHIVO) throw new Error(t('pza_mas_nuevo', 'El archivo es de una versión más nueva'));
  if (d.programa !== programa) throw new Error(`${t('pza_otro', 'El archivo es de otro programa')} (${d.programa})`);
  const objeto = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
  const doc: DocumentoArchivo = {
    pz: VERSION_ARCHIVO,
    programa,
    nombre: typeof d.nombre === 'string' ? d.nombre : '',
    config: objeto(d.config),
    piezas: Array.isArray(d.piezas) ? (d.piezas as Pieza[]) : [],
    preferencias: objeto(d.preferencias),
  };
  const original = adentro(d.archivo);
  if (original) doc.archivo = original;
  const resultado = adentro(d.resultado);
  if (resultado) doc.resultado = resultado;
  return doc;
}

const esZip = (b: Uint8Array) => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/** Abre lo que se guardó: un `.zip` (documento y archivos) o un `.json` a secas. */
export function abrirPaquete(datos: Uint8Array, programa: string, t: Traducir = tal): Paquete {
  if (!esZip(datos)) return { documento: leerDocumento(strFromU8(datos), programa, t), archivos: new Map() };
  let partes: Record<string, Uint8Array>;
  try {
    // Solo lo nuestro: el documento y lo que está en la carpeta de archivos.
    partes = unzipSync(datos, { filter: (f) => f.name === NOMBRE_DOCUMENTO || rutaValida(f.name) });
  } catch {
    throw new Error(t('pza_no_leer', 'El archivo no se pudo leer'));
  }
  const doc = partes[NOMBRE_DOCUMENTO];
  if (!doc) throw new Error(t('pza_no_es', 'No es un archivo de estos programas'));
  const documento = leerDocumento(strFromU8(doc), programa, t);
  const archivos = new Map<string, Uint8Array>();
  for (const [ruta, bytes] of Object.entries(partes)) if (ruta !== NOMBRE_DOCUMENTO && !ruta.endsWith('/')) archivos.set(ruta, bytes);
  return { documento, archivos };
}

export type Empacado = { datos: Uint8Array; tipo: 'application/zip' | 'application/json'; extension: 'zip' | 'json' };

/** Deja el documento listo para guardar: `.json` si no nombra archivos, `.zip` si los nombra. */
export function empacar(p: Paquete): Empacado {
  const texto = JSON.stringify(p.documento, null, 1);
  // Va lo que el documento todavía nombra (el original, el resultado, una pieza, un tramo).
  const nombrados = [...p.archivos.keys()].filter((ruta) => texto.includes(JSON.stringify(ruta)));
  if (nombrados.length === 0) return { datos: strToU8(texto), tipo: 'application/json', extension: 'json' };
  const zip: Zippable = { [NOMBRE_DOCUMENTO]: [strToU8(texto), { level: 6 }] };
  // Audio, video e imágenes ya vienen comprimidos: se guardan tal cual, que es rápido.
  for (const ruta of nombrados) zip[ruta] = [p.archivos.get(ruta) as Uint8Array, { level: 0 }];
  return { datos: zipSync(zip), tipo: 'application/zip', extension: 'zip' };
}

/** Un documento nuevo a partir de un archivo suelto (abrir un mp3 con Edit Pro): queda como original. */
export function paqueteDesdeOriginal(programa: string, nombreArchivo: string, bytes: Uint8Array, tipo = ''): Paquete {
  const archivos = new Map<string, Uint8Array>();
  const ruta = rutaLibre(archivos, nombreArchivo);
  archivos.set(ruta, bytes);
  const documento = documentoVacio(programa, nombreArchivo.replace(/\.[A-Za-z0-9]+$/, ''));
  documento.archivo = { ruta, tipo: tipo || tipoDeNombre(nombreArchivo), nombre: nombreArchivo };
  return { documento, archivos };
}
