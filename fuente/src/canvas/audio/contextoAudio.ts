// UN SOLO CONTEXTO DE AUDIO PARA TODA LA PÁGINA, y creado recién cuando alguien toca:
// los navegadores lo dejan suspendido hasta que hay un gesto del usuario. Lo comparten
// la caja de ritmos (`ritmoAudio.ts`), su mixer (`mezcla.ts`) y los plugins WAM
// (`wam.ts`), que tienen que vivir en el mismo contexto para poder conectarse.
//
// iPHONE EN SILENCIO (2026-10-19, JP: en un iPhone 16e no sonaban los audios de lamaula.org).
// Safari trata Web Audio como sonido «ambiente», igual que los tonos del sistema: con el
// teléfono en silencio queda mudo, aunque un <audio> o YouTube sí suenen. Declarar la sesión
// de audio como `playback` (iOS 17+) lo pasa a «música» y suena igual. Donde no existe
// `navigator.audioSession` no hace nada.
// Además, iOS deja el contexto `interrupted` (no `suspended`) tras una llamada, al bloquear
// la pantalla o al volver de otra app; quien llama a ctx() solo reanuda `suspended`, así que
// acá se reanuda también ese caso.
let contexto: AudioContext | null = null;
export function ctx(): AudioContext {
  if (!contexto) {
    try {
      const sesion = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (sesion) sesion.type = 'playback';
    } catch {
      /* navegador sin sesión de audio */
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    // FIREFOX PICADO (2026-10-23): con el búfer chico por defecto hace chasquidos de un
    // instante (en Chrome suena limpio). Solo ahí se pide búfer de reproducción: sale un
    // poco más tarde, pero sin cortes.
    const esFirefox = /firefox/i.test(navigator.userAgent);
    contexto = esFirefox ? new AC({ latencyHint: 'playback' }) : new AC();
  }
  if ((contexto.state as string) === 'interrupted') void contexto.resume().catch(() => undefined);
  return contexto;
}
