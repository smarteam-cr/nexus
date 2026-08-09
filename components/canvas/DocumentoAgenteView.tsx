"use client";

/**
 * components/canvas/DocumentoAgenteView.tsx — UN DOCUMENTO DE AGENTE, EN SOLO LECTURA.
 *
 * ── POR QUÉ NO SE REUSA CanvasLinearView ─────────────────────────────────────
 * Aquél está atado a la base VIVA: su primera línea útil es un hook que fetchea el canvas y lo
 * poletea cada 5 segundos. Eso es correcto para el documento actual y desperdicio puro sobre
 * datos inmutables — una corrida vieja no va a cambiar nunca.
 *
 * Este componente recibe TODO por props: cero fetch, cero hooks de datos, cero polling. Ese es
 * todo el desacople, y es lo que lo hace reutilizable para cualquier pieza (kickoff,
 * diagnóstico, desarrollo…) sin escribir una línea más acá: alcanza con apuntar el endpoint del
 * historial a otro grupo.
 *
 * El precedente en el repo es la vista imprimible, que también se alimenta por props.
 */
import BlockRenderer, { type BlockData } from "./BlockRenderer";
import type { DocumentoDeCorrida, BloqueDeCorrida } from "@/lib/canvas/agent-output-doc";

/**
 * Bloque sintético para el renderer. Dos campos son LOAD-BEARING y no son cosméticos:
 *  · `source: "AGENT"` — con cualquier otro valor la toolbar de edición queda siempre visible.
 *  · `status: "CONFIRMED"` — con "DRAFT" se pinta el marco ámbar de «pendiente de revisión», y
 *    una corrida histórica no puede parecer algo que espera aprobación.
 */
function aBlockData(b: BloqueDeCorrida): BlockData {
  return {
    id: b.id,
    blockType: b.blockType,
    content: b.content,
    data: b.data,
    order: b.order,
    colSpan: b.colSpan,
    colStart: null,
    rowSpan: b.rowSpan,
    source: "AGENT",
    status: "CONFIRMED",
    agentRunId: null,
    createdAt: "",
  };
}

export default function DocumentoAgenteView({ documento }: { documento: DocumentoDeCorrida }) {
  if (documento.estado !== "ok") {
    return (
      <div className="rounded-xl border border-line bg-surface-muted px-4 py-6 text-center">
        <p className="text-sm text-fg-secondary">{documento.motivo}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {documento.secciones.map((sec) => (
        <section key={sec.key} className="space-y-2">
          <div className="flex items-baseline gap-2 border-b border-line pb-1.5">
            <h3 className="text-sm font-bold text-fg">{sec.label}</h3>
            {sec.desconocida && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted border border-line rounded px-1.5 py-0.5">
                sección que ya no existe
              </span>
            )}
            <span className="ml-auto text-[11px] text-fg-muted">
              {sec.blocks.length === 1 ? "1 bloque" : `${sec.blocks.length} bloques`}
            </span>
          </div>
          {/* Sin un solo callback: sin `onSave` el renderer es un visor puro. */}
          <div className="space-y-3">
            {sec.blocks.map((b) => (
              <BlockRenderer key={b.id} block={aBlockData(b)} />
            ))}
          </div>
        </section>
      ))}

      {documento.clavesDesconocidas.length > 0 && (
        <p className="text-[11px] text-fg-muted leading-relaxed border-t border-line pt-3">
          {documento.clavesDesconocidas.length === 1
            ? "1 sección se escribió"
            : `${documento.clavesDesconocidas.length} secciones se escribieron`}{" "}
          con un nombre que el documento actual no tiene — se muestran al final, con su clave.
        </p>
      )}
    </div>
  );
}
