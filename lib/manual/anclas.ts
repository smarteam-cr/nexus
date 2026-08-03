/**
 * lib/manual/anclas.ts — las anclas de la Documentación, declaradas en un solo lugar.
 *
 * ── POR QUÉ ES UN REGISTRO Y NO UN `id` ESCRITO EN EL JSX ─────────────────────
 * Media documentación existe para poder MANDARLE A ALGUIEN el pedazo exacto. Si el id lo
 * escribe cada componente a mano, el link que alguien pegó en un chat muere el día que se
 * renombra una sección, y nada avisa. Acá el ancla se declara una vez, el índice y el destino
 * la leen del mismo lado, y `manual.test.ts` falla si un documento del registro se queda sin la
 * suya. Es el patrón de `lib/timeline/project-action-targets.ts`, que nació de la misma lección:
 * el fallback silencioso es lo que hace que se pudra.
 *
 * ⚠ Todo elemento que lleve una de estas anclas necesita `scroll-mt-24` (o el encabezado queda
 * tapado por el chrome de la app) y `tabIndex={-1}` (sin eso el foco NO viaja con el salto y el
 * link es inútil por teclado).
 */

/** Las secciones de primer nivel — el índice de la página y su orden de lectura. */
export const SECCIONES = [
  { id: "como-funciona", label: "Cómo funciona" },
  { id: "recorrido", label: "El recorrido" },
  { id: "documentos", label: "Los documentos" },
  { id: "agentes", label: "Los agentes" },
  { id: "hubspot", label: "HubSpot" },
] as const;

export type SeccionId = (typeof SECCIONES)[number]["id"];

/**
 * El ancla de un documento. El slug de la pieza (`lib/pieces/registry.ts`) es IDENTIDAD estable
 * por contrato —renombrar el canvas no lo toca—, así que un link a `#doc-kickoff` sobrevive a
 * los renombres. El prefijo evita que un slug choque con el id de una sección.
 */
export function anclaDeDocumento(slug: string): string {
  return `doc-${slug}`;
}

/**
 * El ancla de un agente. Va SIN prefijo porque los ids del catálogo ya lo traen
 * (`agent-kickoff-canvas`) y son estables: se escriben a mano en los seeds, no se generan.
 */
export function anclaDeAgente(agentId: string): string {
  return agentId;
}

/** El ancla de una etapa del recorrido. */
export function anclaDeEtapa(stage: string): string {
  return `etapa-${stage.toLowerCase()}`;
}
