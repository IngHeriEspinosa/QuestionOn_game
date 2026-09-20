#!/usr/bin/env bash
#
# Restaura la copia mas reciente en una base DESECHABLE y comprueba que tiene
# datos.
#
# Esta es la parte que casi nadie hace y la unica que convierte un fichero en
# una copia de seguridad de verdad. Ejecutalo al menos una vez al mes.
#
#   BACKUP_PASSPHRASE=... ./ops/restore-test.sh

set -euo pipefail

: "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE}"
: "${POSTGRES_CONTAINER:=questionon-postgres-1}"
: "${POSTGRES_USER:=questionon}"
: "${BACKUP_DIR:=/var/backups/questionon}"

BASE_PRUEBA="questionon_restore_test"

ULTIMA="$(ls -1t "${BACKUP_DIR}"/questionon-*.sql.gz.gpg 2>/dev/null | head -1)"
if [ -z "$ULTIMA" ]; then
  echo "ERROR: no hay ninguna copia en ${BACKUP_DIR}" >&2
  exit 1
fi

echo "probando la restauracion de: ${ULTIMA}"

docker exec -i "$POSTGRES_CONTAINER" \
  psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS ${BASE_PRUEBA};" \
  -c "CREATE DATABASE ${BASE_PRUEBA};"

gpg --batch --yes --decrypt --passphrase "$BACKUP_PASSPHRASE" "$ULTIMA" \
  | gunzip \
  | docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$BASE_PRUEBA" -q

echo "--- comprobando que la base restaurada tiene contenido ---"
TABLAS="$(docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$BASE_PRUEBA" -t -A \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"

echo "tablas restauradas: ${TABLAS}"
if [ "$TABLAS" -lt 10 ]; then
  echo "ERROR: se esperaban al menos 10 tablas. La copia no sirve." >&2
  exit 1
fi

for tabla in users quizzes game_sessions subscriptions; do
  FILAS="$(docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$BASE_PRUEBA" -t -A \
    -c "SELECT count(*) FROM ${tabla};")"
  echo "  ${tabla}: ${FILAS} filas"
done

docker exec -i "$POSTGRES_CONTAINER" \
  psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE ${BASE_PRUEBA};" > /dev/null

echo "RESTAURACION CORRECTA: la copia sirve."
