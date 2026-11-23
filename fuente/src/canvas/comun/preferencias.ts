// LAS PREFERENCIAS (§15 de la especificación de programas, aprobada; 2026-10-02).
//
// Cuatro dueños:
//   - la PERSONA, en su cuenta (viaja entre equipos): sus colores, el correo, el idioma, los
//     colores del trazo… → `dueno: 'cuenta'`;
//   - la persona EN ESTE NAVEGADOR (depende de la pantalla): vistas recordadas, tamaños de paneles,
//     el mixer abajo, el zoom… → `dueno: 'navegador'` (el de siempre);
//   - la IDEA (`config`, la cambia quien manda): forma, piel, vista por defecto → no vive acá, es
//     `usePrograma().config`;
//   - el SISTEMA: sus perillas (`--pz-*`, estilo.ts) → tampoco vive acá.
// Los anónimos solo tienen el navegador.
//
// Una sola manera de leer y escribir, con llaves `pz:<programa>:<clave>[:<idea>]`. El valor se
// guarda como JSON. Las claves sueltas de antes (`pz_*`, `pizarrita_*`, `mesa_3d`…) se leen una vez
// y se mudan a la llave nueva (LEGADO, abajo): nadie pierde lo que tenía elegido.
//
// Lo de la CUENTA vive en el servidor (`preferencias_cuenta`, migración 2026-10-02) y además en el
// navegador, que es de donde se lee siempre (rápido y sin esperar): al cargar, lo del servidor manda
// (`sincronizarCuenta`); al guardar, se sube. Lo que estaba solo en este navegador de antes se sube
// la primera vez.
import { useCallback, useSyncExternalStore } from 'react';
import { apiGet, apiPostAlSalir } from '../../api/transporte';
import { pedirApi } from './pedirApi';

export type Dueno = 'navegador' | 'cuenta';
export interface OpcionesPref {
  /** Una preferencia de UNA idea (la vista de esa caja, la posición de esa ventana). */
  idea?: number | string;
  dueno?: Dueno;
}

export function llavePref(programa: string, clave: string, idea?: number | string): string {
  return `pz:${programa}:${clave}${idea !== undefined && idea !== '' ? ':' + idea : ''}`;
}

// LO DE ANTES → la llave nueva, y cómo se leía el valor crudo. Lo que no está acá sigue donde estaba
// hasta que se lo pase (cada mudanza, en el CHANGELOG).
type Legado = { vieja: string; leer: (crudo: string) => unknown };
const siNo = (c: string) => c === '1';
const numero = (c: string) => (Number.isFinite(Number(c)) ? Number(c) : null);
const json = (c: string): unknown => {
  try {
    return JSON.parse(c);
  } catch {
    return null;
  }
};
const LEGADO: Record<string, Legado> = {
  'pz:mesa:3d': { vieja: 'mesa_3d', leer: siNo },
  'pz:audio:espectro': { vieja: 'pz_espectro', leer: siNo },
  'pz:ritmo:navegadorAncho': { vieja: 'pz_navegador_ancho', leer: numero },
  'pz:editpro:latencia': { vieja: 'pz_latencia', leer: numero },
  'pz:editpro:casetera': { vieja: 'pz_mp_casetera', leer: siNo },
  'pz:editpro:mixerAbajo': { vieja: 'pz_mp_mixer_abajo', leer: siNo },
  'pz:editpro:mixerOculto': { vieja: 'pz_mp_mixer_oculto', leer: siNo },
  'pz:editpro:metronomo': { vieja: 'pz_metronomo', leer: siNo },
  'pz:editpro:cuenta': { vieja: 'pz_cuenta', leer: siNo },
  'pz:editpro:tomas': { vieja: 'pz_tomas', leer: siNo },
  'pz:sistema:tiempoReal': { vieja: 'pizarrita_tiempo_real', leer: (c) => (c === '1' ? true : c === '0' ? false : null) },
  'pz:ayuda:cartelVisto': { vieja: 'pizarrita_cartel_visto', leer: (c) => c === 'si' },
  'pz:editpro:reglas': { vieja: 'pz_reglas', leer: (c) => c },
  'pz:dibujo:color': { vieja: 'pizarrita_dibujo_color', leer: (c) => c },
  'pz:dibujo:grosor': { vieja: 'pizarrita_dibujo_grosor', leer: numero },
  'pz:dibujo:forma': { vieja: 'pizarrita_dibujo_forma', leer: (c) => c },
  'pz:editpro:tamanos': { vieja: 'pz_ev_tamanos', leer: json },
  'pz:sistema:idiomaContenido': { vieja: 'pz_idioma_contenido', leer: (c) => c },
  'pz:editpro:vistas': { vieja: 'pz_ev_vistas', leer: json },
};
// Las de antes que llevaban la idea en el nombre.
const LEGADO_IDEA: { nueva: RegExp; vieja: (m: RegExpExecArray) => string; leer: (crudo: string) => unknown }[] = [
  { nueva: /^pz:editpro:vista:(\d+)$/, vieja: (m) => `pz_ep_vista_${m[1]}`, leer: (c) => c },
  { nueva: /^pz:editpro:entradas:(\d+)$/, vieja: (m) => `pz_mp_entradas_${m[1]}`, leer: json },
  // El estado de las ventanas (§7): dónde quedó cada una, en este navegador.
  { nueva: /^pz:ventana:escritorio:(.+)$/, vieja: (m) => `pz_escritorio_${m[1]}`, leer: json },
  { nueva: /^pz:ventana:flotante(2?):(.+)$/, vieja: (m) => `pz_flotante${m[1]}_${m[2]}`, leer: json },
  { nueva: /^pz:ritmo:rackPos(?::(.+))?$/, vieja: (m) => `pz_rack3_${m[1] || ''}`, leer: json },
  { nueva: /^pz:ritmo:rackAncho(?::(.+))?$/, vieja: (m) => `pz_rack_ancho_${m[1] || ''}`, leer: numero },
];
function legadoDe(llave: string): Legado | undefined {
  if (LEGADO[llave]) return LEGADO[llave];
  for (const l of LEGADO_IDEA) {
    const m = l.nueva.exec(llave);
    if (m) return { vieja: l.vieja(m), leer: l.leer };
  }
  return undefined;
}

const oyentes = new Map<string, Set<() => void>>();
function avisar(llave: string): void {
  oyentes.get(llave)?.forEach((f) => f());
}
// Otra pestaña cambió algo: se avisa igual.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith('pz:')) avisar(e.key);
  });
}

function crudo(llave: string): string | null {
  try {
    return window.localStorage.getItem(llave);
  } catch {
    return null;
  }
}

// La caché guarda el valor ya leído, para que `useSyncExternalStore` reciba siempre el mismo objeto
// mientras no cambie (un JSON.parse por render daría un objeto nuevo cada vez y un bucle).
const cache = new Map<string, { crudo: string | null; valor: unknown }>();

function leerLlave(llave: string): { hay: boolean; valor: unknown } {
  const c = crudo(llave);
  const vista = cache.get(llave);
  if (vista && vista.crudo === c) return { hay: c !== null, valor: vista.valor };
  if (c !== null) {
    let valor: unknown = null;
    try {
      valor = JSON.parse(c);
    } catch {
      valor = c;
    }
    cache.set(llave, { crudo: c, valor });
    return { hay: true, valor };
  }
  // Nada con la llave nueva: ¿había algo con la de antes? Se muda.
  const leg = legadoDe(llave);
  if (leg) {
    const v = crudo(leg.vieja);
    if (v !== null) {
      const valor = leg.leer(v);
      if (valor !== null && valor !== undefined) {
        escribirLlave(llave, valor, false);
        try {
          window.localStorage.removeItem(leg.vieja);
        } catch {
          /* sin almacenamiento: queda la vieja, y se vuelve a mudar la próxima */
        }
        return { hay: true, valor };
      }
    }
  }
  cache.set(llave, { crudo: null, valor: undefined });
  return { hay: false, valor: undefined };
}

function escribirLlave(llave: string, valor: unknown, aviso = true): void {
  const nada = valor === null || valor === undefined;
  const texto = nada ? null : JSON.stringify(valor);
  try {
    if (texto === null) window.localStorage.removeItem(llave);
    else window.localStorage.setItem(llave, texto);
  } catch {
    /* modo privado o almacenamiento lleno: la preferencia dura lo que la página */
  }
  // La caché queda con lo escrito (el mismo objeto): así el próximo render lo ve igual.
  cache.set(llave, { crudo: crudo(llave) ?? texto, valor: nada ? undefined : valor });
  if (aviso) avisar(llave);
}

// ---- La cuenta ------------------------------------------------------------------------------
// Las llaves que son de la persona (viajan entre equipos). Además, cualquiera guardada con
// `dueno: 'cuenta'`.
const DE_LA_CUENTA = new Set(['pz:dibujo:color', 'pz:dibujo:grosor', 'pz:dibujo:forma']);
type W = { sesion?: string; getIdiomaValido?: () => string };
const conSesion = () => !!(window as unknown as W).sesion;
const subiendo = new Map<string, number>();
function subir(llave: string): void {
  if (!conSesion()) return;
  window.clearTimeout(subiendo.get(llave));
  // Un arrastre de la perilla del grosor no sube cada paso: lo último, al parar.
  subiendo.set(
    llave,
    window.setTimeout(() => {
      subiendo.delete(llave);
      const c = crudo(llave);
      void pedirApi('guardardato_preferencia', { llave, valor: c ?? '' }).catch(() => undefined);
    }, 800),
  );
}
// Al irse de la página (navegar a otra pizarrita la recarga), lo que esperaba para subir se
// sube ya: si no, la cuenta quedaba con lo de antes y, al volver, eso pisaba lo de este navegador.
window.addEventListener('pagehide', () => {
  const w = window as unknown as W;
  for (const [llave, t] of subiendo) {
    window.clearTimeout(t);
    const c = crudo(llave);
    apiPostAlSalir('guardardato_preferencia', { llave, valor: c ?? '', sesion: w.sesion || '', idioma: w.getIdiomaValido?.() ?? 'ES' });
  }
  subiendo.clear();
});
let sincronizada = false;
/** Trae las preferencias de la cuenta y las deja en el navegador (lo del servidor manda). La sesión
 *  la pone el jQuery al estar lista la página (rutinas.js), que puede ser después de que arranca
 *  React: se espera un poco (hasta 15 s) antes de darse por anónimo. */
export function sincronizarCuenta(intento = 0): void {
  if (sincronizada) return;
  if (!conSesion()) {
    if (intento < 30) window.setTimeout(() => sincronizarCuenta(intento + 1), 500);
    return;
  }
  sincronizada = true;
  const w = window as unknown as W;
  apiGet<{ llave: string; valor: string }>('consulta_preferencias', { sesion: w.sesion || '', idioma: w.getIdiomaValido?.() ?? 'ES' }).done((r) => {
    const filas = Array.isArray(r.rows) ? r.rows : [];
    const enServidor = new Set<string>();
    for (const f of filas) {
      if (!f.llave || typeof f.valor !== 'string') continue;
      enServidor.add(f.llave);
      DE_LA_CUENTA.add(f.llave);
      if (crudo(f.llave) === f.valor) continue;
      try {
        window.localStorage.setItem(f.llave, f.valor);
      } catch {
        /* sin almacenamiento */
      }
      cache.delete(f.llave);
      avisar(f.llave);
    }
    // Lo que este navegador tenía y la cuenta todavía no: se sube (la primera vez). Lee la llave, por
    // si estaba con su nombre de antes y hay que mudarla.
    for (const llave of DE_LA_CUENTA) {
      if (enServidor.has(llave)) continue;
      if (leerLlave(llave).hay) subir(llave);
    }
  });
}

/** Avisa cuando cambia una preferencia (aquí, en otra pestaña o al llegar la de la cuenta). */
export function alCambiarPref(programa: string, clave: string, f: () => void, op: OpcionesPref = {}): () => void {
  const llave = llavePref(programa, clave, op.idea);
  let s = oyentes.get(llave);
  if (!s) oyentes.set(llave, (s = new Set()));
  s.add(f);
  return () => {
    s!.delete(f);
  };
}

/** Lee una preferencia; `def` si no hay nada guardado (o si lo guardado no es del mismo tipo). */
export function leerPref<T>(programa: string, clave: string, def: T, op: OpcionesPref = {}): T {
  const { hay, valor } = leerLlave(llavePref(programa, clave, op.idea));
  if (!hay) return def;
  if (def !== null && def !== undefined && typeof valor !== typeof def) return def;
  return valor as T;
}

/** Guarda una preferencia (null la borra y vuelve al defecto). */
export function guardarPref<T>(programa: string, clave: string, valor: T | null, op: OpcionesPref = {}): void {
  const llave = llavePref(programa, clave, op.idea);
  const antes = crudo(llave);
  escribirLlave(llave, valor);
  if (op.dueno === 'cuenta') DE_LA_CUENTA.add(llave);
  if (DE_LA_CUENTA.has(llave) && crudo(llave) !== antes) subir(llave);
}

/** La preferencia como estado de React: se actualiza si cambia en otra parte o en otra pestaña. */
export function usePreferencia<T>(programa: string, clave: string, def: T, op: OpcionesPref = {}): [T, (v: T | null) => void] {
  const llave = llavePref(programa, clave, op.idea);
  const suscribir = useCallback(
    (f: () => void) => {
      let s = oyentes.get(llave);
      if (!s) oyentes.set(llave, (s = new Set()));
      s.add(f);
      return () => {
        s!.delete(f);
      };
    },
    [llave],
  );
  const leer = useCallback(() => leerLlave(llave), [llave]);
  // `leerLlave` devuelve un objeto nuevo cada vez: lo estable es el valor de la caché.
  const valor = useSyncExternalStore(suscribir, () => {
    const r = leer();
    return r.hay ? r.valor : undefined;
  });
  const v = valor === undefined || (def !== null && def !== undefined && typeof valor !== typeof def) ? def : (valor as T);
  const poner = useCallback(
    (x: T | null) => {
      const antes = crudo(llave);
      escribirLlave(llave, x);
      if (op.dueno === 'cuenta') DE_LA_CUENTA.add(llave);
      if (DE_LA_CUENTA.has(llave) && crudo(llave) !== antes) subir(llave);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [llave, op.dueno],
  );
  return [v, poner];
}
