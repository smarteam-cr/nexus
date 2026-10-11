"use client";

/**
 * components/tiempos/ListaDePreguntas.tsx — lo que alguien tiene sin anotar de «¿cuánto te tomó?», listo para
 * contestar ahí mismo (2026-10-07). Lo usan «Para ti» (PendienteDeTiempos) y «Tu carga».
 *
 * La encuesta de arranque (cuánto te toma cada tarea clave) va primero, como un solo formulario con su cabecera; las
 * tareas y los documentos terminados, después.
 */
import PreguntaDeTiempo from "./PreguntaDeTiempo";
import type { PreguntaParaResponder } from "@/lib/tiempos/tipos";

export default function ListaDePreguntas({
  preguntas,
  onListo,
}: {
  preguntas: readonly PreguntaParaResponder[];
  /** Se respondió (o se omitió) una. */
  onListo: (id: string) => void;
}) {
  const delArranque = preguntas.filter((p) => p.momento === "ARRANQUE");
  const otras = preguntas.filter((p) => p.momento !== "ARRANQUE");
  return (
    <>
      {delArranque.length > 0 && (
        <div className="pt-2.5">
          <p className="text-[13px] font-semibold text-fg">{delArranque[0].pregunta}</p>
          <p className="text-xs text-fg-muted">
            Piensa en una cuenta típica, de principio a fin. Si no la haces, dilo. Sirve para calibrar la carga, no para evaluarte.
          </p>
          <div className="divide-y divide-line">
            {delArranque.map((p) => (
              <PreguntaDeTiempo key={p.id} pregunta={p} variante="lista" onListo={() => onListo(p.id)} />
            ))}
          </div>
        </div>
      )}
      {otras.length > 0 && (
        <div className={delArranque.length > 0 ? "mt-2 divide-y divide-line border-t border-line pt-1" : "divide-y divide-line"}>
          {otras.map((p) => (
            <PreguntaDeTiempo key={p.id} pregunta={p} variante="lista" onListo={() => onListo(p.id)} />
          ))}
        </div>
      )}
    </>
  );
}
