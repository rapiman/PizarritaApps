// LOS PICOS DE LA ONDA (sacado de PizarriSound.tsx el 2026-10-26, PLAN-CONSOLIDACION O2): los
// usan la onda que se ve sin editar (OndaSC) y el editor de video; vivían en PizarriSound y por
// eso cualquiera que miraba un audio bajaba también el editor entero. Lo calcula `picos.php`
// (un par mínimo/máximo por centésima, de la mezcla a mono), una vez por archivo en el servidor.

export interface Picos {
  hz: number;
  dura: number;
  p: Int8Array; // pares (mínimo, máximo)
}
const picosPedidos = new Map<string, Promise<Picos | null>>();

// SIN SERVIDOR (2026-11-23, docs/anfitrion.md): lo que no viene de Pizarrita (una dirección del
// navegador: un archivo abierto fuera de Pizarrita, algo recién grabado) se mide acá, decodificándolo.
// Lo mismo que da `picos.php`: 100 pares (mínimo, máximo) por segundo, de la mezcla a mono.
function picosEnElNavegador(src: string): Promise<Picos | null> | null {
  const Ctx = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : null;
  if (!Ctx) return null;
  return fetch(src)
    .then((r) => r.arrayBuffer())
    .then((b) => new Ctx(1, 1, 44100).decodeAudioData(b))
    .then((buf) => {
      const hz = 100;
      const paso = buf.sampleRate / hz;
      const n = Math.max(1, Math.ceil(buf.length / paso));
      const canales = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
      const p = new Int8Array(n * 2);
      for (let i = 0; i < n; i += 1) {
        let min = 0;
        let max = 0;
        const fin = Math.min(buf.length, Math.floor((i + 1) * paso));
        for (let k = Math.floor(i * paso); k < fin; k += 1) {
          let v = 0;
          for (const c of canales) v += c[k];
          v /= canales.length;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        p[i * 2] = Math.max(-128, Math.round(min * 127));
        p[i * 2 + 1] = Math.min(127, Math.round(max * 127));
      }
      return { hz, dura: buf.duration, p };
    })
    .catch(() => null);
}
export function pedirPicos(src: string): Promise<Picos | null> {
  let pr = picosPedidos.get(src);
  if (!pr) {
    pr = (/^(blob|data):/.test(src) ? picosEnElNavegador(src) : null) || fetch('picos.php?archivo=' + encodeURIComponent(src))
      .then((r) => (r.ok ? (r.json() as Promise<{ hz: number; dura: number; p: string }>) : null))
      .then((j) => {
        if (!j || !j.p) return null;
        const b = atob(j.p);
        const p = new Int8Array(b.length);
        for (let i = 0; i < b.length; i += 1) p[i] = (b.charCodeAt(i) << 24) >> 24;
        return { hz: j.hz, dura: j.dura, p };
      })
      .catch(() => null);
    picosPedidos.set(src, pr);
  }
  return pr;
}
