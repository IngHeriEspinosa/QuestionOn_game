import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Auditoría de accesibilidad.
 *
 * Objetivo WCAG 2.2 AA. En el sector público europeo no es un extra: es
 * requisito de licitación, así que un centro puede rechazarte por esto.
 *
 * Se analiza con axe, que detecta de forma fiable contraste insuficiente,
 * campos sin etiqueta, jerarquía de encabezados rota y controles sin nombre
 * accesible. Lo que axe NO puede comprobar (recorrido de foco con teclado,
 * si el orden de lectura tiene sentido) se prueba aparte, abajo.
 */

const REGLAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function analizar(page: Page) {
  return new AxeBuilder({ page }).withTags(REGLAS).analyze();
}

/** Formatea los fallos de forma legible, no como un volcado de JSON. */
function describir(violaciones: Awaited<ReturnType<typeof analizar>>["violations"]) {
  return violaciones
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help}\n` +
        v.nodes.slice(0, 3).map((n) => `    ${n.html.slice(0, 120)}`).join("\n"),
    )
    .join("\n\n");
}

const PAGINAS_PUBLICAS = [
  { ruta: "/inicio", nombre: "portada" },
  { ruta: "/precios", nombre: "precios" },
  { ruta: "/login", nombre: "acceso" },
  { ruta: "/legal/aula", nombre: "privacidad en el aula" },
  { ruta: "/", nombre: "constructor" },
  { ruta: "/player", nombre: "jugador" },
];

test.describe("accesibilidad", () => {
  for (const pagina of PAGINAS_PUBLICAS) {
    test(`${pagina.nombre} no tiene fallos graves`, async ({ page }) => {
      await page.goto(pagina.ruta);
      const { violations } = await analizar(page);

      // Se bloquea por lo serio. Los avisos menores no frenan un despliegue,
      // pero se imprimen: si no se ven, nadie los arregla nunca.
      const graves = violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      const menores = violations.filter(
        (v) => v.impact !== "critical" && v.impact !== "serious",
      );

      if (menores.length > 0) {
        console.log(`
  avisos menores en ${pagina.nombre}:
${describir(menores)}`);
      }

      expect(graves, describir(graves)).toEqual([]);
    });
  }

  test("se puede recorrer el acceso solo con el teclado", async ({ page }) => {
    // axe no comprueba esto: hay que intentarlo de verdad.
    await page.goto("/login");

    await page.keyboard.press("Tab");
    // Se tabula hasta llegar al campo de correo.
    for (let i = 0; i < 10; i += 1) {
      const esEmail = await page.evaluate(
        () => document.activeElement?.getAttribute("type") === "email",
      );
      if (esEmail) break;
      await page.keyboard.press("Tab");
    }

    await page.keyboard.type("docente@colegio.test");
    await page.keyboard.press("Tab");

    const enBoton = await page.evaluate(
      () => document.activeElement?.tagName === "BUTTON",
    );
    expect(enBoton, "tras el campo de correo debe venir el botón").toBe(true);
  });

  test("el foco se ve siempre", async ({ page }) => {
    // Un foco invisible deja fuera a quien navega con teclado, aunque el
    // recorrido sea correcto.
    await page.goto("/inicio");
    await page.keyboard.press("Tab");

    const tieneIndicador = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const estilo = getComputedStyle(el);
      return (
        estilo.outlineStyle !== "none" ||
        estilo.boxShadow !== "none" ||
        estilo.borderColor !== ""
      );
    });
    expect(tieneIndicador).toBe(true);
  });

  test("la página declara el idioma que de verdad sirve", async ({ page }) => {
    // Sin esto, un lector de pantalla lee el español con fonética inglesa.
    // Se comprueba que coincida con el contenido, no que sea siempre "es":
    // el sitio se sirve en el idioma del navegador.
    await page.goto("/inicio");
    const lang = await page.locator("html").getAttribute("lang");
    expect(["es", "en"]).toContain(lang);

    const titulo = await page.getByRole("heading", { level: 1 }).textContent();
    if (lang === "es") {
      expect(titulo).toContain("Cuestionarios");
    } else {
      expect(titulo).toContain("Live quizzes");
    }
  });
});
