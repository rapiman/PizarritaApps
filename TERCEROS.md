# Lo de terceros que va adentro

| Qué | Dónde va | Licencia | Texto |
|---|---|---|---|
| React y React DOM 18.3.1, scheduler 0.23.2 (Meta) | `dist/pz-app.js` | MIT | `licencias/react.txt`, `licencias/react-dom.txt`, `licencias/scheduler.txt` |
| fflate 0.8.3 (Arjun Barrett): leer y escribir los `.zip` | `dist/pz-app.js` | MIT | `licencias/fflate.txt` |
| lamejs 1.2.7 (@breezystack/lamejs), el codificador de mp3 LAME pasado a JavaScript ([lame.sourceforge.net](https://lame.sourceforge.net)) | adentro de `dist/pz-app.js`, en el hilo que arma el audio | LGPL-3.0 | `licencias/lamejs.txt`, `licencias/LGPL-3.0.txt` |
| Los filtros `afftdn` y `loudnorm` de FFmpeg ([ffmpeg.org](https://ffmpeg.org)), pasados a TypeScript (`fuente/src/canvas/audio/afftdn.ts`, `loudnorm.ts`; cada uno lleva su aviso) | `dist/pz-app.js` | LGPL-2.1 o posterior | `licencias/LGPL-2.1.txt` |
| Bootstrap Icons, recortado | `dist/iconos.css`, `dist/iconos.woff2` | MIT | `licencias/bootstrap-icons.txt` |

**Sobre las LGPL.** Las dos permiten ir dentro de una obra AGPL. Lo que piden: que quien reciba la
obra pueda cambiar esa parte y volver a armar el todo. Por eso va `fuente/` completo, con cómo
armarlo: se puede cambiar lamejs (o los filtros) y volver a generar `dist/pz-app.js`. LAME pide
además reconocer su uso y dar el enlace a su sitio, que es lo de la tabla.

Esto es lo que se entiende de las licencias, no una opinión legal.
