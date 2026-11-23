# pz-app — programas de Pizarrita para cualquier página

Programas de [Pizarrita System](https://pizarrita.wedwed.org) que funcionan solos, sin Pizarrita:
se ponen en cualquier página con una etiqueta, un `.js` y un `.css`. Guardan en archivos.

| Programa | Qué hace | Guarda |
|---|---|---|
| `calculadora` | Calculadora con cinta | `.json` |
| `editpro` | Pizarrita Edit Pro: editor de audio en vista de onda (cortar, pegar, fundidos, eco, al revés, grabar, velocidad, quitar el ruido, emparejar el volumen) | `.zip` con el audio original, las ediciones y el audio ya armado en mp3 |

## Uso

```html
<link rel="stylesheet" href="dist/iconos.css">
<link rel="stylesheet" href="dist/pz-app.css">

<pz-app programa="editpro" editar></pz-app>

<script src="dist/pz-app.js"></script>
```

`dist/iconos.woff2` va en la misma carpeta que `dist/iconos.css`.

### Atributos

| Atributo | Para qué |
|---|---|
| `programa` | Cuál: `calculadora` o `editpro`. |
| `editar` | Sin él, solo se mira. |
| `archivo` | Dirección de un `.json` o `.zip` para abrir al empezar. |
| `nombre` | El nombre del archivo que se baja al guardar. |
| `idioma` | `es` o `en`. Sin él, el de la página (`<html lang>`) o el del navegador; lo que no es español va en inglés. |
| `plugins` | De dónde bajan los plugins de audio (WAM), para los programas que los usan. No viajan con la entrega. |

### Guardar

Al guardar, la etiqueta avisa con el suceso `pz-guardar` (`detail: { documento, archivo }`; el
archivo es un `Blob`, `.json` o `.zip` según su `type`). Si la página lo cancela con
`preventDefault()`, se queda ella con el archivo y lo guarda donde quiera; si no, se baja al equipo
de quien lo usa.

```js
document.addEventListener('pz-guardar', (e) => {
  e.preventDefault();
  subirAMiServidor(e.detail.archivo);
});
```

### El archivo

- Sin archivos adentro: un `.json` `{ pz, programa, nombre, config, piezas, preferencias }`.
- Con archivos adentro: un `.zip` con `documento.json` (lo mismo) y la carpeta `archivos/`. En el
  documento, `archivo` es el original (no se toca nunca) y `resultado` es lo ya armado, que es lo
  que se muestra y se oye.

Una demostración: `demo/index.html` (abrirla desde un servidor web; desde el disco el navegador no
deja abrir el archivo de prueba).

## Licencia

**AGPL-3.0** (ver `LICENSE`). Quien ponga estos programas en un sitio tiene que ofrecer a sus
visitantes el código fuente, con los cambios que les haya hecho: está completo en `fuente/`, con
cómo armarlo. Lo de terceros que va adentro, y sus licencias, está en `TERCEROS.md`.

## De dónde sale

Se desarrolla en el repo de Pizarrita y se arma con `bin/armar_entrega.py`. El commit de origen
está en `ORIGEN`. Los cambios se hacen allá, no acá: esto se vuelve a generar entero.

---

## English

Pizarrita programs that run on any web page, without Pizarrita: one tag, one `.js`, one `.css`.
`<pz-app programa="editpro" editar></pz-app>` gives Pizarrita Edit Pro, an audio editor that saves
a `.zip` with the original audio, the edits and the rendered mp3. Attributes, the `pz-guardar`
event and the file format are described above. License: AGPL-3.0; full source in `fuente/`;
third-party licenses in `TERCEROS.md`.
