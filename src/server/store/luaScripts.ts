/**
 * Scripts Lua, embebidos como constantes en lugar de leerse de disco.
 *
 * Este módulo lo cargan dos mundos distintos: el bundler de Next y ts-node
 * (y, en la Fase 2, esbuild). Un `readFileSync` relativo a `__dirname` se
 * rompería en alguno de ellos, igual que se rompió el alias `@/`. Como cadenas
 * viajan con el bundle y funcionan en los tres.
 *
 * Se cargan con SCRIPT LOAD al arrancar y se invocan por SHA.
 */

export const SUBMIT_ANSWER_LUA = `-- Registra la respuesta de un jugador de forma atómica.
--
-- La DECISIÓN (¿acierta?, ¿cuántos puntos?) se calcula en TypeScript, en
-- src/server/domain/scoring.ts, que es puro y está testeado. Aquí solo vive el
-- COMPROMISO: deduplicar, comprobar el reloj y acumular. Son las tres cosas que
-- no se pueden hacer de forma segura desde Node con varias peticiones a la vez.
--
-- KEYS: 1=meta  2=answers:{qIdx}  3=scores  4=streaks
-- ARGV: 1=playerId  2=answerJson  3=earned  4=isCorrect("1"/"0")
--       5=expectedQIdx  6=newStreak  7=graceMs
-- Devuelve: {1, score, streak, answeredCount} si se acepta
--           {0, motivo} si se rechaza

local meta = redis.call('HMGET', KEYS[1], 'status', 'qIndex', 'revealed', 'qDeadline')

if meta[1] ~= 'active'  then return {0, 'not_active'} end
-- La respuesta llegó apuntando a otra pregunta: el jugador iba retrasado.
if meta[2] ~= ARGV[5]   then return {0, 'stale_question'} end
if meta[3] == '1'       then return {0, 'revealed'} end

-- RELOJ AUTORITATIVO: el de Redis. Así no hay desfase entre instancias y el
-- cliente no puede manipular su marca de tiempo.
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local deadline = tonumber(meta[4]) or 0
if deadline > 0 and now > deadline + tonumber(ARGV[7]) then
  return {0, 'too_late'}
end

-- IDEMPOTENCIA: gana la primera escritura. Sustituye al check-then-act que
-- había entre dos \`await\`, donde dos peticiones simultáneas del mismo jugador
-- podían puntuar las dos.
if redis.call('HSETNX', KEYS[2], ARGV[1], ARGV[2]) == 0 then
  return {0, 'duplicate'}
end

redis.call('HSET', KEYS[4], ARGV[1], ARGV[6])

-- ZINCRBY es conmutativa: el orden de llegada no altera el total, así que no
-- hace falta serializar las respuestas entre sí.
local score = redis.call('ZINCRBY', KEYS[3], tonumber(ARGV[3]), ARGV[1])

return {1, tostring(score), tonumber(ARGV[6]), redis.call('HLEN', KEYS[2])}
`;

export const ADVANCE_PHASE_LUA = `-- Avanza la fase de una partida comprobando la versión (compare-and-swap).
--
-- Hace imposible una doble transición, la disparen dos instancias a la vez, el
-- temporizador y el anfitrión, o un reintento. Solo gana una; el resto recibe
-- 'stale' y no hace nada. Es más simple y más barato que un lock distribuido,
-- que además necesitaría fencing tokens para ser correcto.
--
-- KEYS: 1=meta  2=games:deadlines  3=archive:jobs
-- ARGV: 1=expectedVersion  2=gameId  3=status  4=qIndex  5=revealed
--       6=questionDeadline("" si no hay)  7=reviewDeadline("")  8=finishedAt("")
-- Devuelve: {1, nuevaVersion} si se aplica, {0, 'stale'} si otro se adelantó

local version = redis.call('HGET', KEYS[1], 'version')
if version ~= ARGV[1] then
  return {0, 'stale'}
end

local newVersion = redis.call('HINCRBY', KEYS[1], 'version', 1)

redis.call('HSET', KEYS[1],
  'status',   ARGV[3],
  'qIndex',   ARGV[4],
  'revealed', ARGV[5],
  'qDeadline',      ARGV[6],
  'reviewDeadline', ARGV[7],
  'finishedAt',     ARGV[8])

-- El ZSET de deadlines es el planificador global: si la partida sigue viva se
-- reprograma; si terminó, se saca para que el barrido no la visite más.
local nextDeadline = 0
if ARGV[6] ~= '' then nextDeadline = tonumber(ARGV[6])
elseif ARGV[7] ~= '' then nextDeadline = tonumber(ARGV[7]) end

if ARGV[3] == 'active' and nextDeadline > 0 then
  redis.call('ZADD', KEYS[2], nextDeadline, ARGV[2])
else
  redis.call('ZREM', KEYS[2], ARGV[2])
end

-- Terminar la partida y encolarla para archivar ocurren en la MISMA operacion
-- atomica. Con dos llamadas desde Node existiria una ventana en la que una
-- partida acaba sin quedar encolada: se perderian sus resultados y el docente
-- se quedaria sin el informe de esa clase, sin que nadie se enterase.
if ARGV[3] == 'finished' then
  redis.call('XADD', KEYS[3], '*', 'gameId', ARGV[2], 'finishedAt', ARGV[8])
end

return {1, tostring(newVersion)}
`;
