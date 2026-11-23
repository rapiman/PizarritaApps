// EL ANFITRIÓN «ARCHIVO» (2026-11-23, docs/anfitrion.md, pasos 3a y 3b). Un `Anfitrion` SIN
// Pizarrita: el documento vive en memoria, sale de un archivo y vuelve a un archivo. Sin cuentas,
// sin servidor, sin tiempo real. Es lo que aloja a un programa en cualquier página (entrega/etiqueta.tsx).
//
// El archivo (formato.ts) es un `.json` si el documento no tiene archivos adentro, y un `.zip`
// (documento.json + archivos/) si los tiene: el original, el resultado ya armado y los de las
// piezas. Adentro se nombran por su ruta ('archivos/tema.mp3'); al programa le llegan como
// direcciones que el navegador puede abrir (`documento.archivo.url`, el `archivo` de cada pieza).
//
// Lo que NO tiene, y por eso el programa lo pregunta antes de usar: `vivo`, `lugares`,
// `navegacion`, `ventana`, `armar`, `documento.mezclar`. Sin `armar`, el resultado lo arma el
// programa y lo entrega con `documento.guardarResultado`.
//
// REGLA: este archivo no importa nada de Pizarrita (pruebas/fronteras.prueba.ts).
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnfitrionCtx, type Anfitrion, type ArchivoDocumento, type Pieza } from './anfitrion';
import { VERSION_ARCHIVO, documentoVacio, empacar, rutaLibre, tipoDeNombre, type ArchivoAdentro, type DocumentoArchivo } from './formato';

export { VERSION_ARCHIVO, abrirPaquete, documentoVacio, leerDocumento, paqueteDesdeOriginal } from './formato';
export type { ArchivoAdentro, DocumentoArchivo, Paquete } from './formato';

export type OpcionesArchivo = {
  /** El programa que se aloja ('calculadora'): un archivo de otro programa no se abre acá. */
  programa: string;
  inicial?: DocumentoArchivo | null;
  /** Los archivos de adentro del documento inicial, por ruta. */
  archivos?: ReadonlyMap<string, Uint8Array> | null;
  /** El sitio dice si se puede cambiar o solo mirar. */
  editar?: boolean;
  /** De dónde bajan los plugins WAM (no viajan con la entrega). */
  plugins?: string;
  /** Traducciones, por clave; lo que falte queda con el texto de por defecto. */
  textos?: Record<string, string>;
  /** Hay cambios sin guardar, o dejó de haberlos. */
  alCambiar?: (sucio: boolean) => void;
  alAvisar?: (nivel: 'error' | 'atencion', mensaje: string) => void;
};

/** Lo que el que aloja le pide al anfitrión (con `ref`). */
export type ManejoArchivo = {
  documento(): DocumentoArchivo;
  /** El documento como archivo (`.json`, o `.zip` si lleva archivos adentro: lo dice su `type`), y
   *  queda marcado como guardado. */
  guardar(): Blob;
  sucio(): boolean;
};

const tipoDePieza = (mime: string) => (mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'imagen' : 'archivo');

export const AnfitrionArchivo = forwardRef<ManejoArchivo, { opciones: OpcionesArchivo; children: ReactNode }>(function AnfitrionArchivo({ opciones, children }, ref) {
  const inicial = opciones.inicial || documentoVacio(opciones.programa);
  const [config, setConfig] = useState<Record<string, unknown>>(inicial.config);
  // Las piezas se guardan con la RUTA de su archivo; al programa le llegan con la dirección.
  const [piezas, setPiezas] = useState<Pieza[]>(inicial.piezas);
  const [original] = useState<ArchivoAdentro | undefined>(inicial.archivo);
  const [resultado, setResultado] = useState<ArchivoAdentro | undefined>(inicial.resultado);
  const prefs = useRef<Record<string, unknown>>({ ...inicial.preferencias });
  const ahora = useRef({ config, piezas, resultado, opciones });
  ahora.current = { config, piezas, resultado, opciones };

  // LOS ARCHIVOS DE ADENTRO, por ruta, y la dirección que el navegador le da a cada uno.
  const archivos = useRef<Map<string, Uint8Array> | null>(null);
  if (!archivos.current) archivos.current = new Map(opciones.archivos || []);
  const direcciones = useRef(new Map<string, string>());
  const direccionDe = (ruta: string): string => {
    const ya = direcciones.current.get(ruta);
    if (ya) return ya;
    const bytes = archivos.current?.get(ruta);
    if (!bytes) return '';
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipoDeNombre(ruta) }));
    direcciones.current.set(ruta, url);
    return url;
  };
  const soltarDireccion = (ruta: string) => {
    const url = direcciones.current.get(ruta);
    if (url) URL.revokeObjectURL(url);
    direcciones.current.delete(ruta);
  };
  useEffect(
    () => () => {
      for (const url of direcciones.current.values()) URL.revokeObjectURL(url);
      direcciones.current.clear();
    },
    [],
  );

  const sucio = useRef(false);
  const ensuciar = (si: boolean) => {
    if (sucio.current === si) return;
    sucio.current = si;
    ahora.current.opciones.alCambiar?.(si);
  };

  const oyentes = useRef(new Set<() => void>());
  useEffect(() => {
    for (const f of oyentes.current) f();
  }, [config, piezas, resultado]);

  useImperativeHandle(
    ref,
    () => {
      const documento = (): DocumentoArchivo => {
        const d: DocumentoArchivo = {
          pz: VERSION_ARCHIVO,
          programa: ahora.current.opciones.programa,
          nombre: inicial.nombre,
          config: ahora.current.config,
          piezas: ahora.current.piezas,
          preferencias: prefs.current,
        };
        if (original) d.archivo = original;
        if (ahora.current.resultado) d.resultado = ahora.current.resultado;
        return d;
      };
      return {
        documento,
        guardar: () => {
          const e = empacar({ documento: documento(), archivos: archivos.current || new Map() });
          ensuciar(false);
          return new Blob([e.datos as BlobPart], { type: e.tipo });
        },
        sucio: () => sucio.current,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editar = opciones.editar !== false;
  const programa = opciones.programa;
  const anfitrion = useMemo<Anfitrion>(() => {
    const llave = (clave: string) => `pz:${programa}:${clave}`;
    const cambiarPieza = (id: number, f: (p: Pieza) => Pieza) => {
      setPiezas((ps) => ps.map((p) => (p.id === id ? f(p) : p)));
      ensuciar(true);
    };
    const comoArchivo = (a: ArchivoAdentro): ArchivoDocumento => ({
      ruta: a.ruta,
      url: direccionDe(a.ruta),
      tipo: a.tipo,
      nombre: a.nombre,
      duracion: a.duracion,
      leer: async () => new Blob([(archivos.current?.get(a.ruta) || new Uint8Array()) as BlobPart], { type: a.tipo }),
    });
    const nuevoId = () => ahora.current.piezas.reduce((m, p) => Math.max(m, p.id), 1) + 1;
    return {
      documento: {
        id: 1,
        tipo: programa,
        nombre: inicial.nombre,
        config,
        guardarConfig: (parche) => {
          setConfig((c) => ({ ...c, ...parche }));
          ensuciar(true);
        },
        piezas: piezas.map((p) => (p.archivo ? { ...p, archivo: direccionDe(p.archivo) } : p)),
        piezasDe: () => [],
        guardarPuesta: (id, parche) => cambiarPieza(id, (p) => ({ ...p, puesta: { ...p.puesta, ...parche } })),
        guardarPieza: (id, parche) => cambiarPieza(id, (p) => ({ ...p, config: { ...p.config, ...parche } })),
        reordenar: (ids) => {
          setPiezas((ps) => ps.map((p) => (ids.includes(p.id) ? { ...p, orden: ids.indexOf(p.id) } : p)).sort((a, b) => a.orden - b.orden || a.id - b.id));
          ensuciar(true);
        },
        crearPieza: async (tipo, op = {}) => {
          const id = nuevoId();
          setPiezas((ps) => [...ps, { id, tipo, orden: ps.length, nombre: '', config: op.config || {}, puesta: op.puesta || {}, duenoId: 1 }]);
          ensuciar(true);
          return id;
        },
        sacarPieza: async (id) => {
          // Su archivo queda en memoria (por si se deshace); al guardar va solo lo que se nombra.
          setPiezas((ps) => ps.filter((p) => p.id !== id));
          ensuciar(true);
          return true;
        },
        // El original si hay resultado sigue siendo el original: lo que se muestra es el resultado.
        archivo: original ? comoArchivo(original) : undefined,
        resultado: resultado ? comoArchivo(resultado) : undefined,
        guardarResultado: async (contenido, op = {}) => {
          const mapa = archivos.current;
          if (!mapa) return false;
          const formato = (op.formato || contenido.type.split('/')[1] || 'bin').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
          const bytes = new Uint8Array(await contenido.arrayBuffer());
          const anterior = ahora.current.resultado;
          if (anterior) {
            mapa.delete(anterior.ruta);
            soltarDireccion(anterior.ruta);
          }
          // Cada resultado con su nombre: una dirección ya entregada no cambia de contenido.
          const ruta = rutaLibre(mapa, `resultado.${formato === 'mpeg' ? 'mp3' : formato}`);
          mapa.set(ruta, bytes);
          setResultado({ ruta, tipo: contenido.type || tipoDeNombre(ruta), nombre: op.nombre || ruta.slice(ruta.lastIndexOf('/') + 1) });
          ensuciar(true);
          return true;
        },
        alCambiar: (f) => {
          oyentes.current.add(f);
          return () => {
            oyentes.current.delete(f);
          };
        },
      },
      archivos: {
        elegir: (op) =>
          new Promise<File[]>((listo) => {
            const campo = document.createElement('input');
            campo.type = 'file';
            campo.accept = op.acepta;
            campo.multiple = !!op.varios;
            campo.addEventListener('change', () => listo(Array.from(campo.files || [])));
            campo.addEventListener('cancel', () => listo([]));
            campo.click();
          }),
        // El archivo entra al documento como pieza nueva. (El `recorte` no se aplica acá: el
        // programa que lo pide lo guarda en su `puesta`.)
        agregar: async (archivo, op = {}) => {
          const mapa = archivos.current;
          if (!mapa) return null;
          const bytes = new Uint8Array(await archivo.arrayBuffer());
          const ruta = rutaLibre(mapa, archivo.name);
          mapa.set(ruta, bytes);
          const id = nuevoId();
          const tipo = tipoDePieza(archivo.type || tipoDeNombre(archivo.name));
          setPiezas((ps) => [...ps, { id, tipo, orden: ps.length, nombre: archivo.name, config: {}, puesta: op.puesta || {}, archivo: ruta, duenoId: 1 }]);
          ensuciar(true);
          return id;
        },
        leer: async (pieza) => {
          const ruta = ahora.current.piezas.find((p) => p.id === pieza)?.archivo;
          const bytes = ruta ? archivos.current?.get(ruta) : undefined;
          return bytes ? new Blob([bytes as BlobPart], { type: tipoDeNombre(ruta as string) }) : null;
        },
        contenido: async (nombre) => {
          const bytes = archivos.current?.get(nombre);
          return bytes ? new Blob([bytes as BlobPart], { type: tipoDeNombre(nombre) }) : null;
        },
        direccion: (nombre) => direccionDe(nombre),
        // Queda en el documento mientras la config lo nombre (formato.ts: al guardar va lo nombrado).
        adjuntar: async (contenido, nombre) => {
          const mapa = archivos.current;
          if (!mapa) return null;
          const ruta = rutaLibre(mapa, nombre);
          mapa.set(ruta, new Uint8Array(await contenido.arrayBuffer()));
          ensuciar(true);
          return ruta;
        },
        bajar: (contenido, nombre) => bajar(contenido, nombre),
      },
      sesion: { persona: null, permisos: { ver: true, tocar: editar, editar }, techo: 3 },
      preferencias: {
        leer: (clave, porDefecto, dueno = 'equipo') => {
          if (dueno === 'documento') return clave in prefs.current ? (prefs.current[clave] as typeof porDefecto) : porDefecto;
          try {
            const v = localStorage.getItem(llave(clave));
            return v === null ? porDefecto : (JSON.parse(v) as typeof porDefecto);
          } catch {
            return porDefecto;
          }
        },
        guardar: (clave, valor, dueno = 'equipo') => {
          if (dueno === 'documento') {
            if (valor === null) delete prefs.current[clave];
            else prefs.current[clave] = valor;
            ensuciar(true);
            return;
          }
          try {
            if (valor === null) localStorage.removeItem(llave(clave));
            else localStorage.setItem(llave(clave), JSON.stringify(valor));
          } catch {
            // Sin lugar o sin permiso: la preferencia no se recuerda, nada más.
          }
        },
      },
      avisos: {
        error: (mensaje) => (ahora.current.opciones.alAvisar ? ahora.current.opciones.alAvisar('error', mensaje) : console.error(mensaje)),
        atencion: (mensaje) => (ahora.current.opciones.alAvisar ? ahora.current.opciones.alAvisar('atencion', mensaje) : console.warn(mensaje)),
        confirmar: (mensaje) => Promise.resolve(window.confirm(mensaje)),
      },
      texto: (clave, porDefecto) => ahora.current.opciones.textos?.[clave] ?? porDefecto,
      recursos: { plugins: opciones.plugins || '' },
      gesto: { inicio: () => {}, fin: () => {} },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, piezas, resultado, editar, programa, opciones.plugins]);

  return <AnfitrionCtx.Provider value={anfitrion}>{children}</AnfitrionCtx.Provider>;
});

/** Entregarle un archivo a la persona (la descarga del navegador). */
export function bajar(contenido: Blob, nombre: string): void {
  const url = URL.createObjectURL(contenido);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
