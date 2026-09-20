import "server-only";
import { logger } from "../../lib/logger";

/**
 * Envío de correo.
 *
 * Detrás de una interfaz desde el primer día, por la misma razón que la capa de
 * facturación: cambiar de proveedor no debe obligar a tocar el producto.
 *
 * Sin proveedor configurado (desarrollo), el enlace se escribe en el log en vez
 * de enviarse. Es deliberado: permite probar el flujo completo sin cuenta de
 * correo, y en producción `assertMailerConfigured()` impide arrancar así.
 */

export type Mail = {
  to: string;
  subject: string;
  text: string;
};

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

class ConsoleMailer implements Mailer {
  async send(mail: Mail) {
    logger.warn(
      { to: mail.to, subject: mail.subject, body: mail.text },
      "CORREO NO ENVIADO (sin proveedor configurado): se vuelca en el log",
    );
  }
}

let mailer: Mailer | null = null;

export function getMailer(): Mailer {
  // Aquí entrará la implementación con Resend o Postmark en la Fase 5, cuando
  // haya correos transaccionales de verdad que enviar.
  mailer ??= new ConsoleMailer();
  return mailer;
}

/** Impide desplegar a producción volcando los enlaces de acceso al log. */
export function assertMailerConfigured() {
  if (process.env.NODE_ENV === "production" && !process.env.MAIL_PROVIDER) {
    throw new Error(
      "En producción hace falta un proveedor de correo (MAIL_PROVIDER): " +
        "sin él los enlaces de acceso acabarían en los logs.",
    );
  }
}
