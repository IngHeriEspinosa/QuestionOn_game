import { describe, expect, it } from "vitest";
import { isOffensiveNickname, sanitizeNickname } from "./nicknames";

describe("sanitizeNickname", () => {
  it("cae a Invitado si el apodo viene vacío", () => {
    expect(sanitizeNickname("   ")).toEqual({ ok: true, name: "Invitado" });
  });

  it("recorta a 32 caracteres", () => {
    const result = sanitizeNickname("a".repeat(100));
    expect(result.ok && result.name.length).toBe(32);
  });

  it("elimina caracteres invisibles que falsean el nombre en pantalla", () => {
    const result = sanitizeNickname("An\u200ba\u202e");
    expect(result).toEqual({ ok: true, name: "Ana" });
  });

  it("acepta nombres normales, incluidos los que llevan tildes o eñes", () => {
    for (const name of ["Ana", "José María", "Íñigo", "Lucía_23", "Ana-Belén"]) {
      expect(sanitizeNickname(name)).toEqual({ ok: true, name });
    }
  });

  it("rechaza apodos ofensivos", () => {
    const result = sanitizeNickname("gilipollas");
    expect(result.ok).toBe(false);
  });
});

describe("isOffensiveNickname", () => {
  it("detecta las sustituciones habituales de letras por números", () => {
    expect(isOffensiveNickname("p3n1s")).toBe(true);
    expect(isOffensiveNickname("sh1t")).toBe(true);
  });

  it("detecta separadores intercalados", () => {
    expect(isOffensiveNickname("p.u.t.a")).toBe(true);
    expect(isOffensiveNickname("g i l i p o l l a s")).toBe(true);
  });

  it("detecta letras repetidas para esquivar el filtro", () => {
    expect(isOffensiveNickname("puuuuta")).toBe(true);
  });

  it("no castiga nombres legítimos", () => {
    // Un falso positivo que rechaza el nombre real de un alumno delante de
    // toda la clase es peor que dejar pasar un insulto tonto.
    for (const name of ["Marta", "Putxeta", "Iker", "Analía", "Cosme"]) {
      expect(isOffensiveNickname(name)).toBe(false);
    }
  });
});
