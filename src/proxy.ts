import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/session";

/**
 * En Next 16 `middleware.ts` está deprecado y renombrado a `proxy.ts`
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:11).
 * Solo puede haber uno por proyecto y corre en el runtime de Node.
 *
 * Esto es una comprobación OPTIMISTA: mira si existe la cookie, nada más. No
 * la verifica ni consulta la base de datos, porque encarecería cada petición.
 * Los propios docs avisan de que no debe ser la única línea de defensa: la
 * autorización real está en la capa de acceso a datos y en cada route handler.
 *
 * Su único cometido es evitar que alguien sin sesión vea el esqueleto del panel
 * antes de ser redirigido.
 */
export default function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession) {
    // Clonar en vez de reconstruir: asi la redireccion conserva el host real
    // de la peticion, sin depender de que nextUrl.origin sea correcto.
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Solo las rutas privadas. El constructor, la vista de jugador y las rutas de
  // API quedan fuera a propósito: las de API hacen su propia comprobación y
  // deben responder 401 en JSON, no redirigir a una página de login.
  matcher: ["/dashboard/:path*"],
};
