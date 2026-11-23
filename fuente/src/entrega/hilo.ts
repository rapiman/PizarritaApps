// EL HILO QUE ARMA EL AUDIO, EN LA ENTREGA (2026-11-23, canvas/audio/hiloArmar.ts). Su código se
// arma aparte (`npm run entrega`: canvas/audio/armarObrero.ts → obrero.generado.txt) y viaja como
// texto adentro de pz-app.js: así la entrega sigue siendo un .js y un .css. Se carga recién al
// primer armado. Si el navegador no deja crear el Worker, no hay hilo y se arma en la página.
import codigo from './obrero.generado.txt';
import { HiloArmar } from '../canvas/audio/hiloArmar';

let hilo: HiloArmar | null | undefined;

export function hiloDeLaEntrega(): HiloArmar | null {
  if (hilo !== undefined) return hilo;
  try {
    if (typeof Worker === 'undefined') throw new Error('sin Worker');
    const url = URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }));
    hilo = new HiloArmar(() => new Worker(url));
  } catch {
    hilo = null;
  }
  return hilo;
}
