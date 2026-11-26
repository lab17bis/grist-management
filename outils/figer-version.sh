#!/bin/sh
# Fige la version stable du widget : copie le code servi par GitHub Pages dans vN/.
# Usage, depuis la racine du dépôt : sh outils/figer-version.sh 1
# À lancer seulement quand les tests passent et que le changement ne casse rien
# pour les documents existants. Un changement qui modifie les tables ou les réglages
# attendus demande un nouveau numéro (2, 3…) : l'ancienne adresse reste en service.
set -e
N="${1:?Indiquez le numéro de version, par exemple : sh outils/figer-version.sh 1}"
cd "$(dirname "$0")/.."
DEST="v$N"
rm -rf "$DEST"
mkdir "$DEST"
for f in *; do
  case "$f" in
    v[0-9]*|tests|docs|outils|modele|widget-test|README.md|*.grist) continue ;;
  esac
  cp -R "$f" "$DEST/"
done
# Ce widget charge des modules de grist-graphique : la version figée pointe vers
# la version figée correspondante de grist-graphique, pas vers sa version en cours.
for f in "$DEST/index.html" "$DEST/js/app.js"; do
  # Toute forme de chemin (../grist-graphique/, ../../grist-graphique/v1/…) devient ../../grist-graphique/vN/ : relancer le script ne double plus le chemin.
  sed -E -i.bak "s#(\.\./)+grist-graphique/(v[0-9]+/)?#../../grist-graphique/v$N/#g" "$f" && rm -f "$f.bak"
done
echo "Version stable copiée dans $DEST/"
