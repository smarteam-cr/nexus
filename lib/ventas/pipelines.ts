/**
 * lib/ventas/pipelines.ts
 *
 * Los pipelines de tratos del portal y sus etapas de cierre, transcritos una sola vez.
 * PURO: son datos, sin Prisma ni red — así el sync los usa y un test los puede verificar
 * sin levantar una conexión.
 *
 * Transcritos de /crm/v3/pipelines/deals el 2026-08-19.
 */

/** Un pipeline de tratos, con las dos etapas que cierran. */
export interface PipelineDeVentas {
  id: string;
  label: string;
  etapaGanada: string;
  etapaPerdida: string;
  /**
   * true = lo que se gana acá es facturación de Smarteam.
   * "HubSpot Shared Selling" va en false: es registro de oportunidad con HubSpot, no
   * venta propia. Se espeja igual (para no tener que volver a traerlo el día que se
   * decida contarlo) pero no suma al vendido.
   */
  esVentaPropia: boolean;
}

export const PIPELINES: readonly PipelineDeVentas[] = [
  { id: "default", label: "Pipeline de ventas", etapaGanada: "closedwon", etapaPerdida: "closedlost", esVentaPropia: true },
  { id: "907198211", label: "Insider One", etapaGanada: "1373937254", etapaPerdida: "1373937255", esVentaPropia: true },
  {
    id: "81ee3345-1b0f-42aa-9e78-580614546602",
    label: "HubSpot Shared Selling",
    etapaGanada: "deal_registration_closed_won",
    etapaPerdida: "deal_registration_closed_lost",
    esVentaPropia: false,
  },
] as const;

export const ETAPAS_GANADAS: readonly string[] = PIPELINES.map((p) => p.etapaGanada);

/**
 * ⚠ Lista explícita y NO una regex sobre el id: la primera versión usaba /lost|perdid/i,
 * y el id de la etapa Perdido de Insider One es "1373937255" — un número, sin una sola
 * letra. Un trato perdido de ese pipeline se marcaba REABIERTA, que dice lo contrario:
 * uno significa "la venta se cayó" y el otro "volvió a estar en juego".
 */
export const ETAPAS_PERDIDAS: readonly string[] = PIPELINES.map((p) => p.etapaPerdida);

/** Los pipelines cuyo ganado cuenta como venta de la casa. */
export const PIPELINES_VENTA_PROPIA: readonly string[] = PIPELINES.filter((p) => p.esVentaPropia).map((p) => p.id);

/** El nombre legible de un pipeline, o su id crudo si no está declarado. */
export function labelDePipeline(id: string): string {
  return PIPELINES.find((p) => p.id === id)?.label ?? id;
}
