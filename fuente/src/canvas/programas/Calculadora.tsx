// LA CALCULADORA (PizarriCalcu, 2026-09-26; JP: «es una idea que queda así dentro de una
// pizarra, como el buscaminas; estándar y científica; con la cinta»).
//
// Una idea de tipo `calculadora` se usa directo en la tarjeta (sin tapa, como un juego
// suelto). Lo que se calcula es de cada uno (la pantalla, la memoria); lo que queda en la CINTA
// es de todos: cada «=» deja un renglón («12 + 3 × 2 = 18») que se guarda en
// `config.calculadora.cinta` (sp_calculadora_cambios agrega al final, así nadie pisa a nadie)
// y les llega al toque a los que miran. La cinta se copia como texto con tabuladores: pegada en
// una hoja de cálculo, cae en dos columnas (la cuenta y el resultado).
//
// Como las de la época: se calcula al ir apretando (2 + 3 × 4 = 20), con memoria (MC MR MS
// M+). La científica suma funciones de una tecla (sin, cos, tan con Inv, ln, log, x², xʸ,
// √, n!, π, e) en grados o radianes.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useAnfitrion } from '../anfitrion/anfitrion';

export type LineaCinta = { t: string; u?: string; h?: string };
export type ConfigCalculadora = { modo?: 'estandar' | 'cientifica'; cinta?: LineaCinta[] };

export function leerCalculadora(cfg: Record<string, unknown>): ConfigCalculadora {
  const c = cfg.calculadora;
  return c && typeof c === 'object' ? (c as ConfigCalculadora) : {};
}

type Op = '+' | '-' | '*' | '/' | '^';
const SIMBOLO: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^' };
const DECIMAL = (() => {
  try {
    return new Intl.NumberFormat().formatToParts(1.5).find((p) => p.type === 'decimal')?.value || '.';
  } catch {
    return '.';
  }
})();

// Un número para la pantalla: hasta 12 cifras significativas, con la coma del idioma.
function aPantalla(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  let t: string;
  if (abs >= 1e12 || abs < 1e-9) t = n.toExponential(8).replace(/\.?0+e/, 'e');
  else t = String(Number(n.toPrecision(12)));
  return DECIMAL === ',' ? t.replace('.', ',') : t;
}
function deePantalla(t: string): number {
  return Number(t.replace(',', '.'));
}
function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n) || n > 170) return NaN;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
function aplicar(a: number, op: Op, b: number): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b === 0 ? NaN : a / b;
    case '^':
      return Math.pow(a, b);
  }
}

type Tecla = { k: string; etiqueta: string; clase: string; titulo?: string; ancho?: number };

export function Calculadora() {
  // Todo lo de afuera llega del anfitrión (docs/anfitrion.md, paso 3a, 2026-11-23): la
  // calculadora no sabe si vive en una pizarra o en una página cualquiera.
  const { documento, sesion, vivo, texto: tr } = useAnfitrion();
  const cfg: ConfigCalculadora = leerCalculadora(documento.config);
  const puedeGuardar = sesion.permisos.tocar;
  // Guardar un cambio: si el anfitrión sabe mezclar (Pizarrita lo hace en el servidor, para que
  // dos a la vez no se pisen), se lo pide; si no, se aplica acá y se guarda la config entera.
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const guardar = (c: { linea?: LineaCinta; modo?: 'estandar' | 'cientifica'; borrar?: boolean }) => {
    if (documento.mezclar) {
      void documento.mezclar(c);
      return;
    }
    const antes = cfgRef.current;
    const nueva: ConfigCalculadora = { ...antes, modo: c.modo || antes.modo, cinta: c.borrar ? [] : c.linea ? [...(antes.cinta || []), c.linea] : antes.cinta || [] };
    cfgRef.current = nueva;
    documento.guardarConfig({ calculadora: nueva });
  };
  const [modoLocal, setModoLocal] = useState<ConfigCalculadora['modo'] | null>(null);
  const modo = modoLocal || cfg.modo || 'estandar';
  const [pantalla, setPantalla] = useState('0');
  const [acumulado, setAcumulado] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [nuevo, setNuevo] = useState(true);
  const [expr, setExpr] = useState('');
  const [memoria, setMemoria] = useState(0);
  const [inv, setInv] = useState(false);
  const [radianes, setRadianes] = useState(false);

  // La cinta: la guardada, más lo recién escrito (propio o ajeno) mientras llega de la base.
  const [recientes, setRecientes] = useState<LineaCinta[]>([]);
  const guardada = cfg.cinta || [];
  useEffect(() => {
    // Lo que ya trae la config se suelta de «recientes».
    setRecientes((r) => r.filter((x) => !guardada.some((g) => g.h === x.h && g.t === x.t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.cinta]);
  const [borradaLocal, setBorradaLocal] = useState<string | null>(null);
  const cinta = [...guardada.filter((g) => !borradaLocal || (g.h || '') > borradaLocal), ...recientes];
  useEffect(() => {
    if (!vivo) return undefined;
    return vivo.escuchar((cambios) => {
      const l = cambios.calcLinea as LineaCinta | undefined;
      if (l && typeof l.t === 'string') setRecientes((r) => [...r, l].slice(-200));
      if (cambios.calcBorrar) {
        setRecientes([]);
        setBorradaLocal(String(cambios.calcBorrar));
      }
      if (cambios.calcModo === 'estandar' || cambios.calcModo === 'cientifica') setModoLocal(cambios.calcModo as ConfigCalculadora['modo']);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documento.id]);
  const cintaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cintaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [cinta.length]);

  const anotar = (t: string) => {
    // Quién la escribió lo pone el servidor (sp_calculadora_cambios).
    const l: LineaCinta = { t, h: new Date().toISOString() };
    setRecientes((r) => [...r, l].slice(-200));
    if (puedeGuardar) {
      guardar({ linea: l });
      vivo?.emitir({ calcLinea: l });
    }
  };
  const cambiarModo = (m: 'estandar' | 'cientifica') => {
    setModoLocal(m);
    if (puedeGuardar) {
      guardar({ modo: m });
      vivo?.emitir({ calcModo: m });
    }
  };
  const borrarCinta = () => {
    const h = new Date().toISOString();
    setRecientes([]);
    setBorradaLocal(h);
    if (puedeGuardar) {
      guardar({ borrar: true });
      vivo?.emitir({ calcBorrar: h });
    }
  };
  const copiarCinta = () => {
    const txt = cinta
      .map((l) => {
        const i = l.t.lastIndexOf(' = ');
        return i >= 0 ? `${l.t.slice(0, i)}\t${l.t.slice(i + 3)}` : l.t;
      })
      .join('\n');
    navigator.clipboard?.writeText(txt).catch(() => undefined);
  };

  // ---- La cuenta ----
  const valor = () => deePantalla(pantalla);
  const mostrarNumero = (n: number) => {
    setPantalla(aPantalla(n));
    setNuevo(true);
  };
  const digito = (d: string) => {
    if (pantalla === 'Error') {
      limpiar();
    }
    if (nuevo) {
      setPantalla(d === '.' ? '0' + DECIMAL : d);
      setNuevo(false);
      return;
    }
    if (d === '.') {
      if (!pantalla.includes(DECIMAL)) setPantalla(pantalla + DECIMAL);
      return;
    }
    if (pantalla.replace(/[^0-9]/g, '').length >= 15) return;
    setPantalla(pantalla === '0' ? d : pantalla === '-0' ? '-' + d : pantalla + d);
  };
  const operar = (o: Op) => {
    // Otra operación enseguida de una: se cambia la operación y nada más.
    if (op && acumulado !== null && nuevo) {
      setExpr(expr.slice(0, -1) + SIMBOLO[o]);
      setOp(o);
      return;
    }
    const b = valor();
    if (op && acumulado !== null) {
      const r = aplicar(acumulado, op, b);
      setExpr(`${expr} ${aPantalla(b)} ${SIMBOLO[o]}`);
      setAcumulado(r);
      setPantalla(aPantalla(r));
    } else {
      setAcumulado(b);
      setExpr(`${aPantalla(b)} ${SIMBOLO[o]}`);
    }
    setOp(o);
    setNuevo(true);
  };
  const igual = () => {
    if (acumulado === null || !op) return;
    const b = valor();
    const r = aplicar(acumulado, op, b);
    const linea = `${expr} ${aPantalla(b)} = ${aPantalla(r)}`;
    anotar(linea);
    setAcumulado(null);
    setOp(null);
    setExpr('');
    mostrarNumero(r);
  };
  const limpiar = () => {
    setPantalla('0');
    setAcumulado(null);
    setOp(null);
    setExpr('');
    setNuevo(true);
  };
  const borrarEntrada = () => {
    setPantalla('0');
    setNuevo(true);
  };
  const retroceso = () => {
    if (nuevo) return;
    const t = pantalla.slice(0, -1);
    setPantalla(t === '' || t === '-' ? '0' : t);
  };
  const angulo = (x: number) => (radianes ? x : (x * Math.PI) / 180);
  const deAngulo = (x: number) => (radianes ? x : (x * 180) / Math.PI);
  // Una función de una tecla: cambia la pantalla y queda escrita en la cinta.
  const funcion = (f: string) => {
    const x = valor();
    let r = NaN;
    let nombre = f;
    switch (f) {
      case 'raiz':
        r = x < 0 ? NaN : Math.sqrt(x);
        nombre = '√';
        break;
      case 'inv1':
        r = x === 0 ? NaN : 1 / x;
        nombre = '1/';
        break;
      case 'cuadrado':
        r = x * x;
        nombre = 'sqr';
        break;
      case 'fact':
        r = factorial(x);
        nombre = 'fact';
        break;
      case 'sin':
        r = inv ? deAngulo(Math.asin(x)) : Math.sin(angulo(x));
        nombre = inv ? 'asin' : 'sin';
        break;
      case 'cos':
        r = inv ? deAngulo(Math.acos(x)) : Math.cos(angulo(x));
        nombre = inv ? 'acos' : 'cos';
        break;
      case 'tan':
        r = inv ? deAngulo(Math.atan(x)) : Math.tan(angulo(x));
        nombre = inv ? 'atan' : 'tan';
        break;
      case 'ln':
        r = inv ? Math.exp(x) : x <= 0 ? NaN : Math.log(x);
        nombre = inv ? 'exp' : 'ln';
        break;
      case 'log':
        r = inv ? Math.pow(10, x) : x <= 0 ? NaN : Math.log10(x);
        nombre = inv ? '10^' : 'log';
        break;
    }
    // Redondeo de las funciones trigonométricas: sin(180°) da 0 y no 1,2e-16.
    if (Math.abs(r) < 1e-12) r = 0;
    if (inv) setInv(false);
    const escrito = nombre === '1/' ? `1/(${aPantalla(x)})` : `${nombre}(${aPantalla(x)})`;
    if (acumulado === null) anotar(`${escrito} = ${aPantalla(r)}`);
    mostrarNumero(r);
  };
  const constante = (c: 'pi' | 'e') => mostrarNumero(c === 'pi' ? Math.PI : Math.E);
  const signo = () => {
    if (pantalla === '0' || pantalla === 'Error') return;
    setPantalla(pantalla.startsWith('-') ? pantalla.slice(1) : '-' + pantalla);
  };
  const porcentaje = () => {
    // Como la de Windows: a + b% es a + (a × b / 100).
    const b = valor();
    mostrarNumero(acumulado !== null ? (acumulado * b) / 100 : b / 100);
  };
  const tecla = (k: string) => {
    if (/^[0-9]$/.test(k) || k === '.') return digito(k);
    switch (k) {
      case '+':
      case '-':
      case '*':
      case '/':
      case '^':
        return operar(k);
      case '=':
        return igual();
      case 'C':
        return limpiar();
      case 'CE':
        return borrarEntrada();
      case '←':
        return retroceso();
      case '±':
        return signo();
      case '%':
        return porcentaje();
      case 'MC':
        return setMemoria(0);
      case 'MR':
        return mostrarNumero(memoria);
      case 'MS':
        return setMemoria(valor());
      case 'M+':
        return setMemoria(memoria + valor());
      case 'pi':
      case 'e':
        return constante(k);
      default:
        return funcion(k);
    }
  };

  const alTeclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let k: string | null = null;
    if (/^[0-9]$/.test(e.key)) k = e.key;
    else if (e.key === '.' || e.key === ',') k = '.';
    else if ('+-*/^%'.includes(e.key) && e.key.length === 1) k = e.key;
    else if (e.key === 'Enter' || e.key === '=') k = '=';
    else if (e.key === 'Backspace') k = '←';
    else if (e.key === 'Escape') k = 'C';
    else if (e.key === 'Delete') k = 'CE';
    if (k === null) return;
    e.preventDefault();
    e.stopPropagation();
    tecla(k);
  };

  const T = (k: string, etiqueta: string, clase: string, titulo?: string): Tecla => ({ k, etiqueta, clase, titulo });
  const estandar: Tecla[][] = [
    [T('MC', 'MC', 'ca_mem', tr('calc_mc', 'Borrar la memoria')), T('←', '←', 'ca_borrar', tr('calc_retro', 'Borrar el último dígito')), T('CE', 'CE', 'ca_borrar', tr('calc_ce', 'Borrar lo escrito')), T('C', 'C', 'ca_borrar', tr('calc_c', 'Borrar todo')), T('raiz', '√', 'ca_fn')],
    [T('MR', 'MR', 'ca_mem', tr('calc_mr', 'Traer la memoria')), T('7', '7', 'ca_num'), T('8', '8', 'ca_num'), T('9', '9', 'ca_num'), T('/', '÷', 'ca_op')],
    [T('MS', 'MS', 'ca_mem', tr('calc_ms', 'Guardar en la memoria')), T('4', '4', 'ca_num'), T('5', '5', 'ca_num'), T('6', '6', 'ca_num'), T('*', '×', 'ca_op')],
    [T('M+', 'M+', 'ca_mem', tr('calc_mmas', 'Sumar a la memoria')), T('1', '1', 'ca_num'), T('2', '2', 'ca_num'), T('3', '3', 'ca_num'), T('-', '−', 'ca_op')],
    [T('%', '%', 'ca_fn'), T('0', '0', 'ca_num'), T('.', DECIMAL, 'ca_num'), T('±', '±', 'ca_num'), T('+', '+', 'ca_op')],
    [T('inv1', '1/x', 'ca_fn'), T('=', '=', 'ca_igual')],
  ];
  // La científica: dos filas más arriba de las de siempre (así cabe en el mismo ancho).
  const cientifica: Tecla[][] = [
    [T('sin', inv ? 'asin' : 'sin', 'ca_fn'), T('cos', inv ? 'acos' : 'cos', 'ca_fn'), T('tan', inv ? 'atan' : 'tan', 'ca_fn'), T('ln', inv ? 'eˣ' : 'ln', 'ca_fn'), T('log', inv ? '10ˣ' : 'log', 'ca_fn')],
    [T('cuadrado', 'x²', 'ca_fn'), T('^', 'xʸ', 'ca_op'), T('fact', 'n!', 'ca_fn'), T('pi', 'π', 'ca_fn'), T('e', 'e', 'ca_fn')],
  ];
  const boton = (t: Tecla, i: number) => (
    <button
      key={t.k + i}
      type="button"
      className={`ca_tecla ${t.clase}${t.k === '=' ? ' ca_ancha' : ''}`}
      title={t.titulo}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        tecla(t.k);
        caja.current?.focus({ preventScroll: true });
      }}
    >
      {t.etiqueta}
    </button>
  );
  const caja = useRef<HTMLDivElement>(null);

  return (
    <div ref={caja} className={`ca_calcu ca_${modo}`} tabIndex={0} onKeyDown={alTeclado} role="application" aria-label={tr('calculadora', 'Calculadora')}>
      <div className="ca_barra" onMouseDown={(e) => e.preventDefault()}>
        <button type="button" className={`ca_modo${modo === 'estandar' ? ' ca_modo_activo' : ''}`} onClick={() => cambiarModo('estandar')}>
          {tr('calc_estandar', 'Estándar')}
        </button>
        <button type="button" className={`ca_modo${modo === 'cientifica' ? ' ca_modo_activo' : ''}`} onClick={() => cambiarModo('cientifica')}>
          {tr('calc_cientifica', 'Científica')}
        </button>
        {modo === 'cientifica' && (
          <>
            <button type="button" className={`ca_modo${inv ? ' ca_modo_activo' : ''}`} onClick={() => setInv(!inv)} title={tr('calc_inv', 'Inversa')}>
              Inv
            </button>
            <button type="button" className="ca_modo" onClick={() => setRadianes(!radianes)} title={tr('calc_angulo', 'Grados o radianes')}>
              {radianes ? 'Rad' : 'Deg'}
            </button>
          </>
        )}
      </div>
      <div className="ca_pantalla">
        <div className="ca_expr">
          {memoria !== 0 && <span className="ca_m">M</span>}
          {expr}
        </div>
        <div className="ca_valor">{pantalla}</div>
      </div>
      <div className="ca_cuerpo">
        {modo === 'cientifica' && (
          <div className="ca_teclas ca_teclas_cient">{cientifica.map((fila, i) => <div key={i} className="ca_fila">{fila.map(boton)}</div>)}</div>
        )}
        <div className="ca_teclas">{estandar.map((fila, i) => <div key={i} className="ca_fila">{fila.map(boton)}</div>)}</div>
      </div>
      <div className="ca_cinta">
        <div className="ca_cinta_barra" onMouseDown={(e) => e.preventDefault()}>
          <span className="ca_cinta_titulo">{tr('calc_cinta', 'Cinta')}</span>
          <button type="button" className="ca_modo" onClick={copiarCinta} title={tr('calc_copiar_ayuda', 'Copiar la cinta (se pega en una hoja de cálculo en dos columnas)')}>
            {tr('calc_copiar', 'Copiar')}
          </button>
          {puedeGuardar && (
            <button type="button" className="ca_modo" onClick={borrarCinta}>
              {tr('calc_borrar_cinta', 'Borrar')}
            </button>
          )}
        </div>
        <div className="ca_cinta_lineas" ref={cintaRef}>
          {cinta.map((l, i) => (
            <div key={i} className="ca_linea" title={[l.u, l.h ? new Date(l.h).toLocaleString() : ''].filter(Boolean).join(' · ')}>
              {l.t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
