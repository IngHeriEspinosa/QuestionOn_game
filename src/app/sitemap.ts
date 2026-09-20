import type { MetadataRoute } from "next";
import { appUrlForMetadata } from "@/lib/appUrl";

// Dinamico por la misma razon que robots.txt: en build no hay APP_URL.
export const dynamic = "force-dynamic";


/** Solo las páginas públicas; las privadas no tienen nada que indexar. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrlForMetadata();
  const ahora = new Date();

  return [
    { url: `${base}/inicio`, lastModified: ahora, priority: 1 },
    { url: `${base}/precios`, lastModified: ahora, priority: 0.8 },
    { url: `${base}/legal/aula`, lastModified: ahora, priority: 0.6 },
    { url: `${base}/legal/privacidad`, lastModified: ahora, priority: 0.3 },
    { url: `${base}/legal/terminos`, lastModified: ahora, priority: 0.3 },
    { url: `${base}/legal/cookies`, lastModified: ahora, priority: 0.3 },
    { url: `${base}/legal/dpa`, lastModified: ahora, priority: 0.3 },
  ];
}
