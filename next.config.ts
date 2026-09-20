import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad.
 *
 * Se evalúan antes del sistema de ficheros, así que cubren páginas y rutas de
 * API por igual (docs: 01-app/03-api-reference/05-config/01-next-config-js/headers.md).
 *
 * La CSP es la que de verdad importa aquí: el producto muestra en pantalla
 * texto que escribe una persona (enunciados, apodos del alumnado) ante una
 * clase entera, así que limitar qué puede ejecutarse es la diferencia entre un
 * fallo y un incidente.
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-inline' sigue siendo necesario para los estilos de Tailwind y
      // para los scripts de hidratación de Next. Quitarlo exige nonces por
      // petición, que es trabajo de la Fase 7 junto con el resto del
      // endurecimiento.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // Las imágenes de las preguntas solo pueden venir por https, igual que
      // exige el validador al guardarlas.
      "img-src 'self' data: blob: https:",
      "media-src 'self' https:",
      "font-src 'self' data:",
      // ws:/wss: para el canal en vivo.
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  // Sustituye a X-Frame-Options, que la propia doc marca como superado por
  // frame-ancestors de la CSP.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    // HSTS solo tiene sentido servido por https; en local no estorba porque el
    // navegador lo ignora en http.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // El QR ya se genera en local, así que no hace falta permitir ningún
  // dominio externo de imágenes.
  images: {
    remotePatterns: [],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
