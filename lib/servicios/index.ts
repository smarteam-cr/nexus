/**
 * lib/servicios — los servicios recurrentes que Nexus sabe llevar por ciclos. PURO y CLIENT-SAFE.
 *
 * Un servicio recurrente nuevo es configuración, no código nuevo: una entrada acá (su guía, escrita desde
 * su documento de proceso) y una fila en la tabla de pipelines (`PipelineDef.servicioRecurrente`,
 * lib/projects/kind.ts). Las piezas —ciclo, casos de uso— son las mismas para todos.
 */
import { GUIA_SMARTLOOP } from "./smartloop";
import type { ClaveDeServicio, GuiaDeServicio } from "./tipos";

export const SERVICIOS_RECURRENTES: Record<ClaveDeServicio, GuiaDeServicio> = {
  smartloop: GUIA_SMARTLOOP,
};

export function guiaDeServicio(clave: ClaveDeServicio | null | undefined): GuiaDeServicio | null {
  return clave ? (SERVICIOS_RECURRENTES[clave] ?? null) : null;
}

export type { ClaveDeServicio, GuiaDeServicio } from "./tipos";
