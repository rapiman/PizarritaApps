// EL TIEMPO ESCRITO (2026-10-03, bloque G6 del progreso de los programas): las maneras de mostrar un
// tiempo, en un solo lugar. Antes había diez copias (el reproductor, la onda, PizarriSound, Edit Pro,
// la canción, la cita, las grabadoras…), algunas iguales y otras con detalles distintos.
//   mmss(segundos)          → 3:07      (lo cumplido: hacia abajo; `redondear` para el más cercano)
//   mmssDec(segundos, dec)  → 3:07.25   (con decimales: la cita, 2; los editores, 3)
//   hhmmss(milisegundos)    → 00:03:07  (el reloj de la grabadora)
// Un tiempo que no es número, o negativo, se muestra como cero.

const limpio = (t: number) => (Number.isFinite(t) && t > 0 ? t : 0);
const dos = (n: number) => String(n).padStart(2, '0');

export function mmss(segundos: number, op: { redondear?: boolean } = {}): string {
  const t = op.redondear ? Math.round(limpio(segundos)) : Math.floor(limpio(segundos));
  return `${Math.floor(t / 60)}:${dos(t % 60)}`;
}

export function mmssDec(segundos: number, decimales: number): string {
  const t = limpio(segundos);
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(decimales).padStart(decimales + 3, '0')}`;
}

// Con centésimas, para señalar un momento (un ancla, una selección): 3:07.25.
export function fmtFino(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export function hhmmss(ms: number): string {
  const total = Math.floor(limpio(ms) / 1000);
  return `${dos(Math.floor(total / 3600))}:${dos(Math.floor(total / 60) % 60)}:${dos(total % 60)}`;
}
