import { expect, test } from "@playwright/test";

/**
 * Sección legal.
 *
 * Dos cosas importan aquí y ninguna es estética:
 *
 *  1. que un centro pueda llegar a estos documentos sin buscarlos, porque es lo
 *     que mira antes de firmar;
 *  2. que el aviso de "sin revisar" siga visible mientras LEGAL_REVIEWED no sea
 *     "true", para que estos textos no acaben publicados por olvido.
 */

const PAGINAS = [
  { ruta: "/legal/aula", titulo: "Privacidad en el aula" },
  { ruta: "/legal/privacidad", titulo: "Política de privacidad" },
  { ruta: "/legal/terminos", titulo: "Términos del servicio" },
  { ruta: "/legal/cookies", titulo: "Cookies" },
  { ruta: "/legal/dpa", titulo: "Acuerdo de tratamiento de datos" },
];

test.describe("sección legal", () => {
  for (const pagina of PAGINAS) {
    test(`${pagina.titulo} se publica y es navegable`, async ({ page }) => {
      await page.goto(pagina.ruta);
      await expect(
        page.getByRole("heading", { name: pagina.titulo, level: 1 }),
      ).toBeVisible();

      // Desde cualquier página legal se llega a las demás.
      await expect(page.getByRole("navigation", { name: "Secciones legales" })).toBeVisible();
    });
  }

  test("se llega a lo legal desde la portada", async ({ page }) => {
    await page.goto("/");
    const pie = page.getByRole("navigation", { name: "Enlaces del pie" });
    await expect(pie).toBeVisible();

    await pie.getByRole("link", { name: "Privacidad en el aula" }).click();
    await expect(
      page.getByRole("heading", { name: "Privacidad en el aula", level: 1 }),
    ).toBeVisible();
  });

  test("avisa de que el texto no está revisado", async ({ page }) => {
    // Si algún día se pone LEGAL_REVIEWED=true, este test debe actualizarse a
    // conciencia, no por accidente.
    await page.goto("/legal/terminos");
    // Selector por texto, no por rol: Next añade su propio anunciador de rutas
    // con role="alert" y el selector por rol resultaba ambiguo.
    await expect(page.getByText("Borrador sin revisión legal")).toBeVisible();
  });

  test("la privacidad en el aula dice lo esencial sin rodeos", async ({ page }) => {
    await page.goto("/legal/aula");
    // Es la frase que un centro necesita encontrar.
    await expect(page.getByText(/el alumnado no crea cuenta/i)).toBeVisible();
  });
});
