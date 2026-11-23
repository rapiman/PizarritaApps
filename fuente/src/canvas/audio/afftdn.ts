/*
 * QUITAR EL RUIDO COMO FFMPEG (2026-11-23, JP: «copia el método, hagamos una versión reducida del
 * ffmpeg»). Es el filtro `afftdn` de FFmpeg pasado a TypeScript, paso a paso: parte el audio en
 * ventanas de unos 37 ms, mira cuánta energía tiene cada frecuencia frente a un piso de ruido
 * fijo (-25 dB), y baja hasta 12 dB lo que queda cerca de ese piso, cuidando de no bajar lo que
 * el oído igual taparía con lo que suena al lado.
 *
 * Derivado de libavfilter/af_afftdn.c de FFmpeg (rama 4.4, la del servidor de Pizarrita):
 *   Copyright (c) 2018 The FFmpeg Project
 * FFmpeg es software libre bajo la GNU Lesser General Public License, versión 2.1 o posterior;
 * este archivo, como obra derivada, se distribuye en esos mismos términos (o posteriores).
 *
 * LO REDUCIDO respecto del original:
 *   · Solo lo que usa Pizarrita (`afftdn=nf=-25`): ruido blanco, 12 dB de reducción, sin seguir
 *     el ruido ni tomarle muestra. Con eso el perfil de ruido es parejo y se va la mitad del archivo.
 *   · El original deja el primer instante entrando de a poco y pierde los últimos ~30 ms. Acá el
 *     audio entra y sale relleno con silencio, así que sale entero y del mismo largo.
 */
import { fft } from './fft';
import type { Sonido } from './armarAudio';

const C = Math.LN10 * 0.1;
const RATIO = 0.98;
const RRATIO = 1 - RATIO;
const PISO_RUIDO = -25; // dB: el `nf` que usa Pizarrita
const REDUCCION = 12; // dB: el `nr` de fábrica

// Como lrint de C: al entero más cercano, y el medio justo al par.
function rint(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

const freq2bark = (x: number) => {
  const d = x / 7500;
  return 13 * Math.atan(7.6e-4 * x) + 3.5 * Math.atan(d * d);
};

function limitar(a: number, b: number): number {
  if (a > 1) return (b * a - 1) / (b + a - 2);
  if (a < 1) return (b * a - 2 * a + 1) / (b - a);
  return 1;
}

// Los dos pasos que el original da antes y después de mirar las frecuencias (su manera de
// acomodar el espectro): se pasan tal cual, para que las cuentas den lo mismo.
function girar(re: Float64Array, im: Float64Array, len: number, ida: boolean): void {
  const d5 = (2 * Math.PI) / len;
  let d8 = Math.sin(0.5 * d5);
  d8 = -2 * d8 * d8;
  const d7 = Math.sin(d5);
  let d9 = 1 + d8;
  let d6 = d7;
  const n = len / 2;
  for (let i = 1; i < len / 4; i += 1) {
    const k = n - i;
    const d2 = 0.5 * (re[i] + re[k]);
    const d1 = 0.5 * (im[i] - im[k]);
    if (ida) {
      const d4 = 0.5 * (im[i] + im[k]);
      const d3 = 0.5 * (re[k] - re[i]);
      re[i] = d2 + d9 * d4 + d6 * d3;
      im[i] = d1 + d9 * d3 - d6 * d4;
      re[k] = d2 - d9 * d4 - d6 * d3;
      im[k] = -d1 + d9 * d3 - d6 * d4;
    } else {
      const d4 = 0.5 * (re[i] - re[k]);
      const d3 = 0.5 * (im[i] + im[k]);
      re[i] = d2 - d9 * d3 - d6 * d4;
      im[i] = d1 + d9 * d4 - d6 * d3;
      re[k] = d2 + d9 * d3 + d6 * d4;
      im[k] = -d1 + d9 * d4 - d6 * d3;
    }
    const d10 = d9;
    d9 += d9 * d8 - d6 * d7;
    d6 += d6 * d8 + d10 * d7;
  }
  const d2 = re[0];
  if (ida) {
    re[0] = d2 + im[0];
    im[0] = d2 - im[0];
  } else {
    re[0] = 0.5 * (d2 + im[0]);
    im[0] = 0.5 * (d2 - im[0]);
  }
}

function canalSinRuido(ent: Float32Array, fr: number): Float32Array {
  const N = ent.length;
  const avance = Math.floor(fr / 80);
  const W = 3 * avance;
  const fl2 = 1 << (32 - Math.clz32(W));
  const fl = fl2 * 2;
  const bins = fl2 + 1;

  // ---- la preparación (config_input) ----
  const sdiv = fr / 17640;
  const bin2band = new Int32Array(bins);
  for (let i = 0; i <= fl2; i += 1) bin2band[i] = rint(sdiv * freq2bark((0.5 * i * fr) / fl2));
  const nb = bin2band[fl2] + 1;
  const reparto = new Float64Array(nb * nb);
  const p1 = Math.pow(0.1, 2.5 / sdiv);
  const p2 = Math.pow(0.1, 1 / sdiv);
  for (let m = 0, j = 0; m < nb; m += 1) for (let n = 0; n < nb; n += 1) reparto[j++] = n < m ? Math.pow(p2, m - n) : n > m ? Math.pow(p1, n - m) : 1;
  const excit = new Float64Array(nb);
  const excitAnt = new Float64Array(nb);
  for (let m = 0; m <= fl2; m += 1) excit[bin2band[m]] += 1;
  for (let m = 0, j = 0; m < nb; m += 1) for (let n = 0; n < nb; n += 1) excitAnt[m] += reparto[j++] * excit[n];
  const corte = rint(12 * sdiv);
  for (let i = 0; i < nb; i += 1) {
    const v = i < corte ? Math.pow(0.1, 1.45 + (0.1 * i) / sdiv) : Math.pow(0.1, 2.5 - 0.2 * (i / sdiv - 14));
    excit[i] = Math.min(Math.pow(0.1, 1), Math.max(Math.pow(0.1, 2.5), v));
  }
  for (let i = 0, j = 0; i < nb; i += 1) for (let k = 0; k < nb; k += 1) reparto[j++] *= excit[i] / excitAnt[i];
  const alfa = new Float64Array(nb);
  const beta = new Float64Array(nb);
  const sar = avance / fr;
  for (let i = 0, j = 0; i <= fl2; i += 1) {
    if (i === fl2 || bin2band[i] > j) {
      const d6 = ((i - 1) * fr) / fl;
      const d7 = Math.min(0.008 + 2.2 / d6, 0.03);
      alfa[j] = Math.exp(-sar / d7);
      beta[j] = 1 - alfa[j];
      j = bin2band[i];
    }
  }
  const ventana = new Float64Array(W);
  const escala = Math.sqrt(16 / (9 * fl));
  let suma = 0;
  for (let i = 0; i < W; i += 1) {
    const d = Math.sin((i * Math.PI) / W);
    ventana[i] = escala * d * d;
    suma += ventana[i] * ventana[i];
  }
  const piso = Math.pow(2, 48) * Math.exp(-23.025558369790467) * (0.5 * suma);
  const varMax = piso * Math.exp((100 + PISO_RUIDO) * C);
  const gananciaMax = Math.exp(REDUCCION * (0.5 * C));
  // El ruido es blanco: el mismo piso para todas las frecuencias.
  const varAbs = Math.max(varMax, 1);
  const varMin = varAbs / (gananciaMax * gananciaMax);

  // ---- el estado ----
  const previo = new Float64Array(bins).fill(RRATIO);
  const ganancia = new Float64Array(bins);
  const limpio = new Float64Array(bins);
  const bandaAmt = new Float64Array(nb);
  const re = new Float64Array(fl2);
  const im = new Float64Array(fl2);
  const A24 = Math.pow(2, 24);

  const unBin = (b: number, d1: number) => {
    const d2 = d1 / varAbs;
    const d3 = RATIO * previo[b] + RRATIO * Math.max(d2 - 1, 0);
    let g = d3 / (1 + d3);
    g *= g + Math.PI / 4 / Math.max(d2, 1e-6);
    previo[b] = d2 * g;
    limpio[b] = d1 * g;
    ganancia[b] = Math.sqrt(g);
  };

  // Relleno: dos avances de silencio antes (para que el comienzo no entre de a poco) y lo que
  // haga falta después (para que salga todo).
  const antes = W - avance;
  const cuadros = Math.ceil((N + antes) / avance);
  const total = (cuadros - 1) * avance + W;
  const x = new Float32Array(total);
  x.set(ent, antes);
  const acum = new Float64Array(total);

  for (let c = 0; c < cuadros; c += 1) {
    const o = c * avance;
    for (let m = 0; m < W; m += 1) {
      re[m] = ventana[m] * x[o + m] * A24;
      im[m] = 0;
    }
    for (let m = W; m < fl2; m += 1) {
      re[m] = 0;
      im[m] = 0;
    }
    fft(re as unknown as Float32Array, im as unknown as Float32Array);
    girar(re, im, fl, true);

    // process_frame
    unBin(0, re[0] * re[0]);
    for (let i = 1; i < fl2; i += 1) unBin(i, re[i] * re[i] + im[i] * im[i]);
    unBin(fl2, im[0] * im[0]);
    excit.fill(0);
    bandaAmt.fill(0);
    for (let i = 0; i < bins; i += 1) excit[bin2band[i]] += limpio[i];
    for (let i = 0; i < nb; i += 1) {
      excit[i] = Math.max(excit[i], alfa[i] * excit[i] + beta[i] * excitAnt[i]);
      excitAnt[i] = excit[i];
    }
    for (let j = 0, i = 0; j < nb; j += 1) for (let k = 0; k < nb; k += 1) bandaAmt[j] += reparto[i++] * excit[k];
    for (let i = 0; i < bins; i += 1) {
      const amt = bandaAmt[bin2band[i]];
      if (amt > varAbs) ganancia[i] = 1;
      else if (amt > varMin) ganancia[i] = limitar(ganancia[i], Math.sqrt(varAbs / amt));
      else ganancia[i] = limitar(ganancia[i], gananciaMax);
    }
    re[0] *= ganancia[0];
    im[0] *= ganancia[fl2];
    for (let i = 1; i < fl2; i += 1) {
      re[i] *= ganancia[i];
      im[i] *= ganancia[i];
    }

    girar(re, im, fl, false);
    // La vuelta: la misma FFT con las partes cambiadas de lugar (sin dividir, como el original).
    fft(im as unknown as Float32Array, re as unknown as Float32Array);
    for (let m = 0; m < W; m += 1) acum[o + m] += (ventana[m] * re[m]) / A24;
  }
  const sal = new Float32Array(N);
  for (let i = 0; i < N; i += 1) sal[i] = acum[antes + i];
  return sal;
}

/** El audio con el ruido de fondo más bajo, como lo hace `afftdn=nf=-25`. */
export function sinRuido(s: Sonido): Sonido {
  if (s.izq.length === 0) return s;
  return { izq: canalSinRuido(s.izq, s.frecuencia), der: canalSinRuido(s.der, s.frecuencia), frecuencia: s.frecuencia };
}
