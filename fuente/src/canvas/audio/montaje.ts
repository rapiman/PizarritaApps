// EL MONTAJE DE UN AUDIO (2026-09-25, PizarriSound: cortar, copiar, pegar, silenciar,
// invertir). No se toca ningún archivo: el audio es una LISTA DE TRAMOS de archivos que no
// cambian nunca (el original, y lo que se grabe), y el servidor la rearma con ffmpeg desde
// ahí (`config.audio.montaje`, ver UploadController::cadenaAudio). Así deshacer es volver a
// la lista anterior, y un corte no pierde nada del original.
//
//   { f: 'images/uploads/143_orig.mp3', a: 12.5, b: 30 }   un pedazo de un archivo
//   { f: …, a, b, r: 1 }                                    el mismo, al revés
//   { s: 2 }                                                dos segundos de silencio
//   { f, a, b, e: { g: 6, v: [0, 1], eco: [300, 0.4] } }    con efectos (ver `Efectos`)
//
// Los tiempos de lo que se edita son los del MONTAJE (lo que sale de la lista); lo que suena
// además puede ir acelerado (`velocidad`), y eso lo traduce quien llama.

// LOS EFECTOS DE UN TRAMO (2026-09-25, JP: fundidos, amplificar y eso, «una especie de Cool
// Edit»). Se aplican al tramo después de cortarlo (y darlo vuelta), en el orden en que suena:
//   g    ganancia en dB (amplificar, normalizar)
//   v    envolvente lineal [al comienzo, al final] (fundidos); 1 = como está
//   eco  [retardo en ms, cuánto vuelve 0..1]
export interface Efectos {
  g?: number;
  v?: [number, number];
  eco?: [number, number];
}
export type Tramo = ({ f: string; a: number; b: number; r?: 1 } | { s: number }) & { e?: Efectos };

export const largo = (t: Tramo): number => ('s' in t ? t.s : t.b - t.a);
export const largoTotal = (m: Tramo[]): number => m.reduce((s, t) => s + largo(t), 0);

const MINIMO = 0.001;

// El pedazo [x, y) del montaje, como tramos nuevos.
export function tomar(m: Tramo[], x: number, y: number): Tramo[] {
  const out: Tramo[] = [];
  let off = 0;
  for (const t of m) {
    const l = largo(t);
    const p0 = Math.max(0, x - off);
    const p1 = Math.min(l, y - off);
    if (p1 - p0 > MINIMO) {
      let nuevo: Tramo;
      if ('s' in t) nuevo = { s: p1 - p0 };
      else if (t.r) nuevo = { f: t.f, a: t.b - p1, b: t.b - p0, r: 1 };
      else nuevo = { f: t.f, a: t.a + p0, b: t.a + p1 };
      if (t.e && !('s' in t)) nuevo.e = partirEfectos(t.e, p0 / l, p1 / l);
      out.push(nuevo);
    }
    off += l;
    if (off >= y) break;
  }
  return out;
}

// Juntar lo que quedó pegado (dos pedazos seguidos del mismo archivo, o dos silencios).
export function juntar(m: Tramo[]): Tramo[] {
  const out: Tramo[] = [];
  for (const t of m) {
    if (largo(t) <= MINIMO) continue;
    const u = out[out.length - 1];
    if (u && 's' in u && 's' in t) {
      out[out.length - 1] = { s: u.s + t.s };
      continue;
    }
    if (u && !('s' in u) && !('s' in t) && !u.e && !t.e && u.f === t.f && !!u.r === !!t.r) {
      if (!t.r && Math.abs(u.b - t.a) < MINIMO) {
        out[out.length - 1] = { f: u.f, a: u.a, b: t.b };
        continue;
      }
      if (t.r && Math.abs(u.a - t.b) < MINIMO) {
        out[out.length - 1] = { f: u.f, a: t.a, b: u.b, r: 1 };
        continue;
      }
    }
    out.push({ ...t });
  }
  return out.map((t) => ('s' in t ? { s: redondo(t.s) } : { ...t, a: redondo(t.a), b: redondo(t.b) }));
}
const redondo = (v: number) => Math.round(v * 10000) / 10000;

export function quitar(m: Tramo[], x: number, y: number): Tramo[] {
  const total = largoTotal(m);
  return juntar([...tomar(m, 0, x), ...tomar(m, y, total)]);
}

export function insertar(m: Tramo[], x: number, pedazo: Tramo[]): Tramo[] {
  const total = largoTotal(m);
  return juntar([...tomar(m, 0, x), ...pedazo, ...tomar(m, x, total)]);
}

export function reemplazar(m: Tramo[], x: number, y: number, pedazo: Tramo[]): Tramo[] {
  const total = largoTotal(m);
  return juntar([...tomar(m, 0, x), ...pedazo, ...tomar(m, y, total)]);
}

// Al revés: el orden de los tramos y cada tramo por dentro.
export function darVuelta(pedazo: Tramo[]): Tramo[] {
  return pedazo
    .slice()
    .reverse()
    .map((t): Tramo => {
      if ('s' in t) return { ...t };
      const v: Tramo = t.r ? { f: t.f, a: t.a, b: t.b } : { f: t.f, a: t.a, b: t.b, r: 1 };
      if (t.e) v.e = { ...t.e, ...(t.e.v ? { v: [t.e.v[1], t.e.v[0]] as [number, number] } : {}) };
      return v;
    });
}

// LOS DOS RELOJES. El de lo que se oye (el montaje) y el del archivo `orig`, que es contra el
// que se guardan las anclas: un comentario puesto en el segundo 58 del original sigue en esa
// palabra aunque antes se haya cortado un pedazo. Si ese instante ya no está en el montaje,
// da -1 (quedó fuera, como con el recorte).
export function montajeDesdeOriginal(m: Tramo[], orig: string, t: number): number {
  let off = 0;
  for (const s of m) {
    const l = largo(s);
    if (!('s' in s) && s.f === orig && t >= s.a - MINIMO && t <= s.b + MINIMO) return off + (s.r ? s.b - t : t - s.a);
    off += l;
  }
  return -1;
}
// Y la vuelta. En un silencio o en algo grabado no hay original: se usa el último instante
// del original que sonó antes (y si no hubo, el primero que viene).
export function originalDesdeMontaje(m: Tramo[], orig: string, t: number): number {
  let off = 0;
  let ultimo = -1;
  for (const s of m) {
    const l = largo(s);
    const esOrig = !('s' in s) && s.f === orig;
    if (t <= off + l + MINIMO) {
      if (esOrig) {
        const p = Math.max(0, Math.min(l, t - off));
        return s.r ? s.b - p : s.a + p;
      }
      if (ultimo >= 0) return ultimo;
    } else if (esOrig) ultimo = s.r ? s.a : s.b;
    off += l;
  }
  if (ultimo >= 0) return ultimo;
  const primero = m.find((s) => !('s' in s) && s.f === orig) as { a: number; b: number; r?: 1 } | undefined;
  return primero ? (primero.r ? primero.b : primero.a) : t;
}

// ---- los efectos ----

// El pedazo [f0, f1] (fracciones del tramo) de unos efectos: la envolvente se corta ahí.
function partirEfectos(e: Efectos, f0: number, f1: number): Efectos {
  const out: Efectos = { ...e };
  if (e.v) {
    const [v0, v1] = e.v;
    out.v = [v0 + (v1 - v0) * f0, v0 + (v1 - v0) * f1];
  }
  return out;
}

// Cambiar los efectos de lo que cae en [x, y). `cambiar` recibe los de cada pedazo y en qué
// parte de lo elegido está (fracciones de comienzo y fin), y devuelve los nuevos.
export function conEfecto(m: Tramo[], x: number, y: number, cambiar: (e: Efectos, f0: number, f1: number) => Efectos): Tramo[] {
  const L = y - x;
  if (L <= MINIMO) return m;
  let o = 0;
  const pedazo = tomar(m, x, y).map((t): Tramo => {
    const l = largo(t);
    const f0 = o / L;
    const f1 = (o + l) / L;
    o += l;
    if ('s' in t) return t;
    const e = limpiar(cambiar(t.e || {}, f0, f1));
    const u: Tramo = { f: t.f, a: t.a, b: t.b, ...(t.r ? { r: 1 as const } : {}) };
    if (e) u.e = e;
    return u;
  });
  return reemplazar(m, x, y, pedazo);
}
function limpiar(e: Efectos): Efectos | undefined {
  const out: Efectos = {};
  if (e.g && Math.abs(e.g) > 0.01) out.g = Math.round(e.g * 100) / 100;
  if (e.v && (Math.abs(e.v[0] - 1) > 0.001 || Math.abs(e.v[1] - 1) > 0.001))
    out.v = [Math.round(e.v[0] * 10000) / 10000, Math.round(e.v[1] * 10000) / 10000];
  if (e.eco) out.eco = e.eco;
  return Object.keys(out).length > 0 ? out : undefined;
}

export const amplificar = (m: Tramo[], x: number, y: number, dB: number) =>
  conEfecto(m, x, y, (e) => ({ ...e, g: (e.g || 0) + dB }));

// Un fundido multiplica la envolvente de cada pedazo por la rampa que le toca (en los
// extremos: dos rampas multiplicadas no son una recta, pero para oír no hace diferencia).
export const fundido = (m: Tramo[], x: number, y: number, entrada: boolean) =>
  conEfecto(m, x, y, (e, f0, f1) => {
    const [v0, v1] = e.v || [1, 1];
    const [r0, r1] = entrada ? [f0, f1] : [1 - f0, 1 - f1];
    return { ...e, v: [v0 * r0, v1 * r1] };
  });

export const conEco = (m: Tramo[], x: number, y: number, ms: number, vuelve: number) =>
  conEfecto(m, x, y, (e) => ({ ...e, eco: [Math.round(ms), Math.round(vuelve * 100) / 100] }));

// Cuánto suena un pedazo de tramo con sus efectos, en la fracción `f` (0..1) del tramo: para
// dibujar la onda antes de que el servidor la rearme. El eco no se dibuja.
export function factorEn(e: Efectos | undefined, f: number): number {
  if (!e) return 1;
  let k = e.g ? Math.pow(10, e.g / 20) : 1;
  if (e.v) k *= e.v[0] + (e.v[1] - e.v[0]) * f;
  return k;
}
