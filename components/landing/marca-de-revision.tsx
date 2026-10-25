"use client";

/**
 * components/landing/marca-de-revision.tsx — LA MARCA DE REVISIÓN de una sección que propone la IA y revisa una persona
 * (`revisadaAt`, fuera del esquema del agente). Primitiva del motor de documentos (§1-WEB).
 *
 * Nació en el ENFOQUE DE LA SOLUCIÓN del diagnóstico (2026-10-02) y desde el 2026-10-24 (L2 etapa 2 del roadmap) la usa
 * también el DESAFÍO PRINCIPAL: presentar exige los dos revisados y, revisados, regenerar no los toca
 * (lib/canvas/diagnostico-generate.ts). Una sección la pide desde su definición (`SectionDef.revision`).
 *
 * Va ARRIBA A LA DERECHA de la sección, compacta, y solo en EDICIÓN: no llega a la vista del cliente ni al PDF.
 */
import { SUGERENCIA_POR_REVISAR } from "./configs/diagnostico.defs";
import { marcadaRevisada } from "@/lib/canvas/estado-del-documento";

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("es-CR", { day: "numeric", month: "long", timeZone: "America/Costa_Rica" });
}

export function MarcaDeRevision({
  revisadaAt,
  tieneContenido,
  pendiente,
  onAlternar,
}: {
  revisadaAt: unknown;
  tieneContenido: boolean;
  /** Qué tiene que hacer la persona mientras no está revisada (el `title` del estado). */
  pendiente: string;
  /** Marca o desmarca: recibe el `revisadaAt` nuevo ("" = vuelve a ser sugerencia de la IA). */
  onAlternar: (revisadaAt: string) => void;
}) {
  if (!tieneContenido) return null;
  // La MISMA regla que presentar y regenerar (lib/canvas/estado-del-documento.ts): un `revisadaAt` de espacios no cuenta.
  const revisada = marcadaRevisada({ revisadaAt });
  const fecha = revisada ? fechaCorta(revisadaAt as string) : "";
  return (
    <div className={revisada ? "stl-revision stl-revision-ok" : "stl-revision"} role="note">
      <span className="stl-revision-estado" title={revisada ? "Regenerar el diagnóstico ya no lo cambia." : pendiente}>
        {revisada ? `✓ Revisado${fecha ? ` el ${fecha}` : ""}` : SUGERENCIA_POR_REVISAR}
      </span>
      <button
        type="button"
        title={revisada ? "Al regenerar el diagnóstico, la IA lo vuelve a proponer." : "Regenerar el diagnóstico ya no lo va a cambiar."}
        onClick={() => onAlternar(revisada ? "" : new Date().toISOString())}
      >
        {revisada ? "Dejar que la IA lo reescriba" : "Marcar como revisado"}
      </button>
    </div>
  );
}
