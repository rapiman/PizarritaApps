// LOS TEXTOS DE LA ENTREGA (2026-11-23; JP: «solo español e inglés por mientras, todo lo más fácil
// por mientras»). El español es el texto de por defecto que cada programa ya trae en su código;
// acá va solo el inglés, por clave: las mismas claves y traducciones de Pizarrita (tabla
// `traducciones`) más las de la etiqueta (`pza_…`). Un programa nuevo en la entrega suma sus claves.
import { EN_PROGRAMA } from './textosEditPro';

export type Idioma = 'es' | 'en';

const EN: Record<string, string> = {
  // Lo de la onda de Edit Pro, tal como está en Pizarrita.
  ...EN_PROGRAMA,
  // La etiqueta y el anfitrión «archivo».
  pza_abrir: 'Open',
  pza_guardar: 'Save',
  pza_no_leer: 'The file could not be read',
  pza_no_es: 'This is not a file from these programs',
  pza_mas_nuevo: 'The file is from a newer version',
  pza_otro: 'The file belongs to another program',
  pza_no_bajo: 'The file could not be downloaded',
  pza_sin_programa: 'there is no program named',
  // Edit Pro (lo propio de la entrega; lo de la onda viene de Pizarrita: textosEditPro.ts).
  pze_editpro: 'Pizarrita Edit Pro',
  pze_sin_audio: 'Open an audio file to begin.',
  pze_no_armo: 'The audio could not be built',
  // La calculadora.
  calculadora: 'Calculator',
  calc_angulo: 'Degrees or radians',
  calc_borrar_cinta: 'Clear',
  calc_c: 'Clear all',
  calc_ce: 'Clear entry',
  calc_cientifica: 'Scientific',
  calc_cinta: 'Tape',
  calc_copiar: 'Copy',
  calc_copiar_ayuda: 'Copy the tape (pastes into a spreadsheet as two columns)',
  calc_estandar: 'Standard',
  calc_inv: 'Inverse',
  calc_mc: 'Memory clear',
  calc_mmas: 'Memory add',
  calc_mr: 'Memory recall',
  calc_ms: 'Memory store',
  calc_retro: 'Backspace',
};

/** El idioma de una etiqueta: su atributo `idioma`, si no el de la página (`<html lang>`), si no el
 *  del navegador. Lo que no es español queda en inglés. */
export function idiomaDe(el: HTMLElement): Idioma {
  const pedido = (el.getAttribute('idioma') || document.documentElement.lang || navigator.language || 'es').toLowerCase();
  return pedido.startsWith('es') ? 'es' : 'en';
}

export function textosDe(idioma: Idioma): Record<string, string> {
  return idioma === 'en' ? EN : {};
}
