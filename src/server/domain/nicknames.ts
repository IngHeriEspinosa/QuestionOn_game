/**
 * Moderación de apodos.
 *
 * En un aula el apodo se proyecta en la pizarra delante de todo el grupo. Un
 * nombre ofensivo no es una travesura: es un problema de convivencia que le
 * estalla al docente en mitad de la clase, y de reputación para el producto.
 *
 * No pretende ser exhaustiva —ninguna lista lo es— sino cortar lo evidente sin
 * castigar nombres legítimos. Ante la duda, se deja pasar: un falso positivo
 * que rechaza el nombre real de un alumno es peor que un insulto tonto.
 */

const MAX_LENGTH = 32;

/** Raíces ofensivas en español e inglés, cotejadas sobre el texto normalizado. */
const BLOCKED_ROOTS = [
  "puta", "puto", "joder", "mierda", "gilipollas", "cabron", "coño", "polla",
  "follar", "maricon", "zorra", "subnormal", "retrasado", "violar", "nazi",
  "hitler", "fuck", "shit", "bitch", "cunt", "nigger", "rape", "penis",
];

/**
 * Normaliza para comparar: minúsculas, sin tildes y sin los trucos habituales
 * de sustituir letras por números o repetirlas.
 */
function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5\$/g, "s")
    .replace(/7/g, "t")
    // Separadores intercalados: p-u-t-a, p.u.t.a
    .replace(/[\s._\-*]/g, "")
    // Letras repetidas: puuuta
    .replace(/(.)\1{2,}/g, "$1");
}

export function isOffensiveNickname(name: string): boolean {
  const normalized = normalize(name);
  return BLOCKED_ROOTS.some((root) => normalized.includes(root));
}

export type NicknameResult =
  | { ok: true; name: string }
  | { ok: false; reason: string };

/**
 * Valida y normaliza un apodo.
 *
 * El nombre vacío no es un error: se cae a "Invitado", que es el comportamiento
 * que ya tenía la aplicación.
 */
export function sanitizeNickname(raw: string): NicknameResult {
  // Caracteres de control y marcas de dirección de texto: invisibles, pero
  // permiten falsear cómo se ve el nombre en pantalla.
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, "")
    .trim()
    .slice(0, MAX_LENGTH);

  if (!cleaned) return { ok: true, name: "Invitado" };

  if (isOffensiveNickname(cleaned)) {
    return { ok: false, reason: "Ese apodo no es apropiado. Elige otro." };
  }

  return { ok: true, name: cleaned };
}
