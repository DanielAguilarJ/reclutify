#!/usr/bin/env bash
#
# Matriz de protección de los route handlers.
#
# POR QUÉ EXISTE
# -------------
# Durante la auditoría, dos rutas (`/api/info-chat` y `/api/info-notify`) se pasaron
# por alto en la primera revisión y aparecieron al volver a generar esta tabla al
# final. Una revisión manual de cincuenta y dos archivos no es fiable; una tabla que se
# regenera en un segundo, sí.
#
# NO es un análisis de seguridad: es un grep. Una marca `si` significa «el archivo
# menciona un helper de autorización», no «la autorización es correcta». Sirve para lo
# que sirve un inventario: detectar el hueco evidente, la fila con tres `NO`.
#
# CÓMO LEER LAS COLUMNAS
# ----------------------
#   AUTH  — llama a algún helper que establece identidad o pertenencia.
#   ZOD   — valida el cuerpo con un esquema.
#   RATE  — consume cuota del limitador de tasa.
#
# UN `NO` NO ES NECESARIAMENTE UN FALLO. Los casos legítimos están razonados en
# REPORTE_REFACTOR.md, sección 6.1:
#
#   · `tts`, `parse-resume`, `info-chat`, `info-notify`, `public-interview`,
#     `jobs/search`, `og` — sirven a personas sin cuenta; su control es el tope de tasa
#     y los topes de longitud, no la sesión.
#   · `stripe/webhooks` — se autentica con la firma del cuerpo, no con una cookie.
#   · `interview/ticket*` — la credencial ES el token que validan.
#   · `training/bootstrap` — autoriza con `getTrainingEmployeeFromSession()`.
#   · `training/parse-documents` y `training/save-session` — son stubs de 12 líneas que
#     devuelven `410 Gone`; no hacen nada que proteger.
#   · el resto de `training/*` — usan sus propios helpers, que este grep no siempre
#     reconoce; comprobar a mano antes de dar por buena una fila.
#
# USO
#   bash scripts/endpoint-protection-matrix.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

# Helpers que establecen identidad o pertenencia a organización.
AUTH_PATTERN='requireOrgMembership|requireApiUser|requireOrgAccess|requireInterviewAccess|requireInterviewOrOrgAccess|requireOrgAdmin|requireProgramAdmin|requireAuthenticatedUser|requireOrgSession|requireCandidateResultCredential|auth\.getUser|getTrainingEmployeeFromSession|resolveTrainingSession|requireTraining'

# Rutas cuyo `NO NO NO` está razonado. Se listan aquí para que el script señale solo lo
# que NO se ha revisado todavía: un aviso que siempre salta es un aviso que se ignora.
#
# Cada una tiene su motivo en la cabecera de arriba y en REPORTE_REFACTOR.md.
EXPECTED_OPEN='jobs/search/route.ts|og/route.tsx|stripe/webhooks/route.ts|training/parse-documents/route.ts|training/save-session/route.ts'

printf '%-56s %6s %5s %5s\n' 'ROUTE' 'AUTH' 'ZOD' 'RATE'
printf '%.0s─' $(seq 1 76); echo

missing=0

while read -r file; do
  auth=$(grep -cE "$AUTH_PATTERN" "$file" || true)
  zod=$(grep -cE '\.parse\(|safeParse|Schema\b' "$file" || true)
  rate=$(grep -c 'enforceRateLimit' "$file" || true)

  mark() { [ "$1" -gt 0 ] && printf '  si' || printf '  NO'; }

  printf '%-56s %6s %5s %5s\n' "${file#src/app/api/}" "$(mark "$auth")" "$(mark "$zod")" "$(mark "$rate")"

  # Una fila con las tres columnas en `NO` y que no esté en la lista razonada es la
  # que hay que mirar.
  if [ "$auth" -eq 0 ] && [ "$zod" -eq 0 ] && [ "$rate" -eq 0 ]; then
    if ! echo "${file#src/app/api/}" | grep -qE "^($EXPECTED_OPEN)$"; then
      missing=$((missing + 1))
      unexpected="${unexpected:-}${file#src/app/api/}
"
    fi
  fi
done < <(git ls-files src/app/api | grep -E 'route\.(ts|tsx)$' | sort)

echo
if [ "$missing" -gt 0 ]; then
  echo "⚠  $missing ruta(s) SIN REVISAR, sin AUTH, ZOD ni RATE:"
  printf '%s' "${unexpected:-}" | sed 's/^/     /'
  echo
  echo "   Protégela, o añádela a EXPECTED_OPEN con su motivo si es pública por diseño."
  exit 1
fi

echo "✓  Toda ruta declara al menos un control, salvo las razonadas en EXPECTED_OPEN."

