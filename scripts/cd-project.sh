#!/bin/bash
# Atajo: source scripts/cd-project.sh  →  luego npm run ...
export HEMOC_PROJECT="${HEMOC_PROJECT:-/opt/Hemocentro_Record}"
cd "$HEMOC_PROJECT" || exit 1
echo "Directorio: $(pwd)"
