// LA ENTRADA DEL HILO QUE ARMA EL AUDIO (2026-11-23, hiloArmar.ts). Se arma aparte (`npm run
// entrega`: esbuild → src/entrega/obrero.generado.txt) y la entrega lo carga como Worker. Lleva el
// codificador de mp3 (lamejs, LGPL): la página ya no lo necesita.
import { Mp3Encoder } from '@breezystack/lamejs';
import { atenderArmado } from './hiloArmar';
import type { CodificadorMp3 } from './armarAudio';

atenderArmado(self as unknown as Parameters<typeof atenderArmado>[0], Mp3Encoder as unknown as CodificadorMp3);
