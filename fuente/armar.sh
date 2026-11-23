#!/bin/sh
# Arma dist/ desde esta fuente: `npm install` y después `sh armar.sh` (o `npm run armar`).
# Primero el hilo que arma el audio (va como texto adentro de pz-app.js), después la etiqueta.
set -e
mkdir -p ../dist
npx esbuild src/canvas/audio/armarObrero.ts --bundle --minify --format=iife --resolve-extensions=.ts,.tsx,.mjs,.js,.json --log-level=warning  --outfile=src/entrega/obrero.generado.txt
npx esbuild src/entrega/etiqueta.tsx --bundle --minify --format=iife --resolve-extensions=.ts,.tsx,.mjs,.js,.json --log-level=warning --loader:.txt=text --jsx=automatic '--define:process.env.NODE_ENV="production"' --outfile=../dist/pz-app.js
cp pz-app.css ../dist/pz-app.css
