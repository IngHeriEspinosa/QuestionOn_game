import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/dal";

export const dynamic = "force-dynamic";

/**
 * Quién está en sesión, para que la interfaz sepa qué mostrar.
 *
 * Devuelve 200 con `user: null` en lugar de 401 cuando no hay sesión: no tener
 * cuenta no es un error, y el constructor debe seguir funcionando sin ella.
 *
 * Solo se exponen los campos que la interfaz necesita. Nunca la fila entera.
 */
export async function GET() {
  const user = await getCurrentUser();

  return NextResponse.json(
    {
      user: user ? { id: user.id, email: user.email, name: user.name } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
