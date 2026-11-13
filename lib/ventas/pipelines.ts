/**
 * lib/ventas/pipelines.ts
 *
 * Los pipelines de tratos del portal y sus etapas de cierre, transcritos una sola vez.
 * PURO: son datos, sin Prisma ni red — así el sync los usa y un test los puede verificar
 * sin levantar una conexión.
 *
 * Transcritos de /crm/v3/pipelines/deals el 2026-08-19. Verificados el 2026-11-13: el portal tiene estos tres y ningún
 * otro (el de Insider One hoy se llama «PIPELINE | RODMANN + SMARTEAM»; mismo id).
 *
 * ⚠ Desde el 2026-11-13 el espejo de ventas ganadas (sync-ganadas.ts) y lo vendido del punto de equilibrio NO dependen
 * de esta lista: traen y cuentan los ganados de todos los pipelines (`hs_is_closed_won`). La lista sigue mandando en lo
 * que mira negocios ABIERTOS (sync-negocios-abiertos, tratos-abiertos) y en lo que lee `PIPELINES_VENTA_PROPIA`.
 */

/** Un pipeline de tratos, con las dos etapas que cierran. */
export interface PipelineDeVentas {
  id: string;
  label: string;
  etapaGanada: string;
  etapaPerdida: string;
  /**
   * true = lo que se gana acá es facturación de Smarteam.
   *
   * ⚠ "HubSpot Shared Selling" arrancó en false —se lo trataba como registro de
   * oportunidad— y pasó a true el 2026-08-19 por decisión de Elías: ahí van los tratos
   * cerrados que HubSpot nos envía, y son venta de la casa. La evidencia que lo cerró:
   * 12 clientes cuya ÚNICA venta venía de ese pipeline ya habían facturado $55.820 en
   * 2026, de los cuales $33.370 estaban cobrados. Se estaba facturando y cobrando
   * trabajo que el reporte no contaba como vendido.
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
    esVentaPropia: true,
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

/**
 * ¿El trato sigue ganado? Lo que devuelve HubSpot al preguntarle por un trato que no volvió en la búsqueda de ganados.
 *
 * ⭐ Vale para CUALQUIER pipeline (2026-11-13): el espejo de ventas trae los ganados de todos los pipelines por
 * `hs_is_closed_won`, así que un pipeline que esta tabla no declara (uno nuevo de Customer Success) también puede
 * llegar acá. Primero manda lo que calcula HubSpot; la etapa transcrita queda de respaldo por si la propiedad no viene.
 */
export function sigueGanado(p: Record<string, string | null | undefined> | null | undefined): boolean {
  if (!p) return false;
  if (p.hs_is_closed_won != null) return p.hs_is_closed_won === "true";
  return !!p.dealstage && ETAPAS_GANADAS.includes(p.dealstage);
}

/**
 * En qué quedó un trato ganado que dejó de serlo: DESAPARECIDA si HubSpot no lo devuelve, PERDIDA si está en una etapa
 * cerrada que no es ganada, REABIERTA si volvió a una etapa abierta. Como `sigueGanado`, primero lo que calcula HubSpot
 * (`hs_is_closed`) y la lista transcrita de respaldo: así un trato perdido de un pipeline no declarado no se lee
 * «reabierto», que dice lo contrario.
 */
export function estadoAlDejarDeVolver(
  p: Record<string, string | null | undefined> | null | undefined,
): "DESAPARECIDA" | "PERDIDA" | "REABIERTA" {
  if (!p) return "DESAPARECIDA";
  if (p.hs_is_closed != null) return p.hs_is_closed === "true" ? "PERDIDA" : "REABIERTA";
  return p.dealstage && ETAPAS_PERDIDAS.includes(p.dealstage) ? "PERDIDA" : "REABIERTA";
}

/** El nombre legible de un pipeline, o su id crudo si no está declarado. */
export function labelDePipeline(id: string): string {
  return PIPELINES.find((p) => p.id === id)?.label ?? id;
}
