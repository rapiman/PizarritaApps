// LOS MENSAJES DE LA PÁGINA, sin jQuery (2026-09-25).
//
// La ventana `#mensaje_error` (index.html.twig) es una sola y tiene tres niveles por
// clase: `todomal` (error), `todobien` (información) y `todoaviso` (atención). Hasta acá
// la manejaban `resolvererror`, `avisarProblema`, `avisarSinSesion` y `avisarNoSeGuardo`
// de rutinas.js; ahora viven acá y se dejan en `window` con los mismos nombres para el
// jQuery que queda.
//
// NO se usa `abrirDialogo`: ese cierra las otras ventanas, y un aviso no puede cerrar la
// ventana en la que la persona está trabajando (configurar, por ejemplo).

import { tr } from '../traducir';

type Nivel = 'todomal' | 'todobien' | 'todoaviso';

type Ventana = {
  __sonar?: (s: string) => void;
  centrarVentana?: (el: Element) => void;
  setefuelasesion?: () => void;
  llenar_idea?: () => void;
  llenar_bolsa_deideas?: () => void;
  __uiSinSesion?: boolean;
};

const w = window as unknown as Ventana;

/** Muestra un texto en la ventana de mensajes, con su nivel. */
export function mostrarMensaje(texto: string, nivel: Nivel): void {
  const el = document.getElementById('mensaje_error');
  if (!el) return;
  const t = el.querySelector('.texto');
  if (t) t.textContent = texto;
  el.classList.remove('todomal', 'todobien', 'todoaviso', 'collapse');
  el.classList.add(nivel);
  const oculta = window.getComputedStyle(el).display === 'none';
  el.style.display = 'block';
  if (oculta) w.centrarVentana?.(el);
}

/** Cierra la ventana de mensajes. */
export function ocultarMensaje(): void {
  const el = document.getElementById('mensaje_error');
  if (el) el.style.display = 'none';
}

/** Un problema con texto traducible: `palabra` es la clave; `respaldo`, el español. */
export function avisarProblema(palabra: string, respaldo: string): false {
  w.__sonar?.('aviso');
  mostrarMensaje(tr(palabra, respaldo), 'todomal');
  return false;
}

/**
 * Sin sesión no se guarda nada: el servidor rechaza toda escritura. Además del aviso,
 * la interfaz vuelve a lo que de verdad es —sin sesión— UNA vez por episodio (la bandera
 * la limpia `inicio_permisos` cuando vuelve a haber sesión). Si no, cada gesto choca
 * contra el mismo mensaje.
 */
export function avisarSinSesion(): false {
  console.warn('Escritura sin sesión: el servidor la rechazaría, no se envió.');
  avisarProblema('sinsesion', 'Hay que iniciar sesión para guardar los cambios.');
  if (!w.__uiSinSesion) {
    w.__uiSinSesion = true;
    w.setefuelasesion?.();
    w.llenar_idea?.();
    w.llenar_bolsa_deideas?.();
  }
  return false;
}

/** El pedido no llegó al servidor (red caída, servidor sin responder). */
export function avisarNoSeGuardo(): false {
  return avisarProblema('noseguardo', 'No se pudo guardar el cambio: no hubo respuesta del servidor.');
}

/**
 * La respuesta del servidor: con error, la ventana en rojo (y la sesión caída o el CSRF
 * vencido se atienden); sin error pero con mensaje, en verde. Devuelve si salió bien.
 */
export function resolvererror(error: unknown, mensaje?: unknown): boolean {
  const texto = mensaje === undefined || mensaje === null ? '' : String(mensaje);
  if (String(error) !== '0' && error !== undefined && error !== null && error !== '') {
    w.__sonar?.('error');
    console.error('Error del servidor:', { codigo: error, mensaje: texto });
    mostrarMensaje(texto || 'Err', 'todomal');
    if (String(error) === '-911911911') w.setefuelasesion?.();
    // CSRF o sesión vencida: en vez de un error críptico, avisar claro y recargar (la
    // página vuelve con token y sesión frescos).
    if (String(error) === '-9996') {
      mostrarMensaje('La sesión expiró por inactividad. Actualizando la página…', 'todomal');
      window.setTimeout(() => location.reload(), 1200);
    }
    return false;
  }
  if (texto) mostrarMensaje(texto, 'todobien');
  return true;
}

/** Nivel «atención»: ni error ni información. */
export function avisarAtencion(texto: string): void {
  mostrarMensaje(texto, 'todoaviso');
}

const g = window as unknown as Record<string, unknown>;
g.mostrarMensaje = mostrarMensaje;
g.ocultarMensaje = ocultarMensaje;
g.resolvererror = resolvererror;
g.avisarProblema = avisarProblema;
g.avisarSinSesion = avisarSinSesion;
g.avisarNoSeGuardo = avisarNoSeGuardo;
