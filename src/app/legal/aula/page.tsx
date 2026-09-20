export const metadata = {
  title: "Privacidad en el aula | QuestionON",
  description:
    "El alumnado juega sin cuenta y sin dar datos personales. Qué se guarda exactamente y durante cuánto tiempo.",
};

/**
 * Esta página es material comercial además de legal.
 *
 * La decisión de que el alumnado nunca tenga cuenta es deliberada y es lo que
 * mantiene el producto fuera del tratamiento de datos de menores. Conviene que
 * el centro pueda comprobarlo de un vistazo antes de preguntar.
 */
export default function AulaPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold text-slate-100">
        Privacidad en el aula
      </h1>

      <p>
        En QuestionON <strong>el alumnado no crea cuenta</strong>. Entra con un
        código de sala y un apodo que elige en ese momento. No pedimos nombre
        real, ni correo, ni fecha de nacimiento, ni ningún otro dato.
      </p>

      <p>
        Esto no es un detalle de implementación: es una decisión de diseño. Al no
        recoger datos personales del alumnado, no hay consentimiento parental que
        gestionar ni datos de menores que proteger, porque sencillamente no
        existen.
      </p>

      <h2>Qué se guarda de una partida</h2>

      <table>
        <thead>
          <tr>
            <th>Dato</th>
            <th>Para qué</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>El apodo que escribe el alumno</td>
            <td>Mostrarlo en el marcador durante la partida y en el informe</td>
          </tr>
          <tr>
            <td>Las respuestas y la puntuación</td>
            <td>Jugar y construir el informe del docente</td>
          </tr>
          <tr>
            <td>Un identificador aleatorio de sesión</td>
            <td>
              Distinguir a un jugador de otro durante la partida. No se vincula a
              ninguna persona
            </td>
          </tr>
        </tbody>
      </table>

      <p>
        Si el apodo que escribe un alumno contiene su nombre real, ese dato lo
        aporta él. El centro puede pedir que se usen apodos sin nombre; la
        aplicación nunca lo exige.
      </p>

      <h2>Qué NO se guarda</h2>
      <ul>
        <li>Correos, nombres completos ni fechas de nacimiento del alumnado.</li>
        <li>Dirección IP asociada a un alumno concreto.</li>
        <li>Cookies de seguimiento ni perfilado publicitario.</li>
        <li>Grabaciones de audio, vídeo ni pantalla.</li>
      </ul>

      <h2>Cuánto tiempo</h2>
      <p>
        Los datos de una partida en curso viven como máximo doce horas y se
        borran solos. Los informes se conservan según el plan del centro (siete
        días en el plan gratuito), y el docente puede borrarlos en cualquier
        momento.
      </p>

      <h2>Quién puede verlo</h2>
      <p>
        Solo el docente que creó la partida. Ni otros docentes del mismo centro
        ni el alumnado pueden acceder a los informes de una clase ajena.
      </p>
    </>
  );
}
