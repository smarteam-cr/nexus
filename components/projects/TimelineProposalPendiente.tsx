"use client";

import { useMe } from "@/hooks/useMe";
import { fraseDeAutoria, type AutoriaDeLaPropuesta } from "@/lib/timeline/autoria-de-la-propuesta";
import { QueSigue } from "@/components/ui/sistema";

/**
 * components/projects/TimelineProposalPendiente.tsx — EL CARTEL de la propuesta de
 * cronograma que quedó sin revisar.
 *
 * ── POR QUÉ EXISTE (Tanda M, 2026-08-10) ─────────────────────────────────────
 * Cuando el handoff se regenera sobre un proyecto que YA tiene cronograma, las fases
 * nuevas NUNCA se pisan directo — quedan como `ProjectTimeline.pendingProposal`,
 * esperando que el CSE las revise ("Revisar N cambios"). Hasta ahora ese aviso vivía
 * enterrado en la pestaña Cronograma, detrás del permiso de edición: "el handoff se
 * regeneró bien" y "el cronograma tiene cambios sin mirar" podían coexistir sin que
 * nadie se enterara salvo que abriera esa pestaña por casualidad.
 *
 * ── EN DOS LUGARES, A PROPÓSITO — mismo criterio que AltaTrabada.tsx ────────────
 * El rail de la ficha del cliente y el widget del proyecto. El del rail es el que
 * importa: el widget vive DENTRO de un proyecto ya abierto.
 *
 * Sin lógica de mutex compartida (a diferencia de AltaTrabada): esto es un aviso de
 * SOLO LECTURA, no dispara ninguna escritura — no hay carrera que evitar entre las
 * dos instancias.
 *
 * ── QUIÉN Y CUÁNDO (E2b P7, 2026-09-25) ──────────────────────────────────────
 * Con `autoria`, el cartel dice de dónde viene, quién la dejó y cuándo (`fraseDeAutoria`).
 * Sin ella, el compacto no lleva segunda frase y el completo no dice el origen: nada inventado.
 */

export interface TimelineProposalPendienteProps {
  projectId: string;
  clientId: string;
  /** `ProjectTimeline.pendingProposal != null`. Si no hay propuesta, no pinta nada. */
  pending: boolean;
  /**
   * `compacto` (una línea); `completo` (tarjeta); `panel`: el «Qué sigue» del panel de contexto de
   * la ficha (rediseño del 2026-10-04), que es donde vive hoy — se ve en todos los documentos.
   */
  variante?: "compacto" | "completo" | "panel";
  /** De dónde viene, quién la dejó y cuándo. Ausente o null = no se dice. */
  autoria?: AutoriaDeLaPropuesta | null;
}

export default function TimelineProposalPendiente({
  projectId,
  clientId,
  pending,
  variante = "completo",
  autoria = null,
}: TimelineProposalPendienteProps) {
  const me = useMe();
  // Misma capability que ya gatea "Revisar N cambios" dentro de CronogramaCanvas — un
  // solo criterio de permiso, no dos que puedan divergir.
  const puedeRevisar = me?.capabilities.includes("editTimeline") ?? false;

  if (!pending) return null;

  /* ⚠ `canvas=timeline` es imprescindible desde el 2026-09-27: sin el parámetro, la ficha
     del proyecto abre el RESUMEN, y este botón —que promete llevar a la propuesta— dejaba a
     la persona mirando el widget con un ancla `#cronograma-gantt` que no existe en esa vista.
     Se apunta por SLUG y no por id porque acá no se conoce el id del canvas: es una fila
     distinta en cada uno de los proyectos. */
  const href = `/clients/${clientId}?tab=${encodeURIComponent(projectId)}&canvas=timeline#cronograma-gantt`;
  const boton = puedeRevisar ? (
    <a
      href={href}
      className="flex-shrink-0 px-2.5 py-1 text-xs font-medium rounded-lg border border-warn-line text-warn-ink hover:bg-warn-line/20 transition-colors"
    >
      Revisar
    </a>
  ) : null;

  if (variante === "panel") {
    /* Lo dejó un agente: va en el azul de las sugerencias, como «Qué sigue». La acción es la única
       azul sólida del panel; sin el permiso, se dice quién puede aplicarla en vez de un botón. */
    return (
      <QueSigue
        accion={
          puedeRevisar ? (
            <a
              href={href}
              className="inline-block rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
            >
              Revisar la propuesta →
            </a>
          ) : (
            <span className="text-xs text-fg-muted">La aplica quien puede editar el cronograma.</span>
          )
        }
      >
        El cronograma tiene una propuesta sin decidir{autoria ? ` (${fraseDeAutoria(autoria)})` : ""}. Revísala antes
        de subirlo al cliente: nada se aplica solo.
      </QueSigue>
    );
  }

  if (variante === "compacto") {
    return (
      <div className="px-6 py-2 flex items-center gap-2 flex-wrap border-b border-warn-line bg-warn-surface">
        <span className="text-xs font-medium text-warn-ink">
          El cronograma tiene una propuesta sin decidir
        </span>
        {autoria && <span className="text-xs text-warn-ink/70">· {fraseDeAutoria(autoria)}</span>}
        <span className="ml-auto" />
        {boton}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-warn-line bg-warn-surface p-4 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-warn-ink">El cronograma tiene una propuesta sin decidir</p>
        <p className="mt-1 text-xs text-warn-ink/80 leading-relaxed">
          La IA propuso cambios del cronograma{autoria ? ` (${fraseDeAutoria(autoria)})` : ""}; el
          cliente sigue viendo el cronograma actual hasta que alguien la aplique o la descarte.
        </p>
      </div>
      {boton}
    </div>
  );
}
