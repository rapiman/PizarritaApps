// EL ANFITRIÓN (2026-11-23, JP: «tener una comunicación que no dependa de Pizarrita»; norma y
// fichas en el proyecto: claude/pizarrita-programas-fichas.md; en el repo, docs/anfitrion.md).
//
// Un PROGRAMA (la caja de ritmos, Edit Pro, un juego…) no sabe dónde vive. Todo lo que necesita de
// afuera se lo pide al ANFITRIÓN, que es este contrato. Hay dos anfitriones:
//   · Pizarrita System (anfitrion/pizarrita.tsx, por hacer): lo arma con lo de siempre —la tarjeta
//     (`usePrograma()`), la API, el tablero, el tiempo real—;
//   · «archivo» (por hacer): sin Pizarrita, en otro sitio; el documento es un archivo que se abre y
//     se baja, sin cuentas ni tiempo real.
// Lo que no es de ningún anfitrión sino piezas que viajan con el programa (perillas, campos,
// menús, el contexto de audio) es el KIT: canvas/comun y canvas/audio.
//
// LOS NIVELES (norma del 2026-11-23): 0 ver · 1 usar sin cambiar el contenido (es el «juego») ·
// 2 edición simple en el lugar · 3 el programa completo, en ventana aparte. «Tocar» abre el 1 y
// «editar» abre el 2 y el 3. Mover, girar, agrandar y configurar la tarjeta son de la pizarra, no
// del programa: por eso acá no hay «mandar».
//
// LO OPCIONAL: un grupo con `?` puede faltar (en «archivo» no hay `vivo` ni `lugares`). El programa
// pregunta antes de usarlo y, si falta, no muestra ese botón. Lo mismo con los servicios de otros
// programas (servicios.ts).
//
// REGLA: este archivo no importa nada de Pizarrita (ni tablero, ni api, ni programas); lo revisa
// pruebas/fronteras.prueba.ts.
import { createContext, useContext } from 'react';

export type Nivel = 0 | 1 | 2 | 3;

export type Permisos = {
  /** Nivel 0: se ve. */
  ver: boolean;
  /** Nivel 1: se usa y lo que se toca queda como juego. */
  tocar: boolean;
  /** Niveles 2 y 3: se cambia el contenido. */
  editar: boolean;
};

// UNA PIEZA: lo que el documento tiene pegado adentro y el programa trata como suyo (las filas de
// la caja, las partes de una canción, los clips de un montaje, las pistas de una playlist). En
// Pizarrita es una idea pegada: `config` es la de la idea (qué es: el plugin de un instrumento) y
// `puesta` la de cómo está puesta ACÁ (el patrón de esa fila en esta caja). Van separadas a
// propósito: la misma pieza puede estar en dos documentos con puestas distintas.
export interface Pieza {
  id: number;
  tipo: string;
  orden: number;
  nombre: string;
  config: Record<string, unknown>;
  puesta: Record<string, unknown>;
  /** De dónde se baja su archivo (sonido, video, imagen), si tiene. */
  archivo?: string;
  /** Cuánto dura el archivo, en segundos, si se sabe. */
  duracion?: number;
  /** El documento donde está puesta (en una canción, la caja de esa fila). */
  duenoId: number;
  /** Es de otro documento y acá está prestada: su `config` no se toca desde acá. */
  prestada?: boolean;
}

// ORIGINAL, PROYECTO Y RESULTADO (2026-11-23): lo mismo en audio, imagen y video. El ORIGINAL es
// el archivo que llegó y no se toca. El PROYECTO es lo que se edita sin destruir (cortes, capas,
// el montaje: `config` más las piezas). El RESULTADO es lo armado desde el proyecto (lo que ve y
// oye quien solo mira). Lo arma el programa (`guardarResultado`) o, si el anfitrión sabe hacerlo,
// el anfitrión (`armar`: en Pizarrita, ffmpeg en el servidor).
export interface ArchivoDocumento {
  /** El NOMBRE con que el documento lo nombra por dentro (el `f` de un tramo de un montaje): en
   *  Pizarrita, su ruta en el servidor; en «archivo», su ruta en el zip. No cambia nunca. */
  ruta: string;
  /** De dónde se baja ahora (en «archivo» es una dirección del navegador, que dura lo que la página). */
  url: string;
  /** Su tipo MIME ('audio/mpeg', 'image/png'…), si se sabe. */
  tipo: string;
  nombre: string;
  duracion?: number;
  /** El contenido entero. */
  leer(): Promise<Blob>;
}

// EL DOCUMENTO: los datos del programa, sin saber dónde se guardan. Guardar es cosa del anfitrión
// (la base de Pizarrita, un archivo). Todo guardado es optimista: el programa ya mostró el cambio.
export interface DocumentoAnfitrion {
  id: number;
  tipo: string;
  nombre: string;
  config: Record<string, unknown>;
  /** Cambia claves de la config del documento. */
  guardarConfig(parche: Record<string, unknown>): void;
  /** Las piezas de este documento, en orden. */
  piezas: Pieza[];
  /** Las piezas de una pieza que a su vez las tiene (las filas de una caja pegada en una canción). */
  piezasDe(id: number): Pieza[];
  guardarPuesta(pieza: number, parche: Record<string, unknown>): void;
  guardarPieza(pieza: number, parche: Record<string, unknown>): void;
  reordenar(ids: number[]): void;
  /** Una pieza nueva adentro (un instrumento, una fila de un MIDI). Su número, o null. */
  crearPieza(tipo: string, op?: { config?: Record<string, unknown>; puesta?: Record<string, unknown> }): Promise<number | null>;
  /** Sacarla de este documento (en Pizarrita va a la papelera). */
  sacarPieza(id: number): Promise<boolean>;
  /** EL ARCHIVO del documento (el audio, la imagen, el video), si tiene. Es el ORIGINAL: no se
   *  pisa nunca. Lo que se edita es el proyecto (`config` y las piezas). */
  archivo?: ArchivoDocumento;
  /** EL RESULTADO ya armado, si hay: es lo que se muestra a quien solo mira o escucha (JP,
   *  2026-11-23: «es más fácil que mostremos lo que ya se generó»). Sin él, se muestra el original. */
  resultado?: ArchivoDocumento;
  /** Entregar el RESULTADO ya armado por el programa (la mezcla, la imagen acoplada, el video):
   *  el anfitrión lo guarda como versión nueva (en «archivo», lo deja para bajar). Falta si el
   *  documento no tiene resultado (la caja). */
  guardarResultado?(contenido: Blob, op?: { formato?: string; nombre?: string }): Promise<boolean>;
  /** MEZCLAR un cambio con lo guardado del lado del anfitrión, para que dos personas a la vez no
   *  se pisen (en Pizarrita, una operación del servidor). Si falta, el programa aplica el cambio
   *  por su cuenta y guarda con `guardarConfig`. */
  mezclar?(cambios: Record<string, unknown>): Promise<boolean>;
  /** El JUEGO (nivel 1): lo tocado sin editar; null vuelve a la base. Falta si el programa no juega. */
  juego?: { estado: unknown; guardar(j: unknown): void };
  /** Avisar cuando el documento cambió por fuera (otra persona, otra pestaña). Devuelve cómo dejar de oír. */
  alCambiar(f: () => void): () => void;
}

// LOS ARCHIVOS: sonidos, videos e imágenes que entran al documento, y lo que el programa exporta.
export interface ArchivosAnfitrion {
  /** Que la persona elija archivos de su equipo. */
  elegir(op: { acepta: string; varios?: boolean }): Promise<File[]>;
  /** Guardar un archivo como pieza nueva del documento (en Pizarrita se sube). Su número, o null. */
  agregar(archivo: File, op?: { puesta?: Record<string, unknown>; recorte?: [number, number] }): Promise<number | null>;
  /** El contenido del archivo de una pieza (un clip, una capa, un sonido); null si no tiene. */
  leer?(pieza: number): Promise<Blob | null>;
  /** UN ARCHIVO POR SU NOMBRE (2026-11-23): el contenido de un archivo que el documento nombra en
   *  su config (el `f` de un tramo, una grabación). null si no está. */
  contenido?(nombre: string): Promise<Blob | null>;
  /** La dirección de la que el navegador puede bajar ese archivo ahora; '' si no está. */
  direccion?(nombre: string): string;
  /** Guardar un archivo adentro del documento SIN que sea una pieza (lo que se graba en Edit Pro).
   *  Devuelve el nombre con que quedó, para nombrarlo en la config; null si no se pudo. */
  adjuntar?(contenido: Blob, nombre: string): Promise<string | null>;
  /** Entregarle a la persona un archivo hecho por el programa (mp3, mp4, mid…). */
  bajar(contenido: Blob, nombre: string): void;
}

export interface SesionAnfitrion {
  /** Quién usa el programa; null si no hay cuentas o es anónimo. */
  persona: { id: number; nombre: string } | null;
  permisos: Permisos;
  /** Hasta qué nivel deja llegar la pizarrita (por defecto 3). */
  techo: Nivel;
}

// EL TIEMPO REAL: lo que alguien cambia o toca en este documento lo ven y lo oyen los demás, sin
// pasar por lo guardado. Solo en Pizarrita. `emitir`/`escuchar` llevan cambios de datos (una línea
// de la calculadora, una celda); `sonido`, lo que suena (el play de una caja, una nota).
export interface VivoAnfitrion {
  emitir(cambios: Record<string, unknown>): void;
  escuchar(f: (cambios: Record<string, unknown>) => void): () => void;
  sonido?: {
    emitir(mensaje: Record<string, unknown>): void;
    escuchar(f: (mensaje: Record<string, unknown>) => void): () => void;
  };
}

// LA VENTANA del programa (nivel 3) y su botón en la barra de tareas, si el anfitrión tiene.
export interface VentanaAnfitrion {
  enrollada: boolean;
  agrandada: boolean;
  minimizada: boolean;
  enrollar(si: boolean): void;
  agrandar(): void;
  minimizar(): void;
  cerrar(): void;
  /** Anotarse en la barra de tareas; devuelve cómo borrarse. */
  tarea?(t: { llave: string; nombre: string; icono: string }): () => void;
}

// LAS PREFERENCIAS: lo que se recuerda sin ser contenido (la vista, el tamaño de un panel).
// `dueno`: 'equipo' (este navegador; el único en «archivo»), 'cuenta' (viaja con la persona) o
// 'documento' (lo ve igual quien lo abra).
export interface PreferenciasAnfitrion {
  leer<T>(clave: string, porDefecto: T, dueno?: 'equipo' | 'cuenta' | 'documento'): T;
  guardar<T>(clave: string, valor: T | null, dueno?: 'equipo' | 'cuenta' | 'documento'): void;
}

// LO NUEVO Y LAS CITAS: avisar qué lugar del documento se tocó (un paso, una celda) y saber cuáles
// cambiaron otros. Solo en Pizarrita.
export interface LugaresAnfitrion {
  tocar(lugar: string): void;
  nuevos(): ReadonlySet<string>;
}

export interface AvisosAnfitrion {
  error(mensaje: string): void;
  atencion(mensaje: string): void;
  confirmar(mensaje: string): Promise<boolean>;
}

export interface Anfitrion {
  documento: DocumentoAnfitrion;
  archivos: ArchivosAnfitrion;
  sesion: SesionAnfitrion;
  preferencias: PreferenciasAnfitrion;
  avisos: AvisosAnfitrion;
  /** Los textos de la interfaz en el idioma de quien mira; sin traducción, el de por defecto. */
  texto(clave: string, porDefecto: string): string;
  /** De dónde se bajan los recursos que NO viajan con el programa (JP, 2026-11-23: los plugins
   *  WAM no viajan). Direcciones terminadas en «/». */
  recursos: { plugins: string };
  /** Un gesto en curso (arrastrar un paso, girar una perilla): el anfitrión no recarga encima. */
  gesto: { inicio(): void; fin(): void };
  /** Salir del programa (en Pizarrita, volver a la pizarra) y abrir otro documento. */
  navegacion?: { cerrar(): void; abrir?(id: number): void };
  /** El anfitrión arma el resultado desde el proyecto guardado (en Pizarrita, el servidor). Si
   *  falta, lo arma el programa y lo entrega con `documento.guardarResultado`. */
  armar?(): Promise<boolean>;
  vivo?: VivoAnfitrion;
  ventana?: VentanaAnfitrion;
  lugares?: LugaresAnfitrion;
}

export const AnfitrionCtx = createContext<Anfitrion | null>(null);

/** El anfitrión del programa que se está dibujando. Solo vale dentro de un programa alojado. */
export function useAnfitrion(): Anfitrion {
  const a = useContext(AnfitrionCtx);
  if (!a) throw new Error('useAnfitrion: fuera de un anfitrión');
  return a;
}

/** Hasta qué nivel llega esta persona acá: el permiso pone el techo y la pizarrita puede bajarlo. */
export function nivelMaximo(s: SesionAnfitrion): Nivel {
  const porPermiso: Nivel = s.permisos.editar ? 3 : s.permisos.tocar ? 1 : 0;
  return (Math.min(porPermiso, s.techo) as Nivel);
}
