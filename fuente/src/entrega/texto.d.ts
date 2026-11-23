// Lo que la entrega trae como texto (esbuild --loader:.txt=text): el código del hilo que arma el audio.
declare module '*.txt' {
  const texto: string;
  export default texto;
}
