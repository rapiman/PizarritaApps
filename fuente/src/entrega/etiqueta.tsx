// LA ETIQUETA (2026-11-23, docs/anfitrion.md, paso 3a): un programa de Pizarrita en cualquier
// página, sin Pizarrita. Se arma aparte del bundle de Pizarrita (`npm run entrega` →
// assets/entrega/pz-app.js y .css) y no importa nada del tablero ni de la API.
//
//   <link rel="stylesheet" href="pz-app.css">
//   <pz-app programa="calculadora" editar></pz-app>
//   <script src="pz-app.js"></script>
//
// Atributos: `programa` (cuál), `archivo` (dirección de un .json o un .zip para abrir al empezar), `editar`
// (sin él, solo se mira), `nombre` (el del archivo que se baja), `plugins` (de dónde bajan los WAM),
// `idioma` ('es' o 'en'; sin él, el de la página o el del navegador; lo que no es español va en inglés).
//
// Guardar, por las dos vías decididas: la etiqueta avisa con el suceso `pz-guardar`
// (`detail: { documento, archivo }`; el archivo es un `.json`, o un `.zip` si lleva audios u otros
// archivos adentro: lo dice su `type`); si la página lo cancela (`preventDefault()`), se queda ella
// con el archivo y lo guarda donde quiera; si no, se baja al equipo de quien lo usa.
import { useRef, useState, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AnfitrionArchivo, abrirPaquete, bajar, documentoVacio, paqueteDesdeOriginal, type ManejoArchivo, type Paquete } from '../canvas/anfitrion/archivo';
import { Calculadora } from '../canvas/programas/Calculadora';
import { ProgramaEditPro } from '../canvas/audio/ProgramaEditPro';
import { hiloDeLaEntrega } from './hilo';

// Edit Pro con el hilo de la entrega (arma el audio sin ocupar la página).
const EditProConHilo = () => <ProgramaEditPro hilo={hiloDeLaEntrega()} />;
import { idiomaDe, textosDe } from './textos';

// Los programas que trae esta entrega y cómo se llaman (la clave de su nombre y el de por defecto).
// `abre`: los archivos sueltos con que el programa empieza un documento nuevo (Edit Pro, un audio).
const PROGRAMAS: Record<string, { nombre: [string, string]; Programa: ComponentType; abre?: { acepta: string; es: (f: File) => boolean } }> = {
  calculadora: { nombre: ['calculadora', 'Calculadora'], Programa: Calculadora },
  editpro: {
    nombre: ['pze_editpro', 'Pizarrita Edit Pro'],
    Programa: EditProConHilo,
    abre: { acepta: 'audio/*,.mp3,.wav,.ogg,.m4a,.flac,.webm', es: (f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac|webm)$/i.test(f.name) },
  },
};

// Los programas del kit leen sus textos de la tabla de traducciones de la página (traducir.ts). En
// una página sin Pizarrita esa tabla no existe: si la etiqueta va en inglés, se la deja puesta.
function ponerTraducciones(idioma: string, textos: Record<string, string>): void {
  const w = window as unknown as { idioma?: string; trad_interfaz?: Record<string, Record<string, Record<string, string>>>; App?: unknown };
  if (idioma === 'es' || w.App || w.trad_interfaz) return;
  w.idioma = 'EN';
  w.trad_interfaz = { EN: { interfaz: textos } };
}

type Traducir = (clave: string, porDefecto: string) => string;

const vacio = (programa: string): Paquete => ({ documento: documentoVacio(programa), archivos: new Map() });

function Marco({ el, programa, inicial, editar, textos }: { el: HTMLElement; programa: string; inicial: Paquete; editar: boolean; textos: Record<string, string> }) {
  const p = PROGRAMAS[programa];
  const t: Traducir = (clave, porDefecto) => textos[clave] ?? porDefecto;
  const manejo = useRef<ManejoArchivo>(null);
  // Abrir otro archivo vuelve a montar el programa con ese documento.
  const [abierto, setAbierto] = useState({ doc: inicial.documento, archivos: inicial.archivos, n: 0 });
  const [sucio, setSucio] = useState(false);
  const [aviso, setAviso] = useState('');
  const nombreArchivo = (archivo: Blob) => (el.getAttribute('nombre') || abierto.doc.nombre || programa) + (archivo.type === 'application/zip' ? '.zip' : '.json');

  const guardar = () => {
    const m = manejo.current;
    if (!m) return;
    const documento = m.documento();
    const archivo = m.guardar();
    const seguir = el.dispatchEvent(new CustomEvent('pz-guardar', { detail: { documento, archivo }, bubbles: true, cancelable: true }));
    if (seguir) bajar(archivo, nombreArchivo(archivo));
  };
  const abrir = () => {
    const campo = document.createElement('input');
    campo.type = 'file';
    campo.accept = '.json,.zip,application/json,application/zip' + (p.abre ? ',' + p.abre.acepta : '');
    campo.addEventListener('change', () => {
      const f = campo.files?.[0];
      if (!f) return;
      void f.arrayBuffer().then((datos) => {
        try {
          // Un archivo suelto de los que el programa abre (un audio) empieza un documento nuevo.
          const suelto = !!p.abre && !/\.(json|zip)$/i.test(f.name) && p.abre.es(f);
          const { documento: doc, archivos } = suelto ? paqueteDesdeOriginal(programa, f.name, new Uint8Array(datos), f.type) : abrirPaquete(new Uint8Array(datos), programa, t);
          setAbierto((a) => ({ doc: { ...doc, nombre: doc.nombre || f.name.replace(/\.(json|zip)$/i, '') }, archivos, n: a.n + 1 }));
          setSucio(false);
          setAviso('');
        } catch (e) {
          setAviso((e as Error).message);
        }
      });
    });
    campo.click();
  };

  return (
    <div className="pza_marco">
      <div className="pza_barra">
        <span className="pza_nombre">
          {t(p.nombre[0], p.nombre[1])}
          {abierto.doc.nombre ? ` — ${abierto.doc.nombre}` : ''}
          {sucio ? ' •' : ''}
        </span>
        <button type="button" className="pza_boton" onClick={abrir}>
          {t('pza_abrir', 'Abrir')}
        </button>
        {editar && (
          <button type="button" className="pza_boton" onClick={guardar}>
            {t('pza_guardar', 'Guardar')}
          </button>
        )}
      </div>
      {aviso && (
        <div className="pza_aviso" role="alert">
          {aviso}
        </div>
      )}
      <div className="pza_cuerpo">
        <AnfitrionArchivo
          key={abierto.n}
          ref={manejo}
          opciones={{ programa, inicial: abierto.doc, archivos: abierto.archivos, editar, textos, plugins: el.getAttribute('plugins') || '', alCambiar: setSucio, alAvisar: (_n, m) => setAviso(m) }}
        >
          <p.Programa />
        </AnfitrionArchivo>
      </div>
    </div>
  );
}

class PzApp extends HTMLElement {
  private raiz: Root | null = null;

  connectedCallback(): void {
    const programa = this.getAttribute('programa') || '';
    const idioma = idiomaDe(this);
    const textos = textosDe(idioma);
    ponerTraducciones(idioma, textos);
    const t: Traducir = (clave, porDefecto) => textos[clave] ?? porDefecto;
    if (!PROGRAMAS[programa]) {
      this.textContent = `pz-app: ${t('pza_sin_programa', 'no hay un programa')} «${programa}»`;
      return;
    }
    const editar = this.hasAttribute('editar');
    const montar = (inicial: Paquete) => {
      this.raiz = createRoot(this);
      this.raiz.render(<Marco el={this} programa={programa} inicial={inicial} editar={editar} textos={textos} />);
    };
    const archivo = this.getAttribute('archivo');
    if (!archivo) {
      montar(vacio(programa));
      return;
    }
    fetch(archivo)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(t('pza_no_bajo', 'No se pudo bajar el archivo')))))
      .then((datos) => montar(abrirPaquete(new Uint8Array(datos), programa, t)))
      .catch((e: Error) => {
        this.textContent = `pz-app: ${e.message}`;
      });
  }

  disconnectedCallback(): void {
    this.raiz?.unmount();
    this.raiz = null;
  }
}

if (!customElements.get('pz-app')) customElements.define('pz-app', PzApp);
