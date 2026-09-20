import { readFileSync } from "fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * La pantalla de informes tal y como la ve el docente.
 *
 * Comprueba lo que de verdad usa: que la partida aparece, que las preguntas
 * salen ordenadas de peor a mejor (que es lo que le dice qué repasar) y que la
 * exportacion aparece bloqueada en el plan gratuito, no escondida.
 */

const SERVER_LOG = process.env.SERVER_LOG;

async function signIn(page: Page, baseURL: string) {
  const email = `e2e-informe-${Date.now()}@colegio.test`;
  await page.request.post(`${baseURL}/api/auth/login`, { data: { email } });
  await page.waitForTimeout(400);

  const line = readFileSync(SERVER_LOG!, "utf8")
    .split("\n")
    .filter((l) => l.includes(email) && l.includes("/api/auth/callback?token="))
    .at(-1);
  const token = /\/api\/auth\/callback\?token=([A-Za-z0-9_-]+)/.exec(line!)![1];
  await page.goto(`/api/auth/callback?token=${token}`);
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Juega una partida entera por API y devuelve su codigo. */
async function playGame(page: Page, baseURL: string) {
  const create = await page.request.post(`${baseURL}/api/game`, {
    data: {
      title: "Repaso E2E",
      questionTimeSec: 120,
      // Sin barajar: con el barajado activo (que es el defecto) responder [0]
      // no equivale a responder "A", y el test dejaria de ser determinista.
      shuffleChoices: false,
      enableSpeedBonus: false,
      enableStreakBonus: false,
      questions: [
        { prompt: "Facil", choices: ["A", "B", "C", "D"], correct: [0], type: "single" },
        { prompt: "Dificil", choices: ["A", "B", "C", "D"], correct: [3], type: "single" },
      ],
    },
  });
  const { gameId } = await create.json();

  const players = [];
  for (const name of ["Ana", "Luis"]) {
    const res = await page.request.post(`${baseURL}/api/game/${gameId}/join`, {
      data: { name },
    });
    players.push(await res.json());
  }

  await page.request.post(`${baseURL}/api/game/${gameId}/start`);

  // Los dos aciertan la facil; los dos fallan la dificil.
  for (const p of players) {
    await page.request.post(`${baseURL}/api/game/${gameId}/answer`, {
      data: { playerId: p.playerId, playerToken: p.playerToken, selected: [0] },
    });
  }
  await page.request.post(`${baseURL}/api/game/${gameId}/advance`);
  await page.request.post(`${baseURL}/api/game/${gameId}/advance`);
  for (const p of players) {
    await page.request.post(`${baseURL}/api/game/${gameId}/answer`, {
      data: { playerId: p.playerId, playerToken: p.playerToken, selected: [0] },
    });
  }
  await page.request.post(`${baseURL}/api/game/${gameId}/advance`);
  await page.request.post(`${baseURL}/api/game/${gameId}/advance`);

  return gameId;
}

test.describe("informes", () => {
  test.skip(!SERVER_LOG, "requiere SERVER_LOG para leer el enlace de acceso");

  test("el docente ve el informe con las preguntas a repasar primero", async ({
    page,
    baseURL,
  }) => {
    await signIn(page, baseURL!);
    await playGame(page, baseURL!);

    // El archivado es asincrono: se reintenta hasta que aparece.
    await expect(async () => {
      await page.goto("/dashboard/informes");
      await expect(page.getByText("Repaso E2E")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000 });

    await page.getByText("Repaso E2E").click();

    await expect(
      page.getByRole("heading", { name: "Preguntas que más costaron" }),
    ).toBeVisible();

    // La que nadie acerto debe salir antes que la que acertaron todos.
    const preguntas = page.locator("li").filter({ hasText: "% de acierto" });
    await expect(preguntas.first()).toContainText("Dificil");

    // El alumnado aparece en la tabla.
    await expect(page.getByRole("cell", { name: "Ana" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Luis" })).toBeVisible();

    // En plan gratuito la exportacion se muestra bloqueada, no escondida:
    // esconderla haria que el docente no supiera que existe.
    await expect(page.getByRole("button", { name: "Exportar a CSV" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "los planes de pago" })).toBeVisible();
  });
});
