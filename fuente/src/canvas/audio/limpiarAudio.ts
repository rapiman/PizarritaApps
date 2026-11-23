// MEDIR LA SONORIDAD Y EMPAREJAR EL NIVEL DE UN AUDIO CORTO (2026-11-23). La medida es la de la
// radio (EBU R128 / ITU BS.1770). `emparejarNivel` sube o baja el audio ENTERO hasta -16 LUFS sin
// dejar que el pico pase de -1,5 dB: es lo que hace ffmpeg con un audio de menos de 3 segundos.
// Para los más largos está loudnorm.ts, y para el ruido afftdn.ts: los dos son el método de
// ffmpeg pasado a TypeScript.
//
// Son cuentas sobre Float32Array (pruebas/armarAudio.prueba.ts).
import type { Sonido } from './armarAudio';

export const NIVEL_OBJETIVO = -16; // LUFS: el de la radio y los podcasts (el mismo del servidor)
const PICO_MAX = Math.pow(10, -1.5 / 20);

export type Filtro = { b0: number; b1: number; b2: number; a1: number; a2: number };

// Los dos filtros con que la norma «oye» (más agudos, sin los graves muy bajos), para cualquier frecuencia.
export function filtrosK(fs: number): [Filtro, Filtro] {
  const G = 3.999843853973347;
  let K = Math.tan((Math.PI * 1681.974450955533) / fs);
  let Q = 0.7071752369554196;
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const repisa: Filtro = { b0: (Vh + (Vb * K) / Q + K * K) / a0, b1: (2 * (K * K - Vh)) / a0, b2: (Vh - (Vb * K) / Q + K * K) / a0, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  K = Math.tan((Math.PI * 38.13547087602444) / fs);
  Q = 0.5003270373238773;
  a0 = 1 + K / Q + K * K;
  const corte: Filtro = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [repisa, corte];
}

export function filtrar(x: Float32Array, f: Filtro): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i += 1) {
    const v = f.b0 * x[i] + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** La sonoridad del audio entero, en LUFS; -Infinity si es silencio. */
export function sonoridad(s: Sonido): number {
  const [repisa, corte] = filtrosK(s.frecuencia);
  const k = [s.izq, s.der].map((c) => filtrar(filtrar(c, repisa), corte));
  const L = s.izq.length;
  const bloque = Math.min(L, Math.round(0.4 * s.frecuencia));
  const salto = Math.max(1, Math.round(0.1 * s.frecuencia));
  if (bloque === 0) return -Infinity;
  const energias: number[] = [];
  for (let o = 0; o + bloque <= L; o += salto) {
    let e = 0;
    for (let i = o; i < o + bloque; i += 1) e += k[0][i] * k[0][i] + k[1][i] * k[1][i];
    energias.push(e / bloque);
  }
  const lufs = (e: number) => -0.691 + 10 * Math.log10(e);
  const media = (es: number[]) => es.reduce((a, b) => a + b, 0) / es.length;
  // Dos puertas: lo que es casi silencio no cuenta, y tampoco lo que queda muy por debajo del resto.
  const audibles = energias.filter((e) => e > 0 && lufs(e) > -70);
  if (audibles.length === 0) return -Infinity;
  const puerta = lufs(media(audibles)) - 10;
  const cuentan = audibles.filter((e) => lufs(e) > puerta);
  return cuentan.length > 0 ? lufs(media(cuentan)) : -Infinity;
}

/** El mismo audio a -16 LUFS, sin que el pico pase de -1,5 dB. El silencio vuelve igual. */
export function emparejarNivel(s: Sonido): Sonido {
  const l = sonoridad(s);
  if (!Number.isFinite(l)) return s;
  let pico = 0;
  for (let i = 0; i < s.izq.length; i += 1) pico = Math.max(pico, Math.abs(s.izq[i]), Math.abs(s.der[i]));
  let g = Math.pow(10, (NIVEL_OBJETIVO - l) / 20);
  if (pico * g > PICO_MAX) g = PICO_MAX / pico;
  return { izq: s.izq.map((x) => x * g), der: s.der.map((x) => x * g), frecuencia: s.frecuencia };
}
