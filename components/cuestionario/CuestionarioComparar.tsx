"use client";

/**
 * components/cuestionario/CuestionarioComparar.tsx — la vista comparada de los cuestionarios
 * (pedido de Elías, 2026-10-02): quién respondió qué, dónde se contradicen dos personas y qué está
 * enviado frente a lo que solo está en borrador. Los datos los arma lib/cuestionario/comparar.ts.
 */
import type { Comparacion, RespuestaComparada } from "@/lib/cuestionario/comparar";

function Respuestas({ respuestas }: { respuestas: RespuestaComparada[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {respuestas.map((r, i) => (
        <li key={i} className="rounded-lg bg-surface-muted px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-muted">
            <span className="font-semibold text-fg-secondary">{r.persona}</span>
            {r.nivel && <span className="rounded-full border border-line bg-surface px-1.5 font-semibold">Nivel {r.nivel}</span>}
            <span>{r.enviada ? "enviada" : "en borrador"}</span>
            {r.origen === "prellenado" && <span>{r.confirmada ? "prellenada · confirmada" : "prellenada · sin confirmar"}</span>}
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-fg">{r.texto}</p>
        </li>
      ))}
    </ul>
  );
}

export default function CuestionarioComparar({
  comparacion,
  onAbrir,
}: {
  comparacion: Comparacion | null;
  onAbrir: (cuestionarioId: string) => void;
}) {
  if (!comparacion || comparacion.estado.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-fg-muted">
        Todavía no hay cuestionarios para comparar.
      </p>
    );
  }
  const desacuerdos = comparacion.escala?.dimensiones.filter((d) => d.desacuerdo) ?? [];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h4 className="text-sm font-semibold text-fg">Quién respondió qué</h4>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="py-1.5 pr-3 font-semibold">Persona</th>
                <th className="py-1.5 pr-3 font-semibold">Cuestionario</th>
                <th className="py-1.5 pr-3 font-semibold">Enviado</th>
                <th className="py-1.5 pr-3 font-semibold">Contestado</th>
                <th className="py-1.5 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {comparacion.estado.map((e) => (
                <tr key={e.cuestionarioId}>
                  <td className="py-2 pr-3 text-fg">{e.persona}</td>
                  <td className="py-2 pr-3 text-fg-secondary">
                    {e.titulo}
                    {!e.publicado && <span className="ml-1.5 text-[11px] text-amber-600">sin publicar</span>}
                  </td>
                  <td className="py-2 pr-3 text-fg-secondary">
                    {e.seccionesEnviadas}/{e.secciones}
                    {e.enBorrador && <span className="ml-1.5 text-[11px] text-fg-muted">· hay borrador sin enviar</span>}
                  </td>
                  <td className="py-2 pr-3 text-fg-secondary">
                    {e.contestadas}/{e.preguntas}
                  </td>
                  <td className="py-2 text-right">
                    <button className="text-xs font-semibold text-brand hover:underline" onClick={() => onAbrir(e.cuestionarioId)}>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {comparacion.escala && (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h4 className="text-sm font-semibold text-fg">Escala de rendimiento</h4>
          {comparacion.escala.porPersona.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {comparacion.escala.porPersona.map((p, i) => (
                <li key={i} className="text-fg-secondary">
                  <b className="text-fg">{p.persona}</b>:{" "}
                  {p.areas.map((a) => `${a.nombre} ${a.nivel ?? "(falta contestar)"}`).join(" · ")}
                  {!p.completo && <span className="text-fg-muted"> — parcial</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-fg-muted">
            {desacuerdos.length === 0
              ? "Nadie se contradice todavía (lo prellenado sin confirmar no cuenta)."
              : `${desacuerdos.length} dimensión${desacuerdos.length === 1 ? "" : "es"} donde las personas no coinciden: llévalas a la sesión.`}
          </p>
          <ul className="mt-2 space-y-3">
            {desacuerdos.map((d) => (
              <li key={d.ref} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-fg">{d.nombre}</span>
                  <span className="text-[11px] text-fg-muted">{d.area}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      d.desacuerdo === "se-contradicen"
                        ? "border-danger-line bg-danger-surface text-danger-ink"
                        : "border-warn-line bg-warn-surface text-warn-ink"
                    }`}
                  >
                    {d.desacuerdo === "se-contradicen" ? "Se contradicen" : "Difieren por un nivel"}
                  </span>
                </div>
                <Respuestas respuestas={d.respuestas} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h4 className="text-sm font-semibold text-fg">Cuestionario táctico, lado a lado</h4>
        <p className="mt-0.5 text-xs text-fg-muted">
          Las preguntas que contestó más de una persona. Son respuestas libres: si dicen cosas distintas, lo señala la guía de
          exploración con las dos citas para que lo confirmes.
        </p>
        {comparacion.tactico.length === 0 ? (
          <p className="mt-3 text-xs italic text-fg-muted">Todavía ninguna pregunta tiene respuestas de dos personas.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {comparacion.tactico.map((q, i) => (
              <li key={i} className="rounded-xl border border-line p-3">
                <p className="text-[11px] text-fg-muted">{q.seccion}</p>
                <p className="text-sm font-medium text-fg">{q.pregunta}</p>
                <Respuestas respuestas={q.respuestas} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
