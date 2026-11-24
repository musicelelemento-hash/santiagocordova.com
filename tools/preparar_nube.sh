#!/usr/bin/env bash
# Deja una sesion en la nube (Claude Code web) igual que la PC local.
#
# En la nube solo se clona el repo que se eligio. Este workspace son DOS repos:
#   - santiagocordova.com  (este: extensiones, docs, worker R2)
#   - santiagocordova      (la web, que en local vive en santiagocordova-main/)
# El script trae el que falte, instala dependencias y avisa que .env falta.
# Es idempotente: correrlo dos veces no rompe nada.
#
# Uso, desde la raiz de este repo:   bash tools/preparar_nube.sh
set -u
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"
WEB="$RAIZ/santiagocordova-main"

echo "== 1/3 · Repo de la web =="
if [ -d "$WEB/.git" ]; then
  echo "ok: santiagocordova-main ya esta"
elif [ -d "$RAIZ/../santiagocordova/.git" ]; then
  # La sesion se abrio con los dos repos: quedan como carpetas hermanas.
  ln -s "$RAIZ/../santiagocordova" "$WEB" && echo "ok: enlazado desde ../santiagocordova"
else
  git clone --depth 50 https://github.com/musicelelemento-hash/santiagocordova.git "$WEB" \
    && echo "ok: clonado" \
    || echo "FALTA: no se pudo clonar la web. Agrega el repo 'santiagocordova' a la sesion."
fi

echo "== 2/3 · Dependencias =="
for d in "extenciones web/01_Nueva_Luz_3.0" "santiagocordova-main" "santiagocordova-main/telegram-bot"; do
  if [ -f "$RAIZ/$d/package.json" ] && [ ! -d "$RAIZ/$d/node_modules" ]; then
    (cd "$RAIZ/$d" && npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null 2>&1) \
      && echo "ok: $d" || echo "FALLO npm en $d"
  else
    echo "ok: $d (ya instalado o sin package.json)"
  fi
done

echo "== 3/3 · Variables de entorno =="
if [ -d "$WEB" ] && [ ! -f "$WEB/.env.local" ]; then
  echo "AVISO: la web no tiene .env.local (es normal en la nube, nunca va a git)."
  echo "       Los nombres estan en santiagocordova-main/docs/VARIABLES_ENTORNO.md."
  echo "       Cargalos como variables del entorno en claude.ai/code, no en un archivo."
fi
echo "listo."
