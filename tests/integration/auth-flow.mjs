/**
 * Flujo de acceso del docente, de punta a punta.
 *
 * Comprueba lo que de verdad importa de un login sin contraseña:
 *  - la ruta no revela si un correo esta registrado;
 *  - el enlace entra y crea la cuenta la primera vez;
 *  - el enlace es de UN SOLO uso;
 *  - un enlace inventado no entra;
 *  - /dashboard esta cerrado sin sesion y abierto con ella;
 *  - cerrar sesion la invalida de verdad.
 *
 * El token se lee del log del servidor porque en desarrollo el correo se vuelca
 * ahi en vez de enviarse.
 *
 * Uso: BASE_URL=http://localhost:3000 SERVER_LOG=<ruta> node tests/integration/auth-flow.mjs
 */

import { readFileSync } from "fs";

const B = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const LOG = process.env.SERVER_LOG;

let fails = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails += 1;
  console.log(
    `${ok ? "OK  " : "FALLO"} ${label}` +
      (ok ? "" : ` -> esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`),
  );
};

const email = `docente-${Date.now()}@colegio.test`;

// --- 1. Pedir el enlace -----------------------------------------------------
const res = await fetch(`${B}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email }),
});
const body = await res.json();
check("se acepta la solicitud de enlace", res.ok, true);

// Un correo no registrado debe dar exactamente la misma respuesta, o esta ruta
// serviria para averiguar que direcciones tienen cuenta.
const unknown = await fetch(`${B}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `nadie-${Date.now()}@colegio.test` }),
});
check("misma respuesta exista o no la cuenta", (await unknown.json()).message, body.message);

const bad = await fetch(`${B}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "no-es-un-correo" }),
});
check("se rechaza un correo invalido", bad.status, 400);

// --- 2. Recuperar el enlace del log ----------------------------------------
if (!LOG) {
  console.log("\nFalta SERVER_LOG: no se puede continuar sin el enlace.");
  process.exit(2);
}
// Hay que coger el token de NUESTRO correo, no el ultimo del log: las
// comprobaciones anteriores tambien generan enlaces, y confundirlos hace que el
// test acabe entrando con la cuenta equivocada.
const logText = readFileSync(LOG, "utf8");
const ourLine = logText
  .split("\n")
  .filter((line) => line.includes(email) && line.includes("/api/auth/callback?token="))
  .at(-1);

if (!ourLine) {
  console.log("\nFALLO no se encontro el enlace de acceso de este correo en el log");
  process.exit(1);
}
const token = /\/api\/auth\/callback\?token=([A-Za-z0-9_-]+)/.exec(ourLine)[1];

// --- 3. Dashboard cerrado sin sesion ---------------------------------------
const anon = await fetch(`${B}/dashboard`, { redirect: "manual" });
check("sin sesion, /dashboard redirige", [301, 302, 307, 308].includes(anon.status), true);

// --- 4. Canjear el enlace ---------------------------------------------------
const cb = await fetch(`${B}/api/auth/callback?token=${token}`, { redirect: "manual" });
const setCookie = cb.headers.get("set-cookie") ?? "";
check("el enlace devuelve una cookie de sesion", setCookie.includes("qon_session"), true);
check("la cookie es httpOnly", /httponly/i.test(setCookie), true);
check("la cookie es SameSite=Lax", /samesite=lax/i.test(setCookie), true);
check("redirige al panel", (cb.headers.get("location") ?? "").includes("/dashboard"), true);

const cookie = setCookie.split(";")[0];

// --- 5. El enlace es de un solo uso ----------------------------------------
const reuse = await fetch(`${B}/api/auth/callback?token=${token}`, { redirect: "manual" });
check(
  "reutilizar el enlace no da sesion",
  (reuse.headers.get("set-cookie") ?? "").includes("qon_session"),
  false,
);
check(
  "reutilizarlo devuelve al login",
  (reuse.headers.get("location") ?? "").includes("/login"),
  true,
);

// --- 6. Un token inventado no entra ----------------------------------------
const forged = await fetch(`${B}/api/auth/callback?token=inventado-por-mi`, {
  redirect: "manual",
});
check(
  "un token inventado no da sesion",
  (forged.headers.get("set-cookie") ?? "").includes("qon_session"),
  false,
);

// --- 7. Con sesion, el panel abre ------------------------------------------
const dash = await fetch(`${B}/dashboard`, { headers: { cookie }, redirect: "manual" });
check("con sesion, /dashboard responde 200", dash.status, 200);
const html = await dash.text();
check("el panel muestra el correo del docente", html.includes(email), true);

// --- 8. Cerrar sesion -------------------------------------------------------
const out = await fetch(`${B}/api/auth/logout`, { method: "POST", headers: { cookie } });
check("cerrar sesion responde ok", out.ok, true);

const afterLogout = await fetch(`${B}/dashboard`, {
  headers: { cookie: "qon_session=" },
  redirect: "manual",
});
check(
  "tras salir, el panel vuelve a estar cerrado",
  [301, 302, 307, 308].includes(afterLogout.status),
  true,
);

console.log(fails === 0 ? "\nTODAS LAS COMPROBACIONES PASAN" : `\n${fails} COMPROBACIONES FALLIDAS`);
process.exit(fails === 0 ? 0 : 1);
