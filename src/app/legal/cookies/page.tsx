export const metadata = {
  title: "Cookies | QuestionON",
  description: "QuestionON solo usa cookies necesarias para funcionar.",
};

export default function CookiesPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold text-slate-100">
        Cookies
      </h1>

      <p>
        QuestionON <strong>solo usa cookies necesarias</strong> para que el
        servicio funcione. No hay cookies de publicidad, de seguimiento entre
        sitios ni de perfilado, por lo que no se muestra banner de consentimiento:
        las cookies técnicas no lo requieren.
      </p>

      <table>
        <thead>
          <tr>
            <th>Cookie</th>
            <th>Para qué</th>
            <th>Duración</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code className="font-mono text-xs">qon_session</code>
            </td>
            <td>Mantener la sesión del profesorado</td>
            <td>30 días</td>
          </tr>
          <tr>
            <td>
              <code className="font-mono text-xs">qon_host</code>
            </td>
            <td>
              Acreditar que eres quien creó una sala, para que nadie más pueda
              controlarla
            </td>
            <td>12 horas</td>
          </tr>
        </tbody>
      </table>

      <p>
        Ambas son <code className="font-mono text-xs">httpOnly</code>, de modo que
        el JavaScript de la página no puede leerlas, y{" "}
        <code className="font-mono text-xs">SameSite=Lax</code>, que impide que
        otro sitio las use en tu nombre.
      </p>

      <h2>Almacenamiento en el navegador del alumnado</h2>
      <p>
        La pantalla de jugador guarda en el navegador el identificador de su
        sesión de juego, para que al recargar la página no pierda la partida. No
        es una cookie, no viaja a otros sitios y desaparece al borrar los datos
        del navegador.
      </p>
    </>
  );
}
