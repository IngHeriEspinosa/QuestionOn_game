import { test, expect } from "@playwright/test";

test("home loads and demo button populates questions", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Trivia en vivo, limpia y enfocada en jugar",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear sala" })).toBeVisible();
  await expect(page.getByText("Preguntas cargadas: 1")).toBeVisible();

  await page.getByRole("button", { name: "Cargar demo" }).click();

  await expect(page.getByText("Preguntas cargadas: 4")).toBeVisible();
  await expect(page.getByPlaceholder("Escribe la pregunta").first()).toHaveValue(
    /planeta rojo/i,
  );
});
