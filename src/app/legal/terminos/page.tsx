export const metadata = {
  title: "Términos del servicio | QuestionON",
  description: "Condiciones de uso de QuestionON.",
};

export default function TerminosPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold text-slate-100">
        Términos del servicio
      </h1>

      <p className="text-sm text-slate-400">
        Pendiente de completar con la identidad del prestador y la legislación y
        jurisdicción aplicables antes de publicar.
      </p>

      <h2>Qué es QuestionON</h2>
      <p>
        Una herramienta para crear y jugar cuestionarios en directo en el aula.
        El profesorado prepara las preguntas y el alumnado participa desde su
        dispositivo con un código de sala.
      </p>

      <h2>Cuentas</h2>
      <ul>
        <li>Solo el profesorado necesita cuenta. El alumnado nunca.</li>
        <li>
          La cuenta es personal. Quien la usa es responsable de lo que se haga
          con ella.
        </li>
        <li>
          El acceso se hace con un enlace de un solo uso enviado al correo
          indicado. Mantener ese buzón seguro es responsabilidad de la persona
          titular.
        </li>
      </ul>

      <h2>Contenido</h2>
      <p>
        Las preguntas y los materiales que subas siguen siendo tuyos. Nos
        concedes únicamente el permiso técnico necesario para almacenarlos y
        mostrarlos durante las partidas que tú organices.
      </p>
      <p>
        No puedes subir contenido ilícito, que vulnere derechos de terceros o que
        resulte inapropiado para el contexto educativo en el que se va a
        proyectar.
      </p>

      <h2>Planes y pagos</h2>
      <ul>
        <li>
          El plan gratuito tiene límites publicados en la página de precios. Los
          de pago los amplían.
        </li>
        <li>
          La prueba de catorce días no requiere tarjeta y no se convierte
          automáticamente en un cobro.
        </li>
        <li>
          Las suscripciones se renuevan según el periodo contratado y se pueden
          cancelar en cualquier momento desde el portal de suscripción. La
          cancelación surte efecto al final del periodo ya pagado.
        </li>
        <li>
          Si cambian los precios, se avisará con antelación y nunca se aplicarán
          a un periodo ya abonado.
        </li>
      </ul>

      <h2>Disponibilidad</h2>
      <p>
        Se trabaja para que el servicio esté disponible siempre, pero no se
        garantiza que esté libre de interrupciones. Se avisará con antelación de
        las paradas programadas que puedan afectar a horario lectivo.
      </p>

      <h2>Uso aceptable</h2>
      <ul>
        <li>
          No intentes acceder a partidas, cuentas o informes que no sean tuyos.
        </li>
        <li>
          No sometas el servicio a cargas artificiales ni intentes eludir los
          límites de tu plan.
        </li>
        <li>
          El incumplimiento puede suponer la suspensión de la cuenta, con aviso
          previo salvo que la gravedad lo impida.
        </li>
      </ul>

      <h2>Fin del servicio</h2>
      <p>
        Puedes borrar tu cuenta cuando quieras. Si el servicio se descontinuara,
        se avisará con antelación suficiente para exportar tus cuestionarios e
        informes.
      </p>
    </>
  );
}
