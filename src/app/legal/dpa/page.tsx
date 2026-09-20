export const metadata = {
  title: "Acuerdo de tratamiento de datos | QuestionON",
  description:
    "Condiciones de tratamiento de datos entre el centro educativo y QuestionON, y lista de subencargados.",
};

/**
 * El DPA es lo que un centro pide antes de firmar.
 *
 * La lista de subencargados tiene que reflejar la realidad del despliegue: si
 * mañana se añade un proveedor de correo o de almacenamiento, hay que
 * actualizarla aquí y avisar a los centros.
 */
export default function DpaPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold text-slate-100">
        Acuerdo de tratamiento de datos
      </h1>

      <p className="text-sm text-slate-400">
        Borrador para revisión. Un centro puede solicitar una copia firmada
        escribiendo a la dirección de contacto.
      </p>

      <h2>Papeles</h2>
      <p>
        El centro educativo (o el docente, si contrata a título individual) actúa
        como <strong>responsable del tratamiento</strong>. QuestionON actúa como{" "}
        <strong>encargado</strong>, y trata los datos únicamente siguiendo sus
        instrucciones y para prestar el servicio.
      </p>

      <h2>Objeto y duración</h2>
      <p>
        El tratamiento se limita a lo necesario para que el profesorado pueda
        crear cuestionarios, jugarlos en el aula y consultar los informes. Dura
        lo que dure la relación contractual.
      </p>

      <h2>Categorías de datos</h2>
      <ul>
        <li>Correo electrónico del profesorado.</li>
        <li>
          Apodos que el alumnado escribe al entrar, sus respuestas y su
          puntuación.
        </li>
      </ul>
      <p>
        <strong>No se tratan datos identificativos del alumnado</strong>: no se
        piden nombres reales, correos ni fechas de nacimiento.
      </p>

      <h2>Subencargados</h2>
      <p>
        Se comunicará con antelación cualquier alta o cambio, para que el
        responsable pueda oponerse.
      </p>

      <table>
        <thead>
          <tr>
            <th>Proveedor</th>
            <th>Para qué</th>
            <th>Datos a los que accede</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Proveedor de servidor</td>
            <td>Alojar la aplicación y las bases de datos</td>
            <td>Todos los tratados</td>
          </tr>
          <tr>
            <td>Stripe</td>
            <td>Cobro de suscripciones</td>
            <td>Correo y datos de facturación del profesorado</td>
          </tr>
          <tr>
            <td>Proveedor de correo</td>
            <td>Enviar los enlaces de acceso</td>
            <td>Correo del profesorado</td>
          </tr>
          <tr>
            <td>Almacenamiento de copias de seguridad</td>
            <td>Copias cifradas</td>
            <td>Todos los tratados</td>
          </tr>
        </tbody>
      </table>

      <p className="text-sm text-slate-400">
        Completar con la denominación y ubicación concretas de cada proveedor
        antes de entregar el documento a un centro.
      </p>

      <h2>Medidas de seguridad</h2>
      <ul>
        <li>Cifrado en tránsito (HTTPS) en todo el servicio.</li>
        <li>Contraseñas inexistentes: el acceso es por enlace de un solo uso.</li>
        <li>
          Aislamiento entre cuentas verificado con pruebas automáticas: un
          docente no puede leer cuestionarios ni informes de otro.
        </li>
        <li>Copias de seguridad cifradas y con restauración probada.</li>
        <li>Registro de accesos y errores, sin datos personales innecesarios.</li>
      </ul>

      <h2>Devolución y supresión</h2>
      <p>
        Al terminar la relación, el responsable puede exportar sus datos. Después
        se suprimen, salvo los que deban conservarse por obligación legal
        (facturación).
      </p>

      <h2>Brechas de seguridad</h2>
      <p>
        En caso de brecha que afecte a datos personales, se notificará al
        responsable sin dilación indebida y con la información necesaria para que
        pueda cumplir sus propias obligaciones.
      </p>
    </>
  );
}
