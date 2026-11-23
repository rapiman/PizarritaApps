// Una escritura con sesión, como promesa. Desde el 2026-09-25 va directo por el
// transporte propio (`api/transporte.ts`, fetch), sin pasar por jQuery.
//
// Rechaza sin sesión (sin avisar: quien la llama decide qué mostrar) y si el pedido no
// llega. El CSRF lo renueva el transporte en cada respuesta.

import { apiPost, huboError as huboErrorTransporte, type Respuesta } from '../../api/transporte';

export type RespuestaApi<F = Record<string, unknown>> = Respuesta<F>;

type Ventana = {
  sesion?: string;
  getIdiomaValido?: () => string;
};

export function pedirApi<F = Record<string, unknown>>(
  cual: string,
  datos: Record<string, unknown>,
): Promise<RespuestaApi<F>> {
  const w = window as unknown as Ventana;
  if (!w.sesion) return Promise.reject(new Error('sin sesion'));
  return apiPost<F>(cual, {
    ...datos,
    sesion: w.sesion,
    idioma: w.getIdiomaValido?.() ?? 'ES',
  });
}

// Un error del servidor viene como una fila sola con `error`. Cero filas con error 0 es
// una lista vacia, que es otra cosa y no es un problema.
export function huboError<F>(d: RespuestaApi<F>): boolean {
  return huboErrorTransporte(d);
}
