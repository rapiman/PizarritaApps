// EDIT PRO FUERA DE PIZARRITA (2026-11-23, docs/anfitrion.md, paso 3b-1). El programa chico que
// aloja a la onda (PizarriSound) con cualquier anfitrión: un audio, el cabezal, y lo que la onda
// puede pedir. Todo lo de afuera sale de `useAnfitrion()`:
//   · el audio que se oye es el RESULTADO ya armado si lo hay, y si no el original;
//   · «aplicar» una edición la guarda en el documento (`config.audio`) y arma el audio acá mismo
//     (armarAfuera.ts), que queda como resultado nuevo;
//   · lo que se graba se guarda adentro del documento (`archivos.adjuntar`);
//   · armar va en un hilo aparte si quien lo aloja da uno (`hilo`: la entrega lo da); sin hilo se
//     arma en la página y sale en WAV.
// En Pizarrita la onda la aloja el reproductor de siempre (ProgramaAudio); esto es para la entrega.
//
// No importa nada de Pizarrita (pruebas/fronteras.prueba.ts).
import { useEffect, useRef, useState } from 'react';
import { useAnfitrion } from '../anfitrion/anfitrion';
import { PizarriSound, type EdicionOnda } from './PizarriSound';
import type { EdicionesAudio } from './HerramientasAudio';
import { leerTempo } from './compas';
import { armarArchivo, armarYGuardar, type Decodificados } from './armarAfuera';
import { decodificar } from './armarAudio';
import type { FormatoAudio, HiloArmar } from './hiloArmar';

const SIN_VIVAS = new Set<string>();

export function ProgramaEditPro({ hilo }: { hilo?: HiloArmar | null }) {
  const anfitrion = useAnfitrion();
  const ahora = useRef(anfitrion);
  ahora.current = anfitrion;
  const t = anfitrion.texto;
  const doc = anfitrion.documento;
  const original = doc.archivo;
  const src = (doc.resultado || original)?.url || '';

  // ---- el cabezal: un <audio> sin controles; los botones son los de la onda ----
  const audio = useRef<HTMLAudioElement>(null);
  const [actual, setActual] = useState(0);
  const [total, setTotal] = useState(0);
  const [sonando, setSonando] = useState(false);
  useEffect(() => {
    if (!sonando) return undefined;
    let cuadro = 0;
    const mirar = () => {
      setActual(audio.current?.currentTime || 0);
      cuadro = requestAnimationFrame(mirar);
    };
    cuadro = requestAnimationFrame(mirar);
    return () => cancelAnimationFrame(cuadro);
  }, [sonando]);
  // Al llegar un audio nuevo (se aplicó una edición), el cabezal vuelve al comienzo.
  useEffect(() => {
    setActual(0);
    setSonando(false);
  }, [src]);

  // ---- armar el audio después de cada edición ----
  const [estado, setEstado] = useState<'procesando' | 'error' | undefined>(undefined);
  const [mensaje, setMensaje] = useState('');
  const decodificados = useRef<Decodificados>(new Map());
  const turno = useRef(0);
  const aplicar = (e: EdicionesAudio) => {
    doc.guardarConfig({ audio: e });
    setEstado('procesando');
    const mio = (turno.current += 1);
    // Un respiro antes de armar, para que se alcance a ver «procesando» (sin hilo, armar ocupa la página).
    window.setTimeout(() => {
      void armarYGuardar(ahora.current, e, { hilo, formato: 'mp3' }, decodificados.current).then((error) => {
        if (mio !== turno.current) return;
        setEstado(error ? 'error' : undefined);
        setMensaje(error ? t('pze_no_armo', 'No se pudo armar el audio') : '');
      });
    }, 30);
  };

  // BAJAR lo que suena: si ya está armado en ese formato, tal cual; si no, se arma en ese formato.
  const exportar = async (formato: FormatoAudio) => {
    const a = ahora.current;
    const base = (original?.nombre || a.documento.nombre || 'audio').replace(/\.[A-Za-z0-9]+$/, '');
    const hecho = a.documento.resultado;
    if (hecho && estado !== 'procesando' && (formato === 'mp3' ? hecho.tipo === 'audio/mpeg' : hecho.tipo === 'audio/wav')) {
      a.archivos.bajar(await hecho.leer(), `${base}.${formato}`);
      return;
    }
    setEstado('procesando');
    const r = await armarArchivo(a, (a.documento.config.audio || {}) as EdicionesAudio, { hilo, formato }, decodificados.current);
    setEstado(typeof r === 'string' ? 'error' : undefined);
    setMensaje(typeof r === 'string' ? t('pze_no_armo', 'No se pudo armar el audio') : '');
    if (typeof r !== 'string') a.archivos.bajar(new Blob([r.datos as BlobPart], { type: r.tipo }), `${base}.${r.formato}`);
  };

  if (!original) return <div className="pze_vacio">{t('pze_sin_audio', 'Abra un audio para empezar.')}</div>;

  const cfg = doc.config;
  const editar: EdicionOnda | undefined = anfitrion.sesion.permisos.editar
    ? {
        idea: doc.id,
        bolsa: 0,
        // El original se nombra siempre por su ruta en el documento: así lo nombran los tramos.
        ediciones: { ...((cfg.audio || {}) as EdicionesAudio), orig: original.ruta },
        estado,
        mensaje,
        aplicar,
        tempo: leerTempo(cfg.tempo),
        alTempo: (tempo) => doc.guardarConfig({ tempo }),
        direccion: (archivo) => ahora.current.archivos.direccion?.(archivo) || '',
        sinMultipista: true,
        exportar: (formato) => void exportar(formato),
        grabar: anfitrion.archivos.adjuntar
          ? async (grabacion, extension) => {
              const sonido = await decodificar(await grabacion.arrayBuffer());
              const nombre = sonido ? await ahora.current.archivos.adjuntar?.(grabacion, `grabacion.${extension}`) : null;
              if (!sonido || !nombre) return { error: t('ps_grabacionerror', 'No se pudo guardar la grabación') };
              decodificados.current.set(nombre, sonido);
              return { archivo: nombre, duracion: sonido.izq.length / sonido.frecuencia };
            }
          : undefined,
      }
    : undefined;

  return (
    <div className="pze_editpro">
      <audio
        ref={audio}
        src={src}
        preload="auto"
        onLoadedMetadata={(e) => setTotal(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onDurationChange={(e) => setTotal(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onPlay={() => setSonando(true)}
        onPause={() => setSonando(false)}
        onEnded={() => setSonando(false)}
        onTimeUpdate={(e) => setActual(e.currentTarget.currentTime)}
      />
      <PizarriSound
        src={src}
        actual={actual}
        total={total}
        sonando={sonando}
        marcas={null}
        vivas={SIN_VIVAS}
        elemento={() => audio.current}
        irA={(seg, sonar) => {
          const el = audio.current;
          if (!el) return;
          el.currentTime = Math.max(0, seg);
          setActual(el.currentTime);
          if (sonar) void el.play().catch(() => undefined);
        }}
        onPlay={() => {
          const el = audio.current;
          if (!el) return;
          if (el.paused) void el.play().catch(() => undefined);
          else el.pause();
        }}
        onStop={() => {
          const el = audio.current;
          if (!el) return;
          el.pause();
          el.currentTime = 0;
          setActual(0);
        }}
        editar={editar}
        menus
        cara="cooledit"
      />
    </div>
  );
}
