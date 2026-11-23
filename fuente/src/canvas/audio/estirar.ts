// ESTIRAR UN SONIDO SIN CAMBIARLE LA ALTURA (2026-09-25, JP: «los sampler pueden ser time
// stretching al 1 beat, 2 beat, a la 1 barra… manteniendo el pitch o no»). WSOLA: se toman
// ventanas del original a un paso distinto del que se escriben, y cada una se corre un poco
// (buscando la que mejor calza con la anterior) para que no se noten las costuras. Sin
// librerías; se calcula una vez por sonido y proporción, y queda guardado.

const hechos = new Map<string, AudioBuffer>();

export function estirado(ctx: BaseAudioContext, src: string, b: AudioBuffer, proporcion: number): AudioBuffer {
  if (Math.abs(proporcion - 1) < 0.01) return b;
  const llave = `${src}|${proporcion.toFixed(3)}`;
  const ya = hechos.get(llave);
  if (ya) return ya;
  const r = wsola(ctx, b, proporcion);
  hechos.set(llave, r);
  return r;
}

function wsola(ctx: BaseAudioContext, b: AudioBuffer, proporcion: number): AudioBuffer {
  const ent = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
  const out = wsolaCanales(ent, b.sampleRate, proporcion);
  const sal = ctx.createBuffer(b.numberOfChannels, out[0].length, b.sampleRate);
  out.forEach((o, c) => sal.getChannelData(c).set(o));
  return sal;
}

// Lo mismo sobre las muestras sueltas, sin contexto de audio (2026-11-23: lo usa también
// audio/armarAudio.ts, que arma el audio editado fuera de Pizarrita y se prueba sin navegador).
export function wsolaCanales(ent: Float32Array[], sr: number, proporcion: number): Float32Array[] {
  const L = ent[0].length;
  const N = Math.max(256, Math.round(sr * 0.046)); // ventana ~46 ms
  const Hs = Math.floor(N / 2); // salto al escribir
  const Ha = Hs / proporcion; // salto al leer
  const tol = Math.round(sr * 0.012); // cuánto se puede correr cada ventana
  const largoSal = Math.max(1, Math.round(L * proporcion));
  const canales = ent.length;
  const out = Array.from({ length: canales }, () => new Float32Array(largoSal));
  const peso = new Float32Array(largoSal);
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  // La referencia para calzar: la mezcla de los canales.
  const ref = new Float32Array(L);
  for (let c = 0; c < canales; c++) for (let i = 0; i < L; i++) ref[i] += ent[c][i] / canales;
  let anterior = 0;
  for (let k = 0; k * Hs < largoSal; k++) {
    const nominal = Math.round(k * Ha);
    let pos = Math.min(Math.max(0, nominal), Math.max(0, L - 1));
    if (k > 0) {
      // Lo que naturalmente seguiría a la ventana anterior, y el corrimiento que mejor calza.
      const sigue = anterior + Hs;
      let mejor = -Infinity;
      const desde = Math.max(0, nominal - tol);
      const hasta = Math.min(L - Hs - 1, nominal + tol);
      for (let cand = desde; cand <= hasta; cand += 2) {
        let s = 0;
        for (let i = 0; i < Hs; i += 4) {
          const a = sigue + i < L ? ref[sigue + i] : 0;
          s += a * ref[cand + i];
        }
        if (s > mejor) {
          mejor = s;
          pos = cand;
        }
      }
    }
    const base = k * Hs;
    for (let i = 0; i < N && base + i < largoSal; i++) {
      const j = pos + i;
      if (j >= L) break;
      const wi = w[i];
      for (let c = 0; c < canales; c++) out[c][base + i] += ent[c][j] * wi;
      peso[base + i] += wi;
    }
    anterior = pos;
  }
  for (let i = 0; i < largoSal; i++) {
    const p = peso[i];
    if (p > 1e-3) for (let c = 0; c < canales; c++) out[c][i] /= p;
  }
  return out;
}

// AL REVÉS (2026-09-25, JP: «sampler reverse»): el mismo sonido de atrás para adelante,
// calculado una vez y guardado.
const invertidos = new Map<string, AudioBuffer>();
export function invertido(ctx: BaseAudioContext, src: string, b: AudioBuffer): AudioBuffer {
  const ya = invertidos.get(src);
  if (ya) return ya;
  const r = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const a = b.getChannelData(c);
    const o = r.getChannelData(c);
    for (let i = 0, n = a.length; i < n; i++) o[i] = a[n - 1 - i];
  }
  invertidos.set(src, r);
  return r;
}
