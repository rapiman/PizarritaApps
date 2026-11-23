// EL AJUSTE DE UNA FUENTE (2026-10-16; JP: la de La Mansaka «tiene que tener menos espacio entre
// líneas y además tiene que ser más grande», «que vaya en la misma fuente y en todos lados»).
// `fuentes.escala` y `fuentes.interlineado` (%, null = como viene) se vuelven descriptores del
// @font-face en cada lugar que la declara: el estilo de la pizarra, el fondo común y el juego.
//   escala        size-adjust: el tamaño de las letras (y de sus medidas)
//   interlineado  el alto de la línea en % del tamaño de la letra: ascent-override + descent-override
//                 (cuando el texto no fija uno) y, para el texto de la pizarra, su line-height (estilo.ts)
// El reparto arriba/abajo de la línea es el de la fuente (`ascenso`, % sobre la base, que saca
// bin/fuente_medidas.py al subirla); sin él, 70/30 (la mayoría anda cerca).

export type AjusteFuente = { escala?: number | null; interlineado?: number | null; ascenso?: number | null };

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

/** Los descriptores como texto para un @font-face (con un espacio adelante; '' sin ajuste). */
export function descriptoresCss(a: AjusteFuente | null | undefined): string {
  const d = descriptores(a);
  if (!d) return '';
  return ' ' + Object.entries(d).map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}: ${v};`).join(' ');
}

/** Los descriptores para `new FontFace(…, …, descriptores)` (el juego); null sin ajuste. */
export function descriptores(a: AjusteFuente | null | undefined): Record<string, string> | null {
  const e = Number(a?.escala) || 0;
  const i = Number(a?.interlineado) || 0;
  const d: Record<string, string> = {};
  if (e > 0 && e !== 100) d.sizeAdjust = pct(e);
  const arriba = Number(a?.ascenso) > 0 && Number(a?.ascenso) < 100 ? Number(a?.ascenso) / 100 : 0.7;
  if (i > 0) { d.ascentOverride = pct(i * arriba); d.descentOverride = pct(i * (1 - arriba)); d.lineGapOverride = '0%'; }
  return Object.keys(d).length ? d : null;
}
