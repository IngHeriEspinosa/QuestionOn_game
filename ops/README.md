# Operación

Todo lo necesario para levantar, mantener y recuperar QuestionON en un VPS.

## Desplegar

```bash
git pull
docker compose up -d --build
npm run db:migrate          # las migraciones no se aplican solas
docker compose ps           # comprobar que app y postgres están healthy
curl -sf https://TU-DOMINIO/api/health
```

El health check comprueba Redis y Postgres. Si devuelve 503, la aplicación
arranca pero no puede servir partidas.

## Variables obligatorias

La aplicación **se niega a arrancar** si falta alguna. Es deliberado: fallar al
arrancar es mucho mejor que fallar en mitad de una clase.

| Variable | Para qué |
|---|---|
| `REDIS_URL` | Fuente de verdad de las partidas en curso |
| `DATABASE_URL` | Cuentas, cuestionarios y resultados |
| `SESSION_SECRET` | Firma de sesiones y tokens. Mínimo 32 caracteres |
| `APP_URL` | URL pública. Sin ella los enlaces de acceso apuntan a la dirección interna |
| `MAIL_PROVIDER` | Sin él, los enlaces de acceso se volcarían al log |

Genera el secreto con `openssl rand -base64 32`.

## Copias de seguridad

```bash
# Diaria, por cron
0 3 * * * BACKUP_PASSPHRASE=... /opt/questionon/ops/backup.sh

# Mensual: comprobar que las copias SIRVEN
BACKUP_PASSPHRASE=... ./ops/restore-test.sh
```

Una copia que nunca se ha restaurado no es una copia. `restore-test.sh` la
restaura en una base desechable y falla si no encuentra las tablas esperadas.

## Incidencias frecuentes

**La partida no avanza de pregunta.** El planificador barre el ZSET de
deadlines cada 2 s. Comprueba que hay partidas encoladas:

```bash
docker compose exec redis redis-cli ZCARD games:deadlines
```

**Los informes no aparecen.** El archivado es asíncrono. Mira si se acumulan
trabajos sin consumir:

```bash
docker compose exec redis redis-cli XLEN archive:jobs
docker compose logs app | grep archivador
```

Si la cola crece, normalmente es que Postgres no responde. Los trabajos esperan;
no se pierden.

**Todo va lento de golpe.** Comprueba que ningún comando bloqueante esté
ocupando la conexión compartida de Redis:

```bash
docker compose exec redis redis-cli CLIENT LIST | grep -c blocked
```

El archivador usa su **propia** conexión precisamente por esto: cuando compartía
la del juego, un avance de pregunta pasaba de 90 ms a 25 segundos.

**El cobro no se actualiza.** Los webhooks de Stripe son la única vía por la que
cambia un plan. Revisa los reintentos en el panel de Stripe y busca en el log:

```bash
docker compose logs app | grep "webhook de Stripe"
```

## Restaurar tras perder el servidor

1. VPS nuevo con Docker.
2. `git clone` del repositorio.
3. Restaurar el `.env` desde el gestor de secretos.
4. `docker compose up -d`.
5. Restaurar la copia más reciente de Postgres.
6. `npm run db:migrate` por si la copia es de una versión anterior.
7. Apuntar el DNS al servidor nuevo.

Redis **no se restaura**: solo contiene partidas en curso, que se habrán perdido
igualmente. Nada de lo duradero vive ahí.
