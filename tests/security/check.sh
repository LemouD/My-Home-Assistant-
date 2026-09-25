#!/usr/bin/env bash
# Contrôles de sécurité sur les fichiers suivis par git.
# Code de sortie 1 si un contrôle bloquant échoue ; les avertissements ne bloquent pas.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 2

echecs=0
exclus=(':!tests/security')

echec()   { echo "::error::$1"; echecs=$((echecs + 1)); }
warning() { echo "::warning::$1"; }

# 1. Les chemins sensibles doivent être ignorés par git
for chemin in smarthome/js/config.js .env secrets.yaml cle.pem cle.key; do
  git check-ignore -q "$chemin" || echec "$chemin n'est pas couvert par .gitignore"
done

# 2. Aucun fichier sensible ne doit être suivi (même ajouté avec git add -f)
suivis=$(git ls-files | grep -E '(^|/)(config\.js|\.env|secrets\.yaml)$|\.(pem|key)$')
[ -n "$suivis" ] && echec "Fichier sensible suivi par git : $suivis"

# 3. Aucun JWT (format des tokens longue durée HA)
jwt=$(git grep -nIE 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' -- . "${exclus[@]}")
[ -n "$jwt" ] && echec "Token JWT trouvé : $(echo "$jwt" | cut -d: -f1,2)"

# 4. HA_TOKEN ne doit contenir qu'un placeholder court
token=$(git grep -nIE "HA_TOKEN[\"']?\s*[:=]\s*[\"'][^\"']{20,}[\"']" -- . "${exclus[@]}")
[ -n "$token" ] && echec "HA_TOKEN renseigné en dur : $(echo "$token" | cut -d: -f1,2)"

# 5. Pas d'ID de webhook en dur (les webhooks HA ne demandent pas d'authentification)
webhook=$(git grep -nIE '/api/webhook/[A-Za-z0-9_-]{8,}' -- . "${exclus[@]}")
[ -n "$webhook" ] && echec "ID de webhook en dur : $(echo "$webhook" | cut -d: -f1,2)"

# 6. Exécution de code dynamique interdite
dyn=$(git grep -nIE '\beval\s*\(|new\s+Function\s*\(|document\.write\s*\(' -- '*.js' '*.html' "${exclus[@]}")
[ -n "$dyn" ] && echec "eval / new Function / document.write : $(echo "$dyn" | cut -d: -f1,2 | tr '\n' ' ')"

# 7. Injection HTML : avertissement (préférer textContent / createElement)
html=$(git grep -nIE '\.(innerHTML|outerHTML)\s*\+?=|insertAdjacentHTML\s*\(' -- '*.js' '*.html' "${exclus[@]}")
if [ -n "$html" ]; then
  while IFS= read -r ligne; do
    warning "Injection HTML à vérifier : $(echo "$ligne" | cut -d: -f1,2)"
  done <<< "$html"
fi

if [ "$echecs" -gt 0 ]; then
  echo "Sécurité : $echecs contrôle(s) en échec."
  exit 1
fi
echo "Sécurité : tous les contrôles bloquants passent."
