// LAS HOJAS DEL AUDIO SE PIDEN CON EL AUDIO (2026-10-26, PLAN-CONSOLIDACION §13.6).
//
// `css/pizarramp.css` (PizarrAmp común y sus pieles, el Edit Pro con cara de Cool Edit; 18 KB
// comprimidos, 390 sin comprimir) y `css/pizarrion.css` (la cara de Audion) solo visten el
// reproductor de audio y video, la lista, el ecualizador y el Edit Pro. Una página de solo texto
// usaba el 3 % de la primera. Ahora el encabezado deja sus `<link>` en el mismo lugar de siempre
// pero SIN `href` (con `data-src`), y el primer módulo de audio que se carga se lo pone: así la
// hoja entra en la misma posición de la cascada que antes (estilo → limbo → pizarramp → temas →
// pizarrion) y nada cambia de prioridad. La llaman MediaPlayer, Playlist, PizarriSound y
// EditorVideo al cargarse (son trozos diferidos: quien no tiene audio no los baja).

let puestas = false;

export function ponerHojasAudio(): void {
  if (puestas || typeof document === 'undefined') return;
  puestas = true;
  for (const l of document.querySelectorAll<HTMLLinkElement>('link[data-hoja-audio]')) {
    const src = l.dataset.src;
    if (src && !l.getAttribute('href')) l.setAttribute('href', src);
  }
}
