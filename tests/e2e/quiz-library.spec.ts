import { readFileSync } from "fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * El ciclo que convierte la app en algo util para preparar clase: guardar un
 * cuestionario desde el constructor y recuperarlo despues de recargar.
 *
 * Hasta ahora las preguntas solo vivian en el estado de React, asi que un F5
 * las borraba.
 *
 * Necesita SERVER_LOG para leer el enlace de acceso, que en desarrollo se
 * vuelca al log en vez de enviarse por correo.
 */

const SERVER_LOG = process.env.SERVER_LOG;

/** Entra con una cuenta nueva usando el enlace magico. */
async function signIn(page: Page, baseURL: string) {
  const email = `e2e-${Date.now()}@colegio.test`;

  await page.request.post(`${baseURL}/api/auth/login`, { data: { email } });
  await page.waitForTimeout(400);

  const line = readFileSync(SERVER_LOG!, "utf8")
    .split("\n")
    .filter((l) => l.includes(email) && l.includes("/api/auth/callback?token="))
    .at(-1);

  if (!line) throw new Error(`no se encontro el enlace de acceso de ${email}`);
  const token = /\/api\/auth\/callback\?token=([A-Za-z0-9_-]+)/.exec(line)![1];

  await page.goto(`/api/auth/callback?token=${token}`);
  await expect(page).toHaveURL(/\/dashboard/);
  return email;
}

test.describe("biblioteca de cuestionarios", () => {
  test.skip(!SERVER_LOG, "requiere SERVER_LOG para leer el enlace de acceso");

  test("guardar desde el constructor y recuperarlo tras recargar", async ({
    page,
    baseURL,
  }) => {
    const email = await signIn(page, baseURL!);

    // El panel arranca vacio.
    await expect(page.getByText("Todavía no has guardado ningún cuestionario")).toBeVisible();

    // Al constructor, con la demo cargada para tener contenido real.
    await page.goto("/");
    await expect(page.getByText(email)).toBeVisible();
    await page.getByRole("button", { name: "Cargar demo" }).click();
    await expect(page.getByText("Preguntas cargadas: 4")).toBeVisible();

    const title = `Cuestionario E2E ${Date.now()}`;
    const titleInput = page.getByPlaceholder("Ej. Preguntas de cultura general");
    await titleInput.fill(title);

    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText("Cuestionario guardado")).toBeVisible();

    // La prueba de fuego: recargar. Antes, esto borraba todo.
    await page.reload();
    // Selector por etiqueta: el constructor tiene otros <select> (tipo de
    // pregunta, tipo de media) y "select" a secas es ambiguo.
    const library = page.getByLabel("Mis cuestionarios");
    await expect(library).toContainText(title);

    // Y abrirlo devuelve las preguntas.
    await library.selectOption({ label: `${title} (4)` });
    await expect(page.getByText(`"${title}" cargado`)).toBeVisible();
    await expect(page.getByText("Preguntas cargadas: 4")).toBeVisible();
    await expect(page.getByPlaceholder("Escribe la pregunta").first()).toHaveValue(
      /planeta rojo/i,
    );

    // Y aparece en el panel.
    await page.goto("/dashboard");
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText("4 preguntas")).toBeVisible();
  });

  test("sin sesion, el constructor sigue funcionando y ofrece entrar", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByText("Entra con tu correo para guardar este cuestionario"),
    ).toBeVisible();
    // Lo importante: jugar sin cuenta sigue siendo posible.
    await expect(page.getByRole("button", { name: "Crear sala" })).toBeVisible();
  });
});
