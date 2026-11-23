import { useEffect, useState } from 'react';
import { tr } from '../../traducir';
import { guardarDisposicion, leerDisposicion } from '../comun/disposicion';

// LA REGLA EN COMPASES (2026-09-30, JP: «me gustaría una regla como bpm y figura 3/4 o 4/4»), en
// la vista de onda y en el multipista de Pizarrita Edit Pro. El tempo y el compás son del audio (se
// guardan en la idea, `config.tempo`); ver la regla en compases o en minutos es de cada uno.

export interface Tempo {
  bpm: number;
  compas: [number, number];
}
export const TEMPO_INICIO: Tempo = { bpm: 120, compas: [4, 4] };
export const COMPASES: [number, number][] = [[2, 4], [3, 4], [4, 4], [5, 4], [6, 8], [7, 8], [9, 8], [12, 8]];

export function leerTempo(x: unknown): Tempo {
  const o = (x && typeof x === 'object' ? x : {}) as { bpm?: unknown; compas?: unknown };
  const bpm = Number(o.bpm);
  const c = Array.isArray(o.compas) ? o.compas.map(Number) : [];
  return {
    bpm: bpm >= 20 && bpm <= 400 ? bpm : TEMPO_INICIO.bpm,
    compas: c.length === 2 && c[0] >= 1 && c[0] <= 32 && [2, 4, 8, 16].includes(c[1]) ? [c[0], c[1]] : TEMPO_INICIO.compas,
  };
}

// Lo que dura un tiempo (la figura del denominador: negra en x/4, corchea en x/8) y un compás.
export const largoTiempo = (t: Tempo) => (60 / t.bpm) * (4 / t.compas[1]);
export const largoCompas = (t: Tempo) => largoTiempo(t) * t.compas[0];

// «3.2» = compás 3, tiempo 2 (desde 1).
export function rotuloCompas(seg: number, t: Tempo, conTiempo = true): string {
  const lt = largoTiempo(t);
  const n = Math.floor(seg / lt + 1e-6);
  const compas = Math.floor(n / t.compas[0]) + 1;
  const tiempo = (n % t.compas[0]) + 1;
  return conTiempo && tiempo > 1 ? `${compas}.${tiempo}` : String(compas);
}

// El tiempo más cercano, si está a menos de `tol` segundos (el imán).
export function pegarATiempo(seg: number, t: Tempo, tol: number): number {
  const lt = largoTiempo(t);
  const cerca = Math.round(seg / lt) * lt;
  return Math.abs(cerca - seg) <= tol ? Math.max(0, cerca) : seg;
}

// Las rayas de la regla entre `desde` y `hasta` (segundos): los compases grandes (con número) y
// los tiempos chicos, salteando lo que no cabe a este zoom (`pps` = px por segundo).
export function rayasCompas(desde: number, hasta: number, t: Tempo, pps: number): { t: number; grande: boolean; rotulo: string }[] {
  const lt = largoTiempo(t);
  const lc = largoCompas(t);
  const verTiempos = lt * pps >= 7;
  let cadaCompas = 1;
  while (lc * cadaCompas * pps < 34 && cadaCompas < 4096) cadaCompas *= 2;
  const out: { t: number; grande: boolean; rotulo: string }[] = [];
  const n0 = Math.max(0, Math.floor(desde / lt));
  for (let n = n0; n * lt <= hasta + 1e-6; n += 1) {
    const s = n * lt;
    const esCompas = n % t.compas[0] === 0;
    const compas = Math.floor(n / t.compas[0]);
    if (esCompas && compas % cadaCompas === 0) out.push({ t: s, grande: true, rotulo: String(compas + 1) });
    else if (verTiempos || (esCompas && cadaCompas === 1)) out.push({ t: s, grande: false, rotulo: '' });
    if (out.length > 4000) break;
  }
  return out;
}

// LAS DOS REGLAS (2026-09-30, JP: «pueden salir las dos reglas, bpm y minutos, al mismo tiempo si
// están activadas»): la de compases y la de minutos se prenden cada una; con las dos, una arriba de la
// otra. Si se apagan las dos, queda la de minutos. Desde 2026-10-08, de la idea (disposicion.ts).
export interface Reglas {
  compases: boolean;
  minutos: boolean;
}
function leerReglas(idea = 0): Reglas {
  try {
    const v = leerDisposicion<string>(idea, 'editpro.reglas', '', ['editpro', 'reglas']);
    if (v) return { compases: v.includes('c'), minutos: v.includes('m') || !v.includes('c') };
    // La de antes (una sola, compases o minutos).
    return window.localStorage.getItem('pz_regla_compas') === '1' ? { compases: true, minutos: false } : { compases: false, minutos: true };
  } catch {
    return { compases: false, minutos: true };
  }
}
const oyentes = new Set<{ idea: number; f: (v: Reglas) => void }>();
export function useReglas(idea = 0): [Reglas, (v: Reglas) => void] {
  const [v, setV] = useState(() => leerReglas(idea));
  useEffect(() => {
    const o = { idea, f: setV };
    oyentes.add(o);
    setV(leerReglas(idea));
    return () => {
      oyentes.delete(o);
    };
  }, [idea]);
  const cambiar = (x: Reglas) => {
    const n = { compases: x.compases, minutos: x.minutos || !x.compases };
    guardarDisposicion(idea, 'editpro.reglas', `${n.compases ? 'c' : ''}${n.minutos ? 'm' : ''}`);
    oyentes.forEach((o) => o.idea === idea && o.f(n));
  };
  return [v, cambiar];
}

// EL METRÓNOMO (2026-09-30, JP): un golpecito (más agudo en el primer tiempo del compás), directo a
// los parlantes: no entra en la mezcla ni en lo que se graba desde el mixer.
export function clic(c: AudioContext, fuerte: boolean, cuando = 0, destino?: AudioNode): void {
  const t = Math.max(c.currentTime, cuando);
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.value = fuerte ? 1760 : 1175;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(fuerte ? 0.5 : 0.3, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(destino || c.destination);
  o.start(t);
  o.stop(t + 0.06);
}

// El tempo, el compás y la regla, en la barra de herramientas (las dos vistas). `clase` = la de los
// botones de esa barra.
export function ControlesTempo({
  tempo,
  alTempo,
  reglas,
  alReglas,
  clase,
  metronomo,
  alMetronomo,
  cuenta,
  alCuenta,
}: {
  tempo: Tempo;
  alTempo?: (t: Tempo) => void;
  reglas: Reglas;
  alReglas: (v: Reglas) => void;
  clase: string;
  // El metrónomo y la cuenta de un compás antes de grabar (solo donde se graba: el multipista).
  metronomo?: boolean;
  alMetronomo?: (v: boolean) => void;
  cuenta?: boolean;
  alCuenta?: (v: boolean) => void;
}) {
  const [bpm, setBpm] = useState(String(tempo.bpm));
  useEffect(() => setBpm(String(tempo.bpm)), [tempo.bpm]);
  const fijarBpm = () => {
    const n = Math.round(Number(bpm.replace(',', '.')) * 10) / 10;
    if (alTempo && n >= 20 && n <= 400 && n !== tempo.bpm) alTempo({ ...tempo, bpm: n });
    else setBpm(String(tempo.bpm));
  };
  return (
    <span className="pz_tempo">
      <button
        type="button"
        className={`${clase}${reglas.minutos ? ' activo puesto' : ''}`}
        aria-pressed={reglas.minutos}
        title={tr('pz_regla_minutos', 'Regla en minutos y segundos')}
        onClick={() => alReglas({ ...reglas, minutos: !reglas.minutos })}
      >
        <i className="bi bi-stopwatch" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        className={`${clase}${reglas.compases ? ' activo puesto' : ''}`}
        aria-pressed={reglas.compases}
        title={tr('pz_regla_compases', 'Regla en compases y tiempos')}
        onClick={() => alReglas({ ...reglas, compases: !reglas.compases })}
      >
        <i className="bi bi-music-note-beamed" aria-hidden="true"></i>
      </button>
      <input
        className="pz_tempo_bpm"
        type="text"
        inputMode="decimal"
        value={bpm}
        disabled={!alTempo}
        title={tr('pz_tempo_bpm', 'Tempo (golpes por minuto)')}
        onChange={(e) => setBpm(e.target.value)}
        onBlur={fijarBpm}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <span className="pz_tempo_bpm_rot">bpm</span>
      <select
        className="pz_tempo_compas"
        value={tempo.compas.join('/')}
        disabled={!alTempo}
        title={tr('pz_tempo_compas', 'Compás')}
        onChange={(e) => {
          const [n, d] = e.target.value.split('/').map(Number);
          alTempo?.({ ...tempo, compas: [n, d] });
        }}
      >
        {COMPASES.map((c) => (
          <option key={c.join('/')} value={c.join('/')}>
            {c.join('/')}
          </option>
        ))}
      </select>
      {alMetronomo && (
        <button
          type="button"
          className={`${clase}${metronomo ? ' activo puesto' : ''}`}
          aria-pressed={!!metronomo}
          title={`${tr('pz_metronomo', 'Metrónomo')} (⇧C)`}
          onClick={() => alMetronomo(!metronomo)}
        >
          <i className="bi bi-bell" aria-hidden="true"></i>
        </button>
      )}
      {alCuenta && (
        <button
          type="button"
          className={`${clase}${cuenta ? ' activo puesto' : ''}`}
          aria-pressed={!!cuenta}
          title={tr('pz_cuenta', 'Cuenta de un compás antes de grabar')}
          onClick={() => alCuenta(!cuenta)}
        >
          <i className="bi bi-hourglass-split" aria-hidden="true"></i>
        </button>
      )}
    </span>
  );
}
