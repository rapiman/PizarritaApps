/*
 * EMPAREJAR EL NIVEL COMO FFMPEG (2026-11-23, JP: «copia el método, hagamos una versión reducida
 * del ffmpeg»). Es el filtro `loudnorm` de FFmpeg pasado a TypeScript, paso a paso: mide la
 * sonoridad de los últimos 3 segundos cada décima, decide cuánto subir o bajar, suaviza esa
 * ganancia entre décimas y pasa todo por un limitador de picos. Por eso, además de emparejar el
 * nivel del audio entero, ACERCA lo fuerte y lo suave (hasta 11 LU de rango), igual que en Pizarrita.
 *
 * Derivado de libavfilter/af_loudnorm.c de FFmpeg (rama 7.1):
 *   Copyright (c) 2016 Kyle Swanson <k@ylo.ph>.
 * FFmpeg es software libre bajo la GNU Lesser General Public License, versión 2.1 o posterior;
 * este archivo, como obra derivada, se distribuye en esos mismos términos (o posteriores).
 *
 * LO REDUCIDO respecto del original:
 *   · FFmpeg corre este filtro a 192 kHz (remuestrea antes); acá corre a la frecuencia del audio
 *     (44,1 kHz). Los largos van en milisegundos, así que el comportamiento es el mismo, pero el
 *     limitador mira los picos de las muestras tal cual, no los de entre muestras.
 *   · Siempre con los valores que usa Pizarrita: I = -16, TP = -1,5, LRA = 11, en una pasada.
 *   · Solo estéreo.
 * Un audio de menos de 3 segundos, como en el original, solo cambia de volumen parejo.
 */
import type { Sonido } from './armarAudio';
import { emparejarNivel, filtrar, filtrosK, type Filtro } from './limpiarAudio';

const OBJETIVO_I = -16;
const OBJETIVO_LRA = 11;
const TECHO = Math.pow(10, -1.5 / 20);

const cuadro = (fr: number, ms: number) => {
  const n = Math.round(fr * (ms / 1000));
  return n + (n % 2);
};

const PESOS = (() => {
  const sigma = 3.5;
  const w = new Float64Array(21);
  let total = 0;
  for (let i = 0; i < 21; i += 1) {
    const x = i - 10;
    w[i] = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-(x * x) / (2 * sigma * sigma));
    total += w[i];
  }
  for (let i = 0; i < 21; i += 1) w[i] /= total;
  return w;
})();

const lufs = (e: number) => (e > 0 ? -0.691 + 10 * Math.log10(e) : -Infinity);

// Un filtro de la norma que va recibiendo muestras de a una (para medir lo que va saliendo).
class Corrido {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(private f: Filtro) {}
  paso(x: number): number {
    const f = this.f;
    const v = f.b0 * x + f.b1 * this.x1 + f.b2 * this.x2 - f.a1 * this.y1 - f.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = v;
    return v;
  }
}

const enum Limite {
  Fuera,
  Ataque,
  Sosten,
  Suelta,
}

/** El audio con el nivel emparejado como lo hace `loudnorm=I=-16:TP=-1.5:LRA=11`. */
export function nivelar(s: Sonido): Sonido {
  const fr = s.frecuencia;
  const N = s.izq.length;
  const F = cuadro(fr, 100); // lo que entra y sale por vez
  const B = cuadro(fr, 3000); // lo que se mira hacia adelante
  const LB = cuadro(fr, 210); // la memoria del limitador
  const A0 = cuadro(fr, 10); // el ataque de fábrica
  if (N < B) return emparejarNivel(s);
  const ent = [s.izq, s.der];

  // ---- el medidor de lo que entra (EBU R128): sonoridad de los últimos 3 s, del total y su puerta ----
  const [repisa, corte] = filtrosK(fr);
  const kI = filtrar(filtrar(s.izq, repisa), corte);
  const kD = filtrar(filtrar(s.der, repisa), corte);
  const P = new Float64Array(N + 1);
  for (let i = 0; i < N; i += 1) P[i + 1] = P[i] + kI[i] * kI[i] + kD[i] * kD[i];
  const s100 = Math.floor((fr + 5) / 10);
  const s400 = s100 * 4;
  const s3 = s100 * 30;
  const PUERTA = Math.pow(10, (-70 + 0.691) / 10);
  const bloques: number[] = [];
  let sumaBloques = 0;
  let proximo = s400;
  const medir = (T: number) => {
    for (; proximo <= T; proximo += s100) {
      const e = (P[proximo] - P[proximo - s400]) / s400;
      if (e >= PUERTA) {
        bloques.push(e);
        sumaBloques += e;
      }
    }
  };
  const total = (): number => {
    if (bloques.length === 0) return -Infinity;
    const relativa = (sumaBloques / bloques.length) * 0.1;
    let suma = 0;
    let n = 0;
    for (const e of bloques) {
      if (e >= relativa) {
        suma += e;
        n += 1;
      }
    }
    return n > 0 ? lufs(suma / n) : -Infinity;
  };
  const puertaRelativa = (): number => (bloques.length === 0 ? -70 : lufs((sumaBloques / bloques.length) * 0.1));
  const reciente = (T: number): number => lufs((P[T] - P[Math.max(0, T - s3)]) / s3);

  // ---- el medidor de lo que sale (solo los últimos 3 s) ----
  const sal = [new Float32Array(N), new Float32Array(N)];
  let salidos = 0;
  const Ps = new Float64Array(N + 1);
  let medidos = 0;
  const ks = [new Corrido(repisa), new Corrido(corte), new Corrido(repisa), new Corrido(corte)];
  const medirSalida = () => {
    for (; medidos < salidos; medidos += 1) {
      const a = ks[1].paso(ks[0].paso(sal[0][medidos]));
      const b = ks[3].paso(ks[2].paso(sal[1][medidos]));
      Ps[medidos + 1] = Ps[medidos] + a * a + b * b;
    }
  };
  const recienteSalida = (): number => lufs((Ps[medidos] - Ps[Math.max(0, medidos - s3)]) / s3);

  // ---- el estado del filtro ----
  const buf = [new Float64Array(B), new Float64Array(B)];
  const lim = [new Float64Array(LB), new Float64Array(LB)];
  let bufIdx = 0;
  let antBufIdx = 0;
  let limIdx = 0;
  const delta = new Float64Array(30);
  let indice = 1;
  let deltaAnt = 0;
  let sobreUmbral = false;
  const reduccion = [0, 0];
  const antes = [0, 0];
  let estado: Limite = Limite.Fuera;
  let picoIdx = 0;
  let envIdx = 0;
  let envCnt = 0;
  let ataque = A0;
  const suelta = F;
  let primero = true;

  const gauss = (i0: number): number => {
    const i = i0 - 10 > 0 ? i0 - 10 : i0 + 20;
    let r = 0;
    for (let k = 0; k < 21; k += 1) r += delta[i + k < 30 ? i + k : i + k - 30] * PESOS[k];
    return r;
  };

  // Busca el próximo pico que pasa el techo. Devuelve a cuántas muestras está (-1 si no hay) y cuánto mide.
  let picoValor = 0;
  const buscarPico = (corrimiento: number, cuantas: number): number => {
    let index = limIdx + corrimiento + A0;
    if (index >= LB) index -= LB;
    if (primero) for (let c = 0; c < 2; c += 1) antes[c] = Math.abs(lim[c][index - 1 < 0 ? index - 1 + LB : index - 1]);
    for (let n = 0; n < cuantas; n += 1) {
      for (let c = 0; c < 2; c += 1) {
        const este = Math.abs(lim[c][index]);
        let sig = Math.abs(lim[c][index + 1 < LB ? index + 1 : index + 1 - LB]);
        if (antes[c] <= este && sig <= este && este > TECHO && n > 0) {
          let hallado = true;
          for (let i = 2; i < 12; i += 1) {
            sig = Math.abs(lim[c][index + i < LB ? index + i : index + i - LB]);
            if (sig > este) {
              hallado = false;
              break;
            }
          }
          if (!hallado) continue;
          let maximo = 0;
          for (let k = 0; k < 2; k += 1) {
            const v = Math.abs(lim[k][index]);
            if (k === 0 || v > maximo) maximo = v;
            antes[k] = v;
          }
          picoIdx = index;
          picoValor = maximo;
          return n;
        }
        antes[c] = este;
      }
      index += 1;
      if (index >= LB) index -= LB;
    }
    return -1;
  };

  const avanzarEnv = () => {
    envIdx += 1;
    if (envIdx >= LB) envIdx -= LB;
  };

  // El limitador: baja de a poco antes de cada pico, sostiene, y suelta de a poco. Saca `cuantas` muestras.
  const limitar = (cuantas: number) => {
    const index0 = limIdx;
    let hechas = 0;
    if (primero) {
      let maximo = 0;
      for (let n = 0; n < A0; n += 1) maximo = Math.max(maximo, Math.abs(lim[0][n]), Math.abs(lim[1][n]));
      if (maximo > TECHO) {
        reduccion[1] = TECHO / maximo;
        estado = Limite.Sosten;
        for (let n = 0; n < A0; n += 1) {
          lim[0][n] *= reduccion[1];
          lim[1][n] *= reduccion[1];
        }
      }
    }
    do {
      if (estado === Limite.Fuera) {
        const d = buscarPico(hechas, cuantas - hechas);
        if (d !== -1) {
          envCnt = 0;
          hechas += d - ataque;
          reduccion[0] = 1;
          reduccion[1] = TECHO / picoValor;
          estado = Limite.Ataque;
          envIdx = picoIdx - ataque;
          if (envIdx < 0) envIdx += LB;
        } else hechas = cuantas;
      } else if (estado === Limite.Ataque) {
        for (; envCnt < ataque; envCnt += 1) {
          const env = reduccion[0] - (envCnt / (ataque - 1)) * (reduccion[0] - reduccion[1]);
          lim[0][envIdx] *= env;
          lim[1][envIdx] *= env;
          avanzarEnv();
          hechas += 1;
          if (hechas >= cuantas) {
            envCnt += 1;
            break;
          }
        }
        if (hechas < cuantas) {
          envCnt = 0;
          ataque = A0;
          estado = Limite.Sosten;
        }
      } else if (estado === Limite.Sosten) {
        const d = buscarPico(hechas, cuantas);
        if (d === -1) {
          estado = Limite.Suelta;
          reduccion[0] = reduccion[1];
          reduccion[1] = 1;
          envCnt = 0;
        } else {
          const r = TECHO / picoValor;
          if (r < reduccion[1]) {
            estado = Limite.Ataque;
            ataque = d <= 1 ? 2 : d;
            reduccion[0] = reduccion[1];
            reduccion[1] = r;
            envCnt = 0;
          } else {
            for (envCnt = 0; envCnt < d; envCnt += 1) {
              lim[0][envIdx] *= reduccion[1];
              lim[1][envIdx] *= reduccion[1];
              avanzarEnv();
              hechas += 1;
              if (hechas >= cuantas) {
                envCnt += 1;
                break;
              }
            }
          }
        }
      } else {
        for (; envCnt < suelta; envCnt += 1) {
          const env = reduccion[0] + (envCnt / (suelta - 1)) * (reduccion[1] - reduccion[0]);
          lim[0][envIdx] *= env;
          lim[1][envIdx] *= env;
          avanzarEnv();
          hechas += 1;
          if (hechas >= cuantas) {
            envCnt += 1;
            break;
          }
        }
        if (hechas < cuantas) {
          envCnt = 0;
          estado = Limite.Fuera;
        }
      }
    } while (hechas < cuantas);
    let index = index0;
    for (let n = 0; n < cuantas; n += 1) {
      if (salidos < N) {
        for (let c = 0; c < 2; c += 1) {
          const v = lim[c][index];
          sal[c][salidos] = Math.abs(v) > TECHO ? TECHO * (v < 0 ? -1 : 1) : v;
        }
        salidos += 1;
      }
      index += 1;
      if (index >= LB) index -= LB;
    }
    primero = false;
  };

  // ---- los primeros 3 segundos ----
  medir(B);
  for (let c = 0; c < 2; c += 1) buf[c].set(ent[c].subarray(0, B));
  const st0 = reciente(B);
  let envCorto: number;
  if (st0 < -70) {
    sobreUmbral = false;
    envCorto = 0;
  } else {
    sobreUmbral = true;
    envCorto = st0 <= -70 ? 0 : OBJETIVO_I - st0;
  }
  delta.fill(Math.pow(10, envCorto / 20));
  deltaAnt = delta[indice];
  for (let n = 0; n < LB; n += 1) {
    lim[0][n] = buf[0][n] * delta[indice];
    lim[1][n] = buf[1][n] * delta[indice];
  }
  bufIdx = LB % B;
  limIdx = 0;
  limitar(F);
  medirSalida();

  // ---- el resto, de a una décima ----
  let T = B;
  while (T < N) {
    const nb = Math.min(F, N - T);
    medir(T + nb);
    const g = gauss(indice + 10 < 30 ? indice + 10 : indice + 10 - 30);
    const gSig = gauss(indice + 11 < 30 ? indice + 11 : indice + 11 - 30);
    for (let n = 0; n < nb; n += 1) {
      const k = g + (n / nb) * (gSig - g);
      for (let c = 0; c < 2; c += 1) {
        buf[c][antBufIdx] = ent[c][T + n];
        lim[c][limIdx] = buf[c][bufIdx] * k;
      }
      limIdx += 1;
      if (limIdx >= LB) limIdx -= LB;
      antBufIdx += 1;
      if (antBufIdx >= B) antBufIdx -= B;
      bufIdx += 1;
      if (bufIdx >= B) bufIdx -= B;
    }
    limIdx = (limIdx + (F - nb)) % LB;
    limitar(nb);
    medirSalida();
    T += nb;
    const global = total();
    const corto = reciente(T);
    const relativa = puertaRelativa();
    if (!sobreUmbral) {
      if (corto > -70) deltaAnt *= 1.0058;
      if (recienteSalida() >= OBJETIVO_I) sobreUmbral = true;
    }
    if (corto < relativa || corto <= -70 || !sobreUmbral) delta[indice] = deltaAnt;
    else {
      const dif = corto - global;
      const envGlobal = Math.abs(dif) < OBJETIVO_LRA / 2 ? dif : (OBJETIVO_LRA / 2) * (dif < 0 ? -1 : 1);
      delta[indice] = Math.pow(10, (envGlobal + (OBJETIVO_I - corto)) / 20);
    }
    deltaAnt = delta[indice];
    indice += 1;
    if (indice >= 30) indice -= 30;
  }

  // ---- lo que quedó en la memoria (los últimos 3 segundos menos una décima) ----
  const nbFin = B - F;
  let desde = bufIdx - (LB - F);
  if (desde < 0) desde += B;
  const fin = [new Float64Array(nbFin), new Float64Array(nbFin)];
  for (let n = 0; n < nbFin; n += 1) {
    fin[0][n] = buf[0][desde];
    fin[1][n] = buf[1][desde];
    desde += 1;
    if (desde >= B) desde -= B;
  }
  const gFin = gauss(indice + 10 < 30 ? indice + 10 : indice + 10 - 30);
  limIdx = 0;
  for (let n = 0; n < LB; n += 1) {
    lim[0][n] = fin[0][n] * gFin;
    lim[1][n] = fin[1][n] * gFin;
  }
  let iFin = LB;
  for (let i = 0; i < Math.floor(nbFin / F); i += 1) {
    limitar(F);
    for (let n = 0; n < F; n += 1) {
      const hay = iFin < nbFin;
      lim[0][limIdx] = hay ? fin[0][iFin] * gFin : 0;
      lim[1][limIdx] = hay ? fin[1][iFin] * gFin : 0;
      if (hay) iFin += 1;
      limIdx += 1;
      if (limIdx >= LB) limIdx -= LB;
    }
  }
  return { izq: sal[0], der: sal[1], frecuencia: fr };
}
