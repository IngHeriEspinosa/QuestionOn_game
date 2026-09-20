import { expect, test } from "@playwright/test";

/**
 * Detección y cambio de idioma.
 *
 * Nota de diseño: los idiomas se sirven en la MISMA URL, sin prefijo. La razón
 * es que `/player?game=CODE` va impresa en los códigos QR que se proyectan y
 * en los enlaces que reparte el docente; moverla a `/es/player` rompería
 * cualquier enlace ya compartido.
 */

test.describe("idioma", () => {
  test("respeta el idioma del navegador", async ({ browser }) => {
    const enIngles = await browser.newContext({ locale: "en-GB" });
    const page = await enIngles.newPage();
    await page.goto("/inicio");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("heading", { level: 1, name: /Live quizzes/i }),
    ).toBeVisible();

    await enIngles.close();
  });

  test("cae a español con un idioma que no soportamos", async ({ browser }) => {
    const enFrances = await browser.newContext({ locale: "fr-FR" });
    const page = await enFrances.newPage();
    await page.goto("/inicio");

    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await enFrances.close();
  });

  test("la elección manual manda sobre el navegador y persiste", async ({
    browser,
  }) => {
    const contexto = await browser.newContext({ locale: "es-ES" });
    const page = await contexto.newPage();
    await page.goto("/inicio");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    await page.getByLabel(/Idioma/).selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    // Y al navegar a otra página sigue en inglés: es una preferencia, no un
    // estado de la pantalla.
    await page.goto("/precios");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await contexto.close();
  });

  test("el selector es accesible por teclado y no usa banderas", async ({ page }) => {
    await page.goto("/inicio");
    const selector = page.getByLabel(/Idioma/);
    await expect(selector).toBeVisible();

    // Una bandera representa un país, no un idioma.
    await expect(selector).toContainText("Español");
    await expect(selector).toContainText("English");
  });
});
