// ARMAR EL AUDIO EDITADO EN EL NAVEGADOR (2026-11-23, docs/anfitrion.md, paso 3b; JP: «siempre es
// el propio programa, en el navegador, y en Pizarrita el sistema»).
//
// En Pizarrita el audio editado lo rearma el servidor con ffmpeg desde el original
// (UploadController::cadenaAudio y comandoMontaje). Fuera de Pizarrita no hay servidor: lo arma
// Edit Pro con esto, sobre las muestras ya decodificadas, en el MISMO orden de la casa:
//   0. el montaje (pedazos, al revés, silencios; ganancia, envolvente y eco de cada tramo)
//   1. el recorte   2. el ruido   3. los silencios de los extremos   4. el nivel   5. la velocidad
//
// QUITAR EL RUIDO Y EMPAREJAR EL NIVEL (JP, 2026-11-23: «copia el método, hagamos una versión
// reducida del ffmpeg»): en el servidor son filtros de ffmpeg (afftdn, loudnorm). Acá son el
// mismo método, pasado a TypeScript (afftdn.ts y loudnorm.ts) y medido contra el ffmpeg del
// servidor: el ruido sale igual muestra por muestra (salvo el primer medio segundo) y el nivel a
// menos de 0,1 dB.
//
// EL ECO ALARGA EL TRAMO con su cola, igual que en el servidor (JP, 2026-11-23: «se alarga, sí»).
//
// EL RESULTADO sale en WAV o en mp3 (JP: «wav y mp3»): `aWav` y `aMp3`.
//
// Todo son cuentas sobre Float32Array: se prueba sin navegador (pruebas/armarAudio.prueba.ts).
// Solo `decodificar` necesita el navegador.
import { largo } from './montaje';
import type { Tramo } from './montaje';
import type { EdicionesAudio } from './HerramientasAudio';
import { wsolaCanales } from './estirar';
import { sinRuido } from './afftdn';
import { nivelar } from './loudnorm';

/** Un sonido decodificado, siempre en estéreo. */
export interface Sonido {
  izq: Float32Array;
  der: Float32Array;
  frecuencia: number;
}

/** A esta frecuencia se arma todo (la misma del servidor). */
export const FRECUENCIA_ARMADO = 44100;

/** De dónde sale cada archivo que nombra un tramo; undefined si no está. */
export type Fuentes = (archivo: string) => Sonido | undefined;

const UMBRAL_SILENCIO = Math.pow(10, -45 / 20); // -45 dB, el de `silenceremove` en el servidor

function tramoArmado(t: Tramo, fuentes: Fuentes, fr: number): [Float32Array, Float32Array] | null {
  const n = Math.max(0, Math.round(largo(t) * fr));
  // Con eco, el tramo dura además lo que tarda en volver (la cola).
  const cola = !('s' in t) && t.e?.eco ? Math.max(1, Math.round((t.e.eco[0] / 1000) * fr)) : 0;
  const izq = new Float32Array(n + cola);
  const der = new Float32Array(n + cola);
  if ('s' in t) return [izq, der];
  const f = fuentes(t.f);
  if (!f) return null;
  const a0 = Math.round(t.a * fr);
  const L = f.izq.length;
  for (let i = 0; i < n; i += 1) {
    const k = t.r ? a0 + n - 1 - i : a0 + i;
    if (k < 0 || k >= L) continue;
    izq[i] = f.izq[k];
    der[i] = f.der[k];
  }
  const e = t.e;
  if (!e) return [izq, der];
  // Los efectos, después de cortar y dar vuelta: en el orden en que suena.
  const g = e.g ? Math.pow(10, e.g / 20) : 1;
  if (g !== 1 || e.v) {
    const [v0, v1] = e.v || [1, 1];
    for (let i = 0; i < n; i += 1) {
      const k = g * (v0 + ((v1 - v0) * i) / (n || 1));
      izq[i] *= k;
      der[i] *= k;
    }
  }
  if (e.eco) {
    // aecho=0.8:0.88:<ms>:<vuelve>: lo de antes vuelve una vez, más bajo.
    const vuelve = e.eco[1];
    for (const c of [izq, der]) {
      const seco = c.slice();
      for (let i = 0; i < n + cola; i += 1) c[i] = (seco[i] * 0.8 + (i >= cola ? seco[i - cola] * vuelve : 0)) * 0.88;
    }
  }
  return [izq, der];
}

/** El montaje hecho sonido. null si falta alguno de sus archivos. */
export function armarMontaje(m: Tramo[], fuentes: Fuentes, frecuencia = FRECUENCIA_ARMADO): Sonido | null {
  const partes: [Float32Array, Float32Array][] = [];
  let n = 0;
  for (const t of m) {
    const p = tramoArmado(t, fuentes, frecuencia);
    if (!p) return null;
    partes.push(p);
    n += p[0].length;
  }
  const izq = new Float32Array(n);
  const der = new Float32Array(n);
  let o = 0;
  for (const [i, d] of partes) {
    izq.set(i, o);
    der.set(d, o);
    o += i.length;
  }
  return { izq, der, frecuencia };
}

function pedazo(s: Sonido, a: number, b: number): Sonido {
  const x = Math.max(0, Math.min(s.izq.length, a));
  const y = Math.max(x, Math.min(s.izq.length, b));
  return { izq: s.izq.slice(x, y), der: s.der.slice(x, y), frecuencia: s.frecuencia };
}

/** Sin el silencio de los extremos (el de adentro es parte de lo que se dijo). */
export function sinSilencios(s: Sonido): Sonido {
  const suena = (i: number) => Math.abs(s.izq[i]) > UMBRAL_SILENCIO || Math.abs(s.der[i]) > UMBRAL_SILENCIO;
  let a = 0;
  while (a < s.izq.length && !suena(a)) a += 1;
  let b = s.izq.length;
  while (b > a && !suena(b - 1)) b -= 1;
  return pedazo(s, a, b);
}

/**
 * El audio que sale de unas ediciones. `original` es el archivo entero que vale cuando no hay
 * montaje. null si falta algún archivo o no queda nada que sonar.
 */
export function armarAudio(ed: EdicionesAudio, fuentes: Fuentes, original: string): Sonido | null {
  let s: Sonido | null | undefined = ed.montaje && ed.montaje.length > 0 ? armarMontaje(ed.montaje, fuentes) : fuentes(ed.orig || original);
  if (!s) return null;
  const fr = s.frecuencia;
  // 1. El recorte, en segundos de lo que salió del montaje. Uno que no deja nada se ignora.
  const desde = Math.max(0, Number(ed.recorte?.desde) || 0);
  let hasta = Math.max(0, Number(ed.recorte?.hasta) || 0);
  if (hasta > 0 && hasta - desde < 0.2) hasta = 0;
  if (desde > 0 || hasta > 0) s = pedazo(s, Math.round(desde * fr), hasta > 0 ? Math.round(hasta * fr) : s.izq.length);
  // 2. El ruido de fondo, antes de tocar el nivel: si no, se amplifica.
  if (ed.ruido) s = sinRuido(s);
  if (ed.silencios) s = sinSilencios(s);
  // 4. El nivel parejo: el mismo método del servidor (loudnorm.ts).
  if (ed.nivel) s = nivelar(s);
  // 5. La velocidad, sin cambiar el tono (como atempo: de 0,5 a 2).
  const vel = Number(ed.velocidad) || 1;
  if (vel >= 0.5 && vel <= 2 && Math.abs(vel - 1) > 0.001 && s.izq.length > 0) {
    const [izq, der] = wsolaCanales([s.izq, s.der], fr, 1 / vel);
    s = { izq, der, frecuencia: fr };
  }
  return s.izq.length === 0 ? null : s;
}

/** El sonido como archivo WAV (16 bits, estéreo). */
export function aWav(s: Sonido): Uint8Array<ArrayBuffer> {
  const n = s.izq.length;
  const datos = new ArrayBuffer(44 + n * 4);
  const v = new DataView(datos);
  const texto = (o: number, t: string) => {
    for (let i = 0; i < t.length; i += 1) v.setUint8(o + i, t.charCodeAt(i));
  };
  texto(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 2, true); // estéreo
  v.setUint32(24, s.frecuencia, true);
  v.setUint32(28, s.frecuencia * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  texto(36, 'data');
  v.setUint32(40, n * 4, true);
  const entero = (x: number) => {
    const c = Math.max(-1, Math.min(1, x));
    return Math.round(c < 0 ? c * 0x8000 : c * 0x7fff);
  };
  for (let i = 0; i < n; i += 1) {
    v.setInt16(44 + i * 4, entero(s.izq[i]), true);
    v.setInt16(46 + i * 4, entero(s.der[i]), true);
  }
  return new Uint8Array(datos);
}

/** El codificador de mp3 (lamejs, LGPL): lo trae quien llama, para no atarlo a de dónde se carga. */
export type CodificadorMp3 = new (canales: number, frecuencia: number, kbps: number) => {
  encodeBuffer(izq: Int16Array, der: Int16Array): ArrayLike<number>;
  flush(): ArrayLike<number>;
};

/** El sonido como archivo mp3 (estéreo). */
export function aMp3(s: Sonido, Mp3Encoder: CodificadorMp3, kbps = 192): Uint8Array<ArrayBuffer> {
  const enteros = (f: Float32Array) => {
    const out = new Int16Array(f.length);
    for (let i = 0; i < f.length; i += 1) {
      const c = Math.max(-1, Math.min(1, f[i]));
      out[i] = c < 0 ? c * 0x8000 : c * 0x7fff;
    }
    return out;
  };
  const L = enteros(s.izq);
  const R = enteros(s.der);
  const cod = new Mp3Encoder(2, s.frecuencia, kbps);
  const partes: Uint8Array[] = [];
  const BLOQUE = 1152 * 40;
  for (let k = 0; k < L.length; k += BLOQUE) {
    const buf = cod.encodeBuffer(L.subarray(k, k + BLOQUE), R.subarray(k, k + BLOQUE));
    if (buf.length) partes.push(Uint8Array.from(buf));
  }
  const fin = cod.flush();
  if (fin.length) partes.push(Uint8Array.from(fin));
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Decodifica un archivo de audio a la frecuencia de armado (solo en el navegador). null si no se entiende. */
export async function decodificar(datos: ArrayBuffer): Promise<Sonido | null> {
  try {
    const ctx = new OfflineAudioContext(2, 1, FRECUENCIA_ARMADO);
    const b = await ctx.decodeAudioData(datos.slice(0));
    const izq = b.getChannelData(0).slice();
    const der = b.numberOfChannels > 1 ? b.getChannelData(1).slice() : izq.slice();
    return { izq, der, frecuencia: b.sampleRate };
  } catch {
    return null;
  }
}
