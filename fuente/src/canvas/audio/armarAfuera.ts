// APLICAR UNA EDICIÓN SIN SERVIDOR (2026-11-23, docs/anfitrion.md, paso 3b-1). En Pizarrita,
// «aplicar» manda las ediciones al servidor, que rearma el audio. Con un anfitrión que no arma
// (`anfitrion.armar` falta: el anfitrión «archivo»), lo hace Edit Pro con esto: junta los archivos
// que nombran las ediciones (el original y lo grabado), arma el audio (armarAudio.ts) y entrega el
// RESULTADO al anfitrión, que es lo que después se muestra y se oye.
//
// No importa nada de Pizarrita: solo el contrato del anfitrión.
import type { Anfitrion } from '../anfitrion/anfitrion';
import type { EdicionesAudio } from './HerramientasAudio';
import { aMp3, aWav, armarAudio, decodificar, type CodificadorMp3, type Sonido } from './armarAudio';
import type { Armado, FormatoAudio, HiloArmar } from './hiloArmar';

export type OpcionesArmar = {
  /** El formato que se pide (por defecto mp3). Sin hilo y sin `mp3`, sale WAV. */
  formato?: FormatoAudio;
  /** El hilo aparte (hiloArmar.ts). Sin él, o si falla, se arma en la página. */
  hilo?: HiloArmar | null;
  /** El codificador de mp3 para armar en la página. Sin él, en la página sale WAV. */
  mp3?: CodificadorMp3;
  /** Cómo se decodifica un archivo (por defecto, el navegador). */
  decodificar?: (datos: ArrayBuffer) => Promise<Sonido | null>;
};

/** Los archivos decodificados de un documento, para no decodificar el original en cada edición. */
export type Decodificados = Map<string, Sonido>;

/**
 * El archivo que sale de `ed` (sin guardarlo). Devuelve el archivo, o el motivo si no se pudo:
 * 'sin_original', 'falta_archivo', 'vacio'.
 */
export async function armarArchivo(a: Anfitrion, ed: EdicionesAudio, op: OpcionesArmar = {}, ya: Decodificados = new Map()): Promise<Armado | string> {
  const original = a.documento.archivo;
  if (!original) return 'sin_original';
  const deco = op.decodificar || decodificar;
  const nombres = new Set<string>([ed.orig || original.ruta]);
  for (const t of ed.montaje || []) if (!('s' in t)) nombres.add(t.f);
  const fuentes = new Map<string, Sonido>();
  for (const nombre of nombres) {
    let sonido = ya.get(nombre);
    if (!sonido) {
      const blob = nombre === original.ruta ? await original.leer() : ((await a.archivos.contenido?.(nombre)) ?? null);
      sonido = (blob ? await deco(await blob.arrayBuffer()) : null) || undefined;
      if (!sonido) return 'falta_archivo';
      ya.set(nombre, sonido);
    }
    fuentes.set(nombre, sonido);
  }
  const formato = op.formato || 'mp3';
  if (op.hilo) {
    try {
      return await op.hilo.armar(ed, original.ruta, fuentes, formato);
    } catch (e) {
      if ((e as Error).message === 'vacio') return 'vacio';
      // El hilo no anduvo: se arma en la página.
    }
  }
  const sonido = armarAudio(ed, (f) => fuentes.get(f), original.ruta);
  if (!sonido) return 'vacio';
  return formato === 'mp3' && op.mp3
    ? { datos: aMp3(sonido, op.mp3), tipo: 'audio/mpeg', formato: 'mp3' }
    : { datos: aWav(sonido), tipo: 'audio/wav', formato: 'wav' };
}

/**
 * Arma el audio que sale de `ed` y lo entrega como resultado del documento. Devuelve null si
 * salió bien, o el motivo: 'sin_original', 'falta_archivo', 'vacio', 'no_guardo'.
 */
export async function armarYGuardar(a: Anfitrion, ed: EdicionesAudio, op: OpcionesArmar = {}, ya: Decodificados = new Map()): Promise<string | null> {
  const original = a.documento.archivo;
  if (!original || !a.documento.guardarResultado) return 'sin_original';
  const r = await armarArchivo(a, ed, op, ya);
  if (typeof r === 'string') return r;
  const base = original.nombre.replace(/\.[A-Za-z0-9]+$/, '');
  const bien = await a.documento.guardarResultado(new Blob([r.datos as BlobPart], { type: r.tipo }), { formato: r.formato, nombre: `${base}.${r.formato}` });
  return bien ? null : 'no_guardo';
}
