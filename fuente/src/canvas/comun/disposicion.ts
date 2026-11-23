import { leerPref } from './preferencias';

// (Vive en canvas/comun desde el 2026-11-23: la usan las reglas de Edit Pro, que viajan fuera de
// Pizarrita. Sin una idea anotada, lo que se cambia queda en la página. Quien anota: Idea.tsx.)

// LA DISPOSICIÓN DE UNA IDEA (2026-10-08, JP: «lo compartido debería guardarse»; «es propio de su
// idea y sus bolsas»). Cómo está armado por dentro un programa —en Edit Pro la vista onda o
// multipista, los tamaños de los paneles, qué paneles se ven, el mixer abajo, la casetera y las
// reglas; en la caja de ritmos el ancho del navegador, el lugar y el ancho del rack y dónde quedó
// cada ventana de su escritorio— es de la IDEA, no de cada navegador: todos la ven igual.
//
// Vive en `ideas.config.disposicion` (un objeto, clave → valor) y se guarda con el parche de
// configuración de siempre (sin versión ni novedad). La guarda quien puede configurar la idea
// (`permisos.mandar`, lo mismo que pide el servidor); quien no puede, igual mueve y achica a su
// gusto mientras está, pero no se guarda.
//
// Lo de cada aparato (la latencia, las entradas de audio) y lo de cada persona (metrónomo, cuenta
// antes de grabar, tomas) sigue en el navegador (preferencias.ts).
//
// Lo que había en este navegador de antes se usa mientras la idea no tenga lo suyo: nadie pierde
// cómo lo tenía; la primera vez que quien puede lo cambia, queda en la idea.

type Registro = {
  /** La configuración de la idea, la de ahora. */
  config: () => Record<string, unknown>;
  /** Guarda un parche de configuración (Idea.tsx → guardarConfig). */
  guardar: (parche: Record<string, unknown>) => void;
  /** ¿Quien usa puede configurar la idea? */
  puede: () => boolean;
};

const registros = new Map<number, Registro>();
/** Lo cambiado en esta página (con o sin permiso): manda sobre lo de la idea mientras se está. */
const local = new Map<string, unknown>();
const esperas = new Map<number, { t: number; parche: Record<string, unknown> }>();

/** La tarjeta de una idea se anota en cada dibujo (Idea.tsx): así un programa puede leer y
 *  guardar su disposición sabiendo solo el número. Queda la última. */
export function anotarDisposicion(idea: number, r: Registro): void {
  if (idea) registros.set(idea, r);
}

/** El número de idea de una llave `bolsa:idea` (o de un número suelto). */
export function ideaDeLlave(llave: string | number | undefined | null): number {
  if (llave === undefined || llave === null) return 0;
  const m = /(\d+)\s*$/.exec(String(llave));
  return m ? Number(m[1]) : 0;
}

function deLaIdea(idea: number): Record<string, unknown> {
  const c = registros.get(idea)?.config();
  const d = c?.disposicion;
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : {};
}

/**
 * Lee una clave de la disposición de la idea. `legado`: dónde estaba antes en el navegador
 * (`[programa, clave, idea?]` de preferencias.ts), para usarlo mientras la idea no tenga lo suyo.
 */
export function leerDisposicion<T>(idea: number, clave: string, def: T, legado?: [string, string, (string | number)?]): T {
  const k = `${idea}|${clave}`;
  if (local.has(k)) return local.get(k) as T;
  const d = idea ? deLaIdea(idea) : {};
  if (clave in d && d[clave] !== null && (def === null || def === undefined || typeof d[clave] === typeof def)) return d[clave] as T;
  if (legado) {
    try {
      const v = leerPref<T | undefined>(legado[0], legado[1], undefined, legado[2] !== undefined ? { idea: legado[2] } : {});
      if (v !== undefined && v !== null && (def === null || def === undefined || typeof v === typeof def)) return v;
    } catch {
      /* sin almacenamiento */
    }
  }
  return def;
}

/** Guarda una clave (null la borra). Se junta lo de medio segundo en un solo parche. */
export function guardarDisposicion(idea: number, clave: string, valor: unknown): void {
  const k = `${idea}|${clave}`;
  local.set(k, valor);
  const r = idea ? registros.get(idea) : undefined;
  if (!r || !r.puede()) return;
  const e = esperas.get(idea) || { t: 0, parche: {} };
  window.clearTimeout(e.t);
  e.parche[clave] = valor;
  e.t = window.setTimeout(() => {
    esperas.delete(idea);
    const rr = registros.get(idea);
    if (!rr || !rr.puede()) return;
    const todo: Record<string, unknown> = { ...deLaIdea(idea) };
    for (const [c, v] of Object.entries(e.parche)) {
      if (v === null || v === undefined) delete todo[c];
      else todo[c] = v;
    }
    rr.guardar({ disposicion: Object.keys(todo).length ? todo : null });
  }, 500);
  esperas.set(idea, e);
}

// Al irse de la página, lo que esperaba se guarda ya.
window.addEventListener('pagehide', () => {
  for (const [idea, e] of esperas) {
    window.clearTimeout(e.t);
    const r = registros.get(idea);
    if (!r || !r.puede()) continue;
    const todo: Record<string, unknown> = { ...deLaIdea(idea) };
    for (const [c, v] of Object.entries(e.parche)) {
      if (v === null || v === undefined) delete todo[c];
      else todo[c] = v;
    }
    r.guardar({ disposicion: Object.keys(todo).length ? todo : null });
  }
  esperas.clear();
});
