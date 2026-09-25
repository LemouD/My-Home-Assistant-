#!/usr/bin/env bash
# Vérifie que check.sh détecte bien chaque cas interdit, et accepte un repo propre.
set -uo pipefail

racine="$(git rev-parse --show-toplevel)"
check="$racine/tests/security/check.sh"
resultat=0

# Fragments assemblés à l'exécution pour ne pas déclencher le scan sur ce fichier
jwt="ey""JhbGciOiJIUzI1NiJ9.ey""JzdWIiOiJ0ZXN0MTIzNDU2In0.abcdefghijklmnopqrstuv"

nouveau_repo() {
  tmp=$(mktemp -d)
  git -C "$tmp" init -q
  cp "$racine/.gitignore" "$tmp/"
  mkdir -p "$tmp/smarthome/js"
  echo "const CONFIG = { HA_TOKEN: 'VOTRE_TOKEN_ICI' };" > "$tmp/smarthome/js/config.example.js"
}

attendu() {
  local nom="$1" code_attendu="$2"
  git -C "$tmp" add -A >/dev/null 2>&1
  (cd "$tmp" && bash "$check" >/dev/null 2>&1)
  local code=$?
  if [ "$code" -eq "$code_attendu" ]; then
    echo "OK   $nom"
  else
    echo "KO   $nom (attendu $code_attendu, obtenu $code)"
    resultat=1
  fi
  rm -rf "$tmp"
}

nouveau_repo
attendu "repo propre accepté" 0

nouveau_repo
echo "HA_TOKEN: '$jwt'" > "$tmp/smarthome/js/config.js"
git -C "$tmp" add -f smarthome/js/config.js
attendu "config.js forcé dans git refusé" 1

nouveau_repo
echo "const t = '$jwt';" > "$tmp/smarthome/js/api.js"
attendu "JWT dans un fichier refusé" 1

nouveau_repo
echo "const CONFIG = { HA_TOKEN: 'abcdefghijklmnopqrstuvwxyz0123' };" > "$tmp/smarthome/js/autre.js"
attendu "HA_TOKEN en dur refusé" 1

nouveau_repo
echo "fetch('/api/webhook/porte-garage-a1b2c3d4');" > "$tmp/smarthome/js/hook.js"
attendu "ID de webhook en dur refusé" 1

nouveau_repo
echo "ev""al(reponse);" > "$tmp/smarthome/js/dyn.js"
attendu "eval refusé" 1

nouveau_repo
echo "el.inner""HTML = x;" > "$tmp/smarthome/js/vue.js"
attendu "innerHTML seulement averti" 0

nouveau_repo
grep -v 'config.js' "$racine/.gitignore" > "$tmp/.gitignore"
attendu ".gitignore sans config.js refusé" 1

exit "$resultat"
