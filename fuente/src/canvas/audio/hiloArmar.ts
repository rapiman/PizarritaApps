// ARMAR EL AUDIO EN UN HILO APARTE (2026-11-23, docs/anfitrion.md). Armar ocupa la página: quitar
// el ruido toma unos 40 ms por segundo de audio y por canal, y con eso un tema largo dejaba la
// página sin responder medio minuto. Esto lo manda a un Worker.
//
//   · `atenderArmado(ambito)` es el lado del hilo: lo llama la entrada del Worker (armarObrero.ts).
//   · `HiloArmar` es el lado de la página: le pasa al hilo los sonidos ya decodificados (una sola
//     vez cada uno: el hilo se los guarda) y le pide el audio armado en WAV o mp3.
//
// Decodificar se sigue haciendo en la página (el navegador lo hace sin ocuparla, y en un Worker no
// hay con qué). Lo que viaja de vuelta es el archivo ya hecho.
import { aMp3, aWav, armarAudio, type CodificadorMp3, type Sonido } from './armarAudio';
import type { EdicionesAudio } from './HerramientasAudio';

export type FormatoAudio = 'wav' | 'mp3';
export type Armado = { datos: Uint8Array<ArrayBuffer>; tipo: string; formato: FormatoAudio };

type Pedido =
  | { que: 'fuente'; nombre: string; izq: Float32Array; der: Float32Array; frecuencia: number }
  | { que: 'olvidar' }
  | { que: 'armar'; id: number; ed: EdicionesAudio; original: string; formato: FormatoAudio };
type Respuesta = { id: number; datos?: ArrayBuffer; tipo?: string; formato?: FormatoAudio; error?: string };

type Ambito = { postMessage(m: unknown, transferir?: Transferable[]): void; onmessage: ((e: MessageEvent) => void) | null };

/** El lado del hilo. `mp3`: el codificador (sin él, siempre sale WAV). */
export function atenderArmado(ambito: Ambito, mp3?: CodificadorMp3): void {
  const fuentes = new Map<string, Sonido>();
  ambito.onmessage = (e: MessageEvent) => {
    const p = e.data as Pedido;
    if (p.que === 'fuente') {
      fuentes.set(p.nombre, { izq: p.izq, der: p.der, frecuencia: p.frecuencia });
      return;
    }
    if (p.que === 'olvidar') {
      fuentes.clear();
      return;
    }
    try {
      const sonido = armarAudio(p.ed, (f) => fuentes.get(f), p.original);
      if (!sonido) {
        ambito.postMessage({ id: p.id, error: 'vacio' } satisfies Respuesta);
        return;
      }
      const conMp3 = p.formato === 'mp3' && !!mp3;
      const datos = conMp3 ? aMp3(sonido, mp3 as CodificadorMp3) : aWav(sonido);
      ambito.postMessage({ id: p.id, datos: datos.buffer, tipo: conMp3 ? 'audio/mpeg' : 'audio/wav', formato: conMp3 ? 'mp3' : 'wav' } satisfies Respuesta, [datos.buffer]);
    } catch (error) {
      ambito.postMessage({ id: p.id, error: String(error) } satisfies Respuesta);
    }
  };
}

/** El lado de la página. `crear` arma el Worker (lo sabe quien entrega: de dónde sale su código). */
export class HiloArmar {
  private obrero: Worker | null = null;
  private enviados = new Set<string>();
  private esperando = new Map<number, (r: Respuesta) => void>();
  private proximo = 1;
  constructor(private crear: () => Worker) {}

  private hilo(): Worker {
    if (this.obrero) return this.obrero;
    const w = this.crear();
    w.onmessage = (e: MessageEvent) => {
      const r = e.data as Respuesta;
      this.esperando.get(r.id)?.(r);
      this.esperando.delete(r.id);
    };
    // Si el hilo se cae, lo que esperaba falla (y quien pidió arma en la página).
    w.onerror = () => {
      for (const listo of this.esperando.values()) listo({ id: 0, error: 'hilo' });
      this.esperando.clear();
      this.cerrar();
    };
    this.obrero = w;
    return w;
  }

  /** Arma en el hilo. `fuentes`: los sonidos que nombran las ediciones (los que el hilo no tenga se le pasan). */
  armar(ed: EdicionesAudio, original: string, fuentes: ReadonlyMap<string, Sonido>, formato: FormatoAudio): Promise<Armado> {
    const w = this.hilo();
    for (const [nombre, s] of fuentes) {
      if (this.enviados.has(nombre)) continue;
      // Se copian (no se transfieren): la página los sigue usando para la onda y la escucha.
      w.postMessage({ que: 'fuente', nombre, izq: s.izq, der: s.der, frecuencia: s.frecuencia } satisfies Pedido);
      this.enviados.add(nombre);
    }
    const id = this.proximo++;
    return new Promise((listo, falla) => {
      this.esperando.set(id, (r) => {
        if (r.error || !r.datos) falla(new Error(r.error || 'sin datos'));
        else listo({ datos: new Uint8Array(r.datos), tipo: r.tipo || 'audio/wav', formato: r.formato || 'wav' });
      });
      w.postMessage({ que: 'armar', id, ed, original, formato } satisfies Pedido);
    });
  }

  cerrar(): void {
    this.obrero?.terminate();
    this.obrero = null;
    this.enviados.clear();
  }
}
