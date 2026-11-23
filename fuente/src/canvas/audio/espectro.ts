// EL ESPECTRO CON LAS NOTAS (2026-09-30, JP: «espectro con notas do re mi…»): la vista espectral de
// Pizarrita Edit Pro. Cada columna es la FFT de un pedazo del audio alrededor de ese instante; el alto
// va por NOTAS (escala logarítmica, de Do1 a Do8), con los nombres en solfeo a la izquierda.

import { fft } from './fft';

export const NOTA_BAJA = 24; // Do1 (MIDI)
export const NOTA_ALTA = 108; // Do8
const NOMBRES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
export const nombreNota = (midi: number): string => `${NOMBRES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
export const frecuenciaNota = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
export const notaDeFrecuencia = (f: number): number => 69 + 12 * Math.log2(f / 440);

const N = 4096;
const ventana = (() => {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i += 1) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  return w;
})();
// El color de una intensidad (0…1): negro, azul, violeta, rojo, amarillo, blanco.
function color(x: number): [number, number, number] {
  const p: [number, number, number, number][] = [
    [0, 0, 0, 0],
    [0.25, 20, 20, 120],
    [0.45, 120, 30, 160],
    [0.65, 220, 50, 60],
    [0.85, 255, 200, 40],
    [1, 255, 255, 230],
  ];
  const v = Math.max(0, Math.min(1, x));
  for (let i = 1; i < p.length; i += 1) {
    if (v <= p[i][0]) {
      const f = (v - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
      return [0, 1, 2].map((k) => Math.round(p[i - 1][k + 1] + (p[i][k + 1] - p[i - 1][k + 1]) * f)) as [number, number, number];
    }
  }
  return [255, 255, 230];
}

// La imagen del espectro para lo que se ve: `ancho` columnas desde `desde` px (a `pps` px por
// segundo), `alto` filas de notas. De a pedazos, para no trabar la página; `vivo()` corta si ya no
// hace falta.
export async function pintarEspectro(buf: AudioBuffer, desde: number, pps: number, ancho: number, alto: number, vivo: () => boolean): Promise<HTMLCanvasElement | null> {
  const cv = document.createElement('canvas');
  cv.width = ancho;
  cv.height = alto;
  const g = cv.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(ancho, alto);
  const sr = buf.sampleRate;
  const canales = [...Array(buf.numberOfChannels).keys()].map((k) => buf.getChannelData(k));
  const largo = buf.length;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const mag = new Float32Array(N / 2);
  // A qué bin va cada fila (y cuántos bins abarca, para las notas altas).
  const filas = [...Array(alto).keys()].map((y) => {
    const m0 = NOTA_ALTA - ((y + 0.5) / alto) * (NOTA_ALTA - NOTA_BAJA);
    const m1 = NOTA_ALTA - ((y + 1.5) / alto) * (NOTA_ALTA - NOTA_BAJA);
    const b0 = Math.max(1, Math.round((frecuenciaNota(m1) * N) / sr));
    const b1 = Math.max(b0, Math.round((frecuenciaNota(m0) * N) / sr));
    return [b0, Math.min(N / 2 - 1, b1)] as [number, number];
  });
  for (let x = 0; x < ancho; x += 1) {
    if (x % 60 === 0) {
      await new Promise((r) => window.setTimeout(r, 0));
      if (!vivo()) return null;
    }
    const centro = Math.floor(((desde + x + 0.5) / pps) * sr);
    if (centro >= largo) break;
    const i0 = centro - N / 2;
    for (let i = 0; i < N; i += 1) {
      const k = i0 + i;
      let s = 0;
      if (k >= 0 && k < largo) for (const c of canales) s += c[k];
      re[i] = (s / canales.length) * ventana[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < N / 2; b += 1) mag[b] = Math.hypot(re[b], im[b]);
    for (let y = 0; y < alto; y += 1) {
      const [b0, b1] = filas[y];
      let m = 0;
      for (let b = b0; b <= b1; b += 1) if (mag[b] > m) m = mag[b];
      const db = 20 * Math.log10((m * 4) / N + 1e-9);
      const [r, gg, bl] = color((db + 90) / 80);
      const o = (y * ancho + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = gg;
      img.data[o + 2] = bl;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}
