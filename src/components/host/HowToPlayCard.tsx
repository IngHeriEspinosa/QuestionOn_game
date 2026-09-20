"use client";

export function HowToPlayCard() {
  return (
    <div className="glass-panel rounded-3xl p-5 space-y-3">
      <h3 className="text-lg font-semibold text-slate-900">¿Cómo se juega?</h3>
      <ul className="space-y-2 text-sm leading-relaxed text-slate-800">
        <li>1. Crea la sala y comparte el código con tu familia.</li>
        <li>2. Cada persona entra en <strong>/player</strong> con su nombre.</li>
        <li>3. Inicia la partida; solo hay 1 intento por pregunta.</li>
        <li>4. El botón Revelar muestra la respuesta; Siguiente avanza.</li>
        <li>5. 1000 puntos por pregunta respondida correctamente.</li>
      </ul>
    </div>
  );
}
