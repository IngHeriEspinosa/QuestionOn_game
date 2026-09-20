#!/usr/bin/env bash
#
# Copia de seguridad de Postgres, cifrada y subida a almacenamiento externo.
#
# Pensado para un cron diario en el VPS:
#   0 3 * * * /opt/questionon/ops/backup.sh >> /var/log/questionon-backup.log 2>&1
#
# Una copia que nunca se ha restaurado NO es una copia. Usa ops/restore-test.sh
# al menos una vez al mes para comprobar que estas sirven.

set -euo pipefail

: "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE para cifrar la copia}"
: "${POSTGRES_CONTAINER:=questionon-postgres-1}"
: "${POSTGRES_USER:=questionon}"
: "${POSTGRES_DB:=questionon}"
: "${BACKUP_DIR:=/var/backups/questionon}"
: "${BACKUP_RETENTION_DAYS:=30}"

FECHA="$(date -u +%Y%m%dT%H%M%SZ)"
DESTINO="${BACKUP_DIR}/questionon-${FECHA}.sql.gz.gpg"

mkdir -p "$BACKUP_DIR"

echo "[$(date -uIs)] volcando la base de datos"

# El volcado va por tuberia y se cifra al vuelo: el SQL en claro nunca llega a
# tocar el disco.
docker exec -i "$POSTGRES_CONTAINER" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl \
  | gzip -9 \
  | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase "$BACKUP_PASSPHRASE" \
        --output "$DESTINO"

TAMANO="$(du -h "$DESTINO" | cut -f1)"
echo "[$(date -uIs)] copia creada: ${DESTINO} (${TAMANO})"

# Una copia de 0 bytes es peor que ninguna, porque da falsa tranquilidad.
if [ ! -s "$DESTINO" ]; then
  echo "ERROR: la copia esta vacia" >&2
  exit 1
fi

# Subida fuera del servidor: una copia que vive en la misma maquina no protege
# del fallo que mas duele, que es perder la maquina.
if [ -n "${BACKUP_REMOTE:-}" ]; then
  echo "[$(date -uIs)] subiendo a ${BACKUP_REMOTE}"
  rclone copy "$DESTINO" "$BACKUP_REMOTE" --no-traverse
fi

echo "[$(date -uIs)] limpiando copias de mas de ${BACKUP_RETENTION_DAYS} dias"
find "$BACKUP_DIR" -name 'questionon-*.sql.gz.gpg' \
  -mtime "+${BACKUP_RETENTION_DAYS}" -delete

echo "[$(date -uIs)] terminado"
