"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * QR de acceso a la sala, generado en el navegador.
 *
 * Antes se pedía a `api.qrserver.com`, lo que significaba tres cosas malas a la
 * vez: una dependencia externa que si cae rompe la entrada al aula, un
 * subencargado de tratamiento que habría que declarar en el DPA, y una fuga
 * innecesaria de las URL de todas las salas a un tercero.
 *
 * Generarlo en local elimina las tres y además funciona sin conexión a
 * internet, que en algunos centros no es un detalle menor.
 */
export function JoinQrCode({ url, size = 192 }: { url: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Sin setState sincrono aqui: forzaria un render en cascada. El caso de
    // "sin url" se resuelve en el render, mas abajo.
    if (!url) return;

    QRCode.toDataURL(url, {
      width: size * 2, // el doble, para que se vea nítido en pantallas densas
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((result) => {
        if (!cancelled) setDataUrl(result);
      })
      .catch(() => {
        // Si falla, el código de sala escrito sigue estando a la vista.
        if (!cancelled) setDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [url, size]);

  if (!url || !dataUrl) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-slate-300 bg-white text-xs text-slate-500"
        style={{ width: size, height: size }}
      >
        Generando...
      </div>
    );
  }

  return (
    // <img> y no next/image: es un data URL generado en el cliente, no un
    // recurso que el optimizador de Next pueda procesar.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt="Código QR para entrar en la sala"
      src={dataUrl}
      width={size}
      height={size}
      className="rounded-md border border-slate-300 bg-white p-2"
    />
  );
}
