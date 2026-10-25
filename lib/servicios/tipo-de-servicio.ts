/**
 * lib/servicios/tipo-de-servicio.ts — el `serviceType` de un proyecto de un SERVICIO RECURRENTE. PURO.
 *
 * M1 etapa 4 del roadmap (2026-10-25). El espejo de HubSpot (lib/hubspot/sync-projects.ts) deduce `serviceType` del
 * nombre del servicio contratado, y lo que no reconoce cae en `proyecto_temporal`: 5 de los 7 proyectos del pipeline
 * SmartLoop quedaron así, y el kickoff de RC Inmobiliaria le decía «proyecto temporal» a un SmartLoop.
 *
 * La regla: un proyecto en el pipeline de un servicio recurrente NO es un proyecto temporal. Si lo que se deduce es
 * `proyecto_temporal`, queda vacío (null): el servicio lo dice el pipeline (`servicioDelProyecto`, ./catalogo.ts). Un tipo
 * de catálogo que sí se reconoce (`loop_sales`…) se respeta: dice qué hub trabaja el servicio.
 */
import { resolvePipeline } from "@/lib/projects/kind";

export const TIPO_TEMPORAL = "proyecto_temporal";

/** El `serviceType` que se guarda para un proyecto de ese pipeline. */
export function tipoDeServicioDelEspejo(serviceType: string | null, hubspotPipelineId: string | null | undefined): string | null {
  const recurrente = !!resolvePipeline(hubspotPipelineId ?? null)?.servicioRecurrente;
  return recurrente && serviceType === TIPO_TEMPORAL ? null : serviceType;
}

/** ¿El proyecto tiene un tipo que contradice su pipeline? (INV55 y el script de M1 etapa 4.) */
export function tipoQueContradiceAlPipeline(p: { serviceType: string | null; hubspotPipelineId: string | null }): boolean {
  return tipoDeServicioDelEspejo(p.serviceType, p.hubspotPipelineId) !== p.serviceType;
}
