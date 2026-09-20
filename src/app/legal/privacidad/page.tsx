export const metadata = {
  title: "Política de privacidad | QuestionON",
  description: "Qué datos trata QuestionON, para qué y durante cuánto tiempo.",
};

export default function PrivacidadPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold text-slate-100">
        Política de privacidad
      </h1>

      <p className="text-sm text-slate-400">
        Pendiente de completar con la identidad del responsable (denominación,
        NIF y domicilio) antes de publicar.
      </p>

      <h2>Datos que se tratan</h2>

      <h3>Del profesorado (titulares de cuenta)</h3>
      <table>
        <thead>
          <tr>
            <th>Dato</th>
            <th>Origen</th>
            <th>Finalidad</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Correo electrónico</td>
            <td>Lo aporta la persona al registrarse</td>
            <td>Identificar la cuenta y enviar el enlace de acceso</td>
          </tr>
          <tr>
            <td>Fecha de alta y de último acceso</td>
            <td>Automático</td>
            <td>Seguridad de la cuenta y soporte</td>
          </tr>
          <tr>
            <td>Datos de facturación</td>
            <td>Los trata Stripe, no QuestionON</td>
            <td>Cobrar la suscripción</td>
          </tr>
        </tbody>
      </table>

      <p>
        <strong>No guardamos datos de tarjeta.</strong> El pago se hace en una
        página alojada por Stripe y los datos de la tarjeta nunca pasan por
        nuestros servidores.
      </p>

      <h3>Del alumnado</h3>
      <p>
        El alumnado no crea cuenta. Se detalla en{" "}
        <a href="/legal/aula" className="underline underline-offset-2">
          Privacidad en el aula
        </a>
        .
      </p>

      <h2>Base jurídica</h2>
      <ul>
        <li>
          <strong>Ejecución del contrato</strong> para prestar el servicio a quien
          se registra.
        </li>
        <li>
          <strong>Obligación legal</strong> para la facturación y su conservación.
        </li>
        <li>
          <strong>Interés legítimo</strong> para la seguridad del servicio
          (registros técnicos, prevención de abuso).
        </li>
      </ul>

      <h2>Plazos de conservación</h2>
      <table>
        <thead>
          <tr>
            <th>Dato</th>
            <th>Plazo</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Cuenta del docente</td>
            <td>Mientras la cuenta esté activa, y hasta que se solicite su borrado</td>
          </tr>
          <tr>
            <td>Enlaces de acceso</td>
            <td>15 minutos; después dejan de servir</td>
          </tr>
          <tr>
            <td>Partida en curso</td>
            <td>Como máximo 12 horas; se borra automáticamente</td>
          </tr>
          <tr>
            <td>Informes de partidas</td>
            <td>Según el plan (7 días en el gratuito); borrables a petición</td>
          </tr>
          <tr>
            <td>Facturación</td>
            <td>El plazo legal de conservación de documentación mercantil</td>
          </tr>
        </tbody>
      </table>

      <h2>Encargados y proveedores</h2>
      <p>
        La lista completa, con su ubicación y su finalidad, está en el{" "}
        <a href="/legal/dpa" className="underline underline-offset-2">
          acuerdo de tratamiento
        </a>
        .
      </p>

      <h2>Derechos</h2>
      <p>
        Acceso, rectificación, supresión, limitación, oposición y portabilidad.
        Se ejercen escribiendo a la dirección de contacto, y también puedes
        exportar o borrar tu cuenta desde la propia aplicación. Si consideras que
        no se han atendido correctamente, puedes reclamar ante la autoridad de
        control competente.
      </p>
    </>
  );
}
