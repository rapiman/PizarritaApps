import { useEffect, useState } from 'react';
import { descriptoresCss } from './fuenteAjuste';

// TODAS LAS FUENTES DEL FONDO COMÚN, A MANO (2026-09-28; JP: «en presentación y en este sería bueno
// poder cambiar la fuente del texto»; «las normales y las de los temas y todas las que se han
// subido»). Un texto puede llevar cualquiera (`font-family: pz-f<id>` en su HTML) y un título del
// video también, así que la página declara un `@font-face` por cada una (el navegador solo baja el
// archivo de la que se usa). `sp_fuentes` con filtro '*' las trae todas, sin tope.

export type FuenteComun = { fuente: number; nombre: string; archivo: string; escala?: number | null; interlineado?: number | null; ascenso?: number | null };

let lista: FuenteComun[] | null = null;
let pedido: Promise<FuenteComun[]> | null = null;
const avisos = new Set<(l: FuenteComun[]) => void>();

function formato(archivo: string): string {
  const ext = archivo.split('.').pop()?.toLowerCase();
  if (ext === 'woff2') return 'woff2';
  if (ext === 'woff') return 'woff';
  if (ext === 'otf') return 'opentype';
  return 'truetype';
}

export const familiaDe = (id: number) => `pz-f${id}`;

function declarar(l: FuenteComun[]) {
  let style = document.getElementById('pz_fuentes_comunes') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'pz_fuentes_comunes';
    document.head.appendChild(style);
  }
  style.textContent = l
    .map((f) => {
      const seguro = f.archivo.replace(/[^A-Za-z0-9._-]/g, '');
      const cara = (archivo: string, extra = '') =>
        `@font-face { font-family: '${familiaDe(f.fuente)}'; src: url('images/fuentes/${archivo}') format('${formato(archivo)}');${extra}${descriptoresCss(f)} font-display: swap; }`;
      // Las normales traen su negrita y su cursiva de verdad (bin/fuentes_comunes.sh las copia al
      // lado: comun-liberation-sans-bold.ttf …); las demás, las imita el navegador.
      const m = /^(comun-liberation-(?:sans|serif|mono))\.ttf$/.exec(seguro);
      if (!m) return cara(seguro);
      return [
        cara(seguro),
        cara(`${m[1]}-bold.ttf`, ' font-weight: 700;'),
        cara(`${m[1]}-italic.ttf`, ' font-style: italic;'),
        cara(`${m[1]}-bolditalic.ttf`, ' font-weight: 700; font-style: italic;'),
      ].join('\n');
    })
    .join('\n');
}

// (2026-11-23) Cómo se piden lo instala Pizarrita (main.tsx, api/cuentaPizarrita.ts): este archivo
// viaja con los programas fuera de Pizarrita, donde no hay API. Sin eso, no hay fuentes comunes.
type TraerFuentes = () => Promise<Record<string, unknown>[] | null>;
let traerFuentes: TraerFuentes | null = null;
export function ponerTraerFuentes(f: TraerFuentes): void {
  traerFuentes = f;
}

export function cargarFuentesComunes(de_nuevo = false): Promise<FuenteComun[]> {
  if (lista && !de_nuevo) return Promise.resolve(lista);
  if (pedido && !de_nuevo) return pedido;
  if (!traerFuentes) return Promise.resolve(lista || []);
  const traer = traerFuentes;
  pedido = new Promise((listo) => {
    void traer().then((filas) => {
      if (!filas) {
        pedido = null;
        listo(lista || []);
        return;
      }
      const l = (filas as FuenteComun[])
        .filter((f) => f && f.fuente && f.archivo)
        .map((f) => ({ fuente: Number(f.fuente), nombre: String(f.nombre), archivo: String(f.archivo),
          escala: f.escala == null ? null : Number(f.escala), interlineado: f.interlineado == null ? null : Number(f.interlineado),
          ascenso: f.ascenso == null ? null : Number(f.ascenso) }));
      lista = l;
      declarar(l);
      avisos.forEach((a) => a(l));
      listo(l);
    });
  });
  return pedido;
}

// Que la fuente ya esté cargada (para dibujar con ella en un lienzo).
export async function fuenteLista(id: number | null | undefined, muestra = 'Aa'): Promise<void> {
  if (!id) return;
  await cargarFuentesComunes();
  try {
    await document.fonts.load(`32px '${familiaDe(id)}'`, muestra);
  } catch {
    /* sin la fuente se dibuja con la de respaldo */
  }
}

export function useFuentesComunes(): FuenteComun[] {
  const [l, setL] = useState<FuenteComun[]>(lista || []);
  useEffect(() => {
    avisos.add(setL);
    void cargarFuentesComunes().then(setL);
    return () => {
      avisos.delete(setL);
    };
  }, []);
  return l;
}
