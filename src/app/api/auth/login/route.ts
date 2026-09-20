import { NextRequest, NextResponse } from "next/server";
import { issueLoginToken, TooManyRequestsError } from "@/server/auth/magicLink";
import { getMailer } from "@/server/mail";
import { logger } from "@/lib/logger";
import { absoluteUrl } from "@/lib/appUrl";
import { enforceRateLimit } from "@/server/rateLimitResponse";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let email: string;
  try {
    const body = await req.json();
    email = String(body?.email ?? "");
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  if (!EMAIL_RE.test(email.trim())) {
    return NextResponse.json({ error: "Escribe un correo válido" }, { status: 400 });
  }

  // Limite por IP ademas del que aplica issueLoginToken por correo: sin el,
  // una sola maquina podria pedir enlaces para miles de direcciones.
  const limited = await enforceRateLimit("requestLogin", req.headers);
  if (limited) return limited;

  try {
    const token = await issueLoginToken(email);
    // APP_URL, no req.nextUrl.origin: detrás de un proxy inverso el origen de
    // la petición es la dirección interna, y el enlace no llevaría a ninguna
    // parte.
    const link = absoluteUrl(
      `/api/auth/callback?token=${encodeURIComponent(token)}`,
      req.nextUrl.origin,
    );

    await getMailer().send({
      to: email.trim().toLowerCase(),
      subject: "Tu enlace de acceso a QuestionON",
      text:
        `Entra con este enlace (caduca en 15 minutos y solo sirve una vez):\n\n${link}\n\n` +
        `Si no has pedido este acceso, ignora este mensaje.`,
    });
  } catch (err) {
    if (err instanceof TooManyRequestsError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "fallo emitiendo el enlace de acceso",
    );
    // No se filtra el detalle al cliente.
    return NextResponse.json({ error: "No se pudo enviar el enlace" }, { status: 500 });
  }

  // Respuesta idéntica exista o no la cuenta: si variara, esta ruta serviría
  // para averiguar qué correos están registrados.
  return NextResponse.json({
    ok: true,
    message: "Si el correo es correcto, recibirás un enlace de acceso.",
  });
}
