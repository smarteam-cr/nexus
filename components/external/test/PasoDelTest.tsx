"use client";

/**
 * components/external/test/PasoDelTest.tsx — UNA PREGUNTA POR PANTALLA del test público, como la aplicación vieja
 * (Elías, 28 oct): arriba la barra de avance con el nombre de cada paso (un separador donde cambia la capa), la tarjeta
 * con «Pregunta N de M», la capa, el nombre del paso, la pregunta y sus opciones (más «No lo sé»), el matiz opcional y
 * Volver / Siguiente. Solo pinta: el estado y el guardado los lleva TestDelDiagnostico.
 */
import { TEXTO_DE_NO_LO_SE } from "@/lib/tests-diagnostico/tipos";

export const NO_LO_SE = "no-se";

export interface PreguntaEnPantalla {
  id: string;
  texto: string;
  ayuda: string | null;
  opciones: { id: string; texto: string }[];
  paso: string | null;
  capa: string | null;
}

export default function PasoDelTest({
  areaNombre,
  preguntas,
  indice,
  respuestas,
  ocupado,
  error,
  alElegir,
  alEscribirMatiz,
  alIrA,
  alVolver,
  alSeguir,
  alReiniciar,
}: {
  areaNombre: string;
  preguntas: PreguntaEnPantalla[];
  indice: number;
  respuestas: Record<string, { opcion: string; matiz?: string }>;
  ocupado: boolean;
  error: string | null;
  alElegir: (opcion: string) => void;
  alEscribirMatiz: (matiz: string) => void;
  alIrA: (i: number) => void;
  alVolver: () => void;
  alSeguir: () => void;
  alReiniciar: () => void;
}) {
  const n = preguntas.length;
  const pregunta = preguntas[indice];
  const elegida = respuestas[pregunta.id]?.opcion;
  const esLaUltima = indice === n - 1;
  const titulo = pregunta.paso ?? `Pregunta ${indice + 1}`;

  return (
    <div className="step-wrap">
      <div className="step-topline">
        <span className="diag-badge">Diagnóstico de rendimiento · {areaNombre}</span>
        <button type="button" className="btn-cancelar" onClick={alReiniciar}>
          ↺ Volver a iniciar
        </button>
      </div>

      <div className="prog" role="group" aria-label="Progreso del diagnóstico">
        <div className="prog-track">
          <span className="prog-fill" style={{ width: `${(indice / n) * 100}%` }} />
        </div>
        <div className="prog-nodes" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {preguntas.map((p, i) => {
            const hecha = !!respuestas[p.id]?.opcion;
            const actual = i === indice;
            // Se puede saltar a una ya respondida o a una anterior; no a una que todavía no le toca.
            const visitable = hecha || i < indice || actual;
            const estado = actual ? "actual" : hecha ? "done" : "pend";
            const separa = i > 0 && !!p.capa && !!preguntas[i - 1].capa && p.capa !== preguntas[i - 1].capa;
            const nombre = p.paso ?? `Pregunta ${i + 1}`;
            return (
              <button
                key={p.id}
                type="button"
                className={`prog-node ${estado}${separa ? " prog-split" : ""}`}
                disabled={!visitable || actual}
                title={nombre}
                aria-current={actual ? "step" : undefined}
                onClick={() => alIrA(i)}
              >
                <span className="prog-dot">{estado === "done" ? "✓" : i + 1}</span>
                <span className="prog-lbl">{p.paso ? p.paso.split(" ")[0] : i + 1}</span>
              </button>
            );
          })}
        </div>
      </div>

      <article key={pregunta.id} className="step-card step-enter">
        <header className="step-head">
          <p className="step-contador">
            <b>Pregunta {indice + 1}</b> de {n}
          </p>
          {pregunta.capa && <p className="eyebrow">{pregunta.capa}</p>}
          <h2>{titulo}</h2>
        </header>
        <p className="dim-pregunta">{pregunta.texto}</p>
        {pregunta.ayuda && <p className="dim-ayuda">{pregunta.ayuda}</p>}
        <div className="opt-list" role="radiogroup" aria-label={titulo}>
          {[...pregunta.opciones, { id: NO_LO_SE, texto: TEXTO_DE_NO_LO_SE }].map((o) => {
            const activa = elegida === o.id;
            return (
              <button key={o.id} type="button" role="radio" aria-checked={activa} className={`opt-item${activa ? " is-active" : ""}`} onClick={() => alElegir(o.id)}>
                <span className="opt-dot" aria-hidden="true" />
                <span className="opt-txt">{o.texto}</span>
              </button>
            );
          })}
        </div>
        <div className="matiz-wrap">
          <label className="matiz-lbl" htmlFor="matiz">
            ¿Algún matiz que debamos considerar? <span className="muted">(opcional)</span>
          </label>
          <textarea
            id="matiz"
            className="composer-input"
            rows={2}
            maxLength={500}
            placeholder="Si tu caso tiene un matiz importante, cuéntalo en una línea…"
            value={respuestas[pregunta.id]?.matiz ?? ""}
            onChange={(e) => alEscribirMatiz(e.target.value)}
          />
        </div>
      </article>

      {error && <p className="form-err">{error}</p>}
      <nav className="step-nav">
        <button type="button" className={`btn btn-ghost${indice === 0 ? " oculto" : ""}`} onClick={alVolver} disabled={indice === 0}>
          ← Volver
        </button>
        <button type="button" className="btn btn-primary" disabled={!elegida || ocupado} onClick={alSeguir}>
          {ocupado ? "Un momento…" : esLaUltima ? "Ver resultado →" : "Siguiente →"}
        </button>
      </nav>
    </div>
  );
}
