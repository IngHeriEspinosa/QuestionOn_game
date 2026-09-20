import type { MetadataRoute } from "next";
import { appUrlForMetadata } from "@/lib/appUrl";

// Dinamico a proposito: si se generara en build, llevaria la URL que
// hubiera en ese momento. En Docker no hay APP_URL al construir, asi que
// saldria apuntando al host interno.
export const dynamic = "force-dynamic";


/**
 * Qué puede rastrear un buscador.
 *
 * Se bloquean las zonas privadas y las de juego: indexar una sala en curso no
 * aporta nada y expondría códigos de sala en resultados de búsqueda.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/api/", "/player", "/login"],
    },
    sitemap: `${appUrlForMetadata()}/sitemap.xml`,
  };
}
