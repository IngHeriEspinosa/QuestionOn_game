import { NextRequest, NextResponse } from "next/server";
import { consumeLoginToken } from "@/server/auth/magicLink";
import { createSession } from "@/server/auth/session";
import { absoluteUrl } from "@/lib/appUrl";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  // absoluteUrl, no req.nextUrl.origin: con servidor propio el origen de la
  // peticion se queda con el puerto por defecto, y detras de un proxy inverso
  // devuelve la direccion interna. En ambos casos la redireccion acabaria en
  // un sitio donde no escucha nadie.
  const loginUrl = new URL(absoluteUrl("/login", req.nextUrl.origin));

  if (!token) {
    loginUrl.searchParams.set("error", "missing");
    return NextResponse.redirect(loginUrl);
  }

  const result = await consumeLoginToken(token);
  if (!result.ok) {
    loginUrl.searchParams.set("error", "invalid");
    return NextResponse.redirect(loginUrl);
  }

  await createSession({
    userId: result.userId,
    orgId: result.orgId,
    email: result.email,
  });

  return NextResponse.redirect(new URL(absoluteUrl("/dashboard", req.nextUrl.origin)));
}
