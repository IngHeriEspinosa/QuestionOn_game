import { describe, expect, it } from "vitest";
import es from "./dictionaries/es.json";
import en from "./dictionaries/en.json";
import { localeFromAcceptLanguage } from "./index";

/**
 * Los diccionarios no se revisan a ojo.
 *
 * Una clave que falta en un idioma se ve en producción como un hueco en blanco,
 * y normalmente lo descubre un usuario antes que nosotros. Estos tests hacen
 * que un despiste al traducir rompa el build en vez de llegar al aula.
 */

/** Recorre un objeto anidado y devuelve todas sus rutas de clave. */
function rutas(obj: unknown, prefijo = ""): string[] {
  if (Array.isArray(obj)) {
    return obj.flatMap((v, i) => rutas(v, `${prefijo}[${i}]`));
  }
  if (obj && typeof obj === "object") {
    return Object.entries(obj).flatMap(([k, v]) =>
      rutas(v, prefijo ? `${prefijo}.${k}` : k),
    );
  }
  return [prefijo];
}

/** Lee un valor a partir de una ruta como "portada.ventajas[0].titulo". */
function leer(dict: unknown, ruta: string): unknown {
  return ruta
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], dict);
}

describe("diccionarios", () => {
  it("tienen exactamente las mismas claves", () => {
    const clavesEs = rutas(es).sort();
    const clavesEn = rutas(en).sort();

    expect(
      clavesEs.filter((k) => !clavesEn.includes(k)),
      "claves sin traducir al ingles",
    ).toEqual([]);
    expect(
      clavesEn.filter((k) => !clavesEs.includes(k)),
      "claves que sobran en ingles",
    ).toEqual([]);
  });

  it("no dejan ningun texto vacio", () => {
    for (const [nombre, dict] of [
      ["es", es],
      ["en", en],
    ] as const) {
      const vacias = rutas(dict).filter((ruta) => {
        const valor = leer(dict, ruta);
        return typeof valor === "string" && valor.trim() === "";
      });
      expect(vacias, `textos vacios en ${nombre}`).toEqual([]);
    }
  });

  it("conservan los marcadores de sustitucion en ambos idiomas", () => {
    // Si una traduccion pierde el {n}, el numero no aparece y la frase queda
    // sin sentido: "Gratis hasta jugadores por sala".
    const marcadores = (texto: string) =>
      (texto.match(/\{[a-zA-Z]+\}/g) ?? []).sort();

    for (const ruta of rutas(es)) {
      const valorEs = leer(es, ruta);
      const valorEn = leer(en, ruta);
      if (typeof valorEs !== "string" || typeof valorEn !== "string") continue;

      expect(marcadores(valorEn), `marcadores distintos en "${ruta}"`).toEqual(
        marcadores(valorEs),
      );
    }
  });

  it("no dejan textos sin traducir copiados tal cual", () => {
    // Un texto identico en ambos idiomas suele ser un olvido, no una
    // coincidencia. Se permiten los nombres propios y los muy cortos.
    const permitidos = new Set(["QuestionON", "Cookies", "CSV"]);
    const sospechosos: string[] = [];

    for (const ruta of rutas(es)) {
      const valorEs = leer(es, ruta);
      const valorEn = leer(en, ruta);
      if (typeof valorEs !== "string" || typeof valorEn !== "string") continue;
      if (valorEs.length < 12) continue;
      if (permitidos.has(valorEs)) continue;
      if (valorEs === valorEn) sospechosos.push(ruta);
    }

    expect(sospechosos, "textos identicos en ambos idiomas").toEqual([]);
  });
});

describe("localeFromAcceptLanguage", () => {
  it("elige el idioma de mayor peso", () => {
    expect(localeFromAcceptLanguage("en;q=0.8,es;q=0.9")).toBe("es");
    expect(localeFromAcceptLanguage("es;q=0.3,en;q=0.9")).toBe("en");
  });

  it("trata es-ES como espanol", () => {
    // Nadie espera que pedir espanol de Espana devuelva ingles porque no
    // exista esa variante exacta.
    expect(localeFromAcceptLanguage("es-ES,es;q=0.9")).toBe("es");
    expect(localeFromAcceptLanguage("en-GB")).toBe("en");
  });

  it("ignora los idiomas que no soportamos", () => {
    expect(localeFromAcceptLanguage("fr-FR,de;q=0.9")).toBeNull();
    expect(localeFromAcceptLanguage("fr,en;q=0.5")).toBe("en");
  });

  it("devuelve null si no hay cabecera", () => {
    expect(localeFromAcceptLanguage(null)).toBeNull();
    expect(localeFromAcceptLanguage("")).toBeNull();
  });
});
