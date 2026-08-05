/**
 * lib/clients/proyectos-internos.ts — la pestaña «Proyectos internos» del índice.
 *
 * ── QUÉ ES UN PROYECTO INTERNO ──────────────────────────────────────────────
 * Trabajo que hacemos para nosotros, de puertas adentro: no involucra a un cliente, no se
 * factura, no suma a la cartera de nadie. Hoy son SICOP y los dos de SmartAgro.
 *
 * ── POR QUÉ ESTA PESTAÑA ROMPE LA FORMA DE LAS OTRAS TRES ───────────────────
 * Las otras tres (Clientes · Prospectos · Aliados) responden "qué ES la empresa" y muestran
 * EMPRESAS. Ésta responde "qué trabajo estamos haciendo puertas adentro" y muestra
 * **PROYECTOS**, uno por fila. Es a propósito: mostrar las 2 empresas que los contienen
 * obliga a entrar a cada una para descubrir cuáles de sus proyectos son los internos —
 * Smarteam tiene 3 proyectos y solo 2 lo son.
 *
 * ⚠ Es un ATAJO, no una categoría: un proyecto interno vive en una empresa que sigue siendo
 * cliente. Por eso el contador de esta pestaña NO suma al de las otras tres, y por eso la
 * pestaña de categoría `INTERNO` («Nuestras empresas») es otra cosa y se muestra aparte.
 */
import { resolvePipeline } from "@/lib/projects/kind";
import type { ProyectoParaFiltro } from "@/lib/projects/scope";
import { esTrabajoInterno } from "./resumen-proyectos";

/** Una fila de la tabla. Se arma en el server; al browser viaja ya plana. */
export interface ProyectoInternoRow {
  id: string;
  nombre: string;
  clienteId: string;
  clienteNombre: string;
  /** El pipeline de HubSpot, en castellano. `null` si HubSpot no lo declaró. */
  tipo: string | null;
  etapa: string | null;
  encargado: string | null;
}

/** Lo mínimo que hay que traer de la base para poder armar una fila. */
export interface ProyectoCandidatoInterno extends ProyectoParaFiltro {
  id: string;
  name: string;
  hubspotPipelineStageLabel: string | null;
  hubspotOwnerName: string | null;
}

/**
 * Arma las filas de UNA empresa.
 *
 * El criterio no se escribe acá: es `esTrabajoInterno`, el mismo que produce el contador
 * `internos` del resumen. Dos copias del criterio significan que la pestaña puede mostrar 3
 * filas mientras el tooltip de la fila del cliente dice 2.
 */
export function proyectosInternosDe(
  cliente: { id: string; name: string },
  proyectos: readonly ProyectoCandidatoInterno[],
): ProyectoInternoRow[] {
  return proyectos.filter(esTrabajoInterno).map((p) => ({
    id: p.id,
    nombre: p.name,
    clienteId: cliente.id,
    clienteNombre: cliente.name,
    // Un pipeline que HubSpot no declaró se muestra como ausencia, no se degrada al legacy:
    // en una tabla de 3 filas, rotular «Implementación de HubSpot» algo que no lo dice sería
    // inventar el dato justo donde más se nota.
    tipo: resolvePipeline(p.hubspotPipelineId)?.label ?? null,
    etapa: p.hubspotPipelineStageLabel,
    encargado: p.hubspotOwnerName,
  }));
}

/** Orden estable: por empresa y después por nombre. Nunca el que devuelva la base. */
export function ordenarProyectosInternos(
  filas: readonly ProyectoInternoRow[],
): ProyectoInternoRow[] {
  return [...filas].sort(
    (a, b) =>
      a.clienteNombre.localeCompare(b.clienteNombre, "es") ||
      a.nombre.localeCompare(b.nombre, "es"),
  );
}

/** El texto por el que se busca una fila: proyecto, empresa y tipo. */
export const textoBuscableDe = (f: ProyectoInternoRow): string =>
  `${f.nombre} ${f.clienteNombre} ${f.tipo ?? ""}`;

export const COPY_PROYECTOS_INTERNOS = {
  titulo: "Proyectos internos",
  ayuda:
    "Trabajo que hacemos para nosotros, de puertas adentro: no involucra a un cliente, no se " +
    "factura y no suma a la cartera de nadie. Lo marca cada proyecto con la casilla «Proyecto " +
    "interno» de HubSpot.",
  vacioTitulo: "Ningún proyecto está marcado como interno",
  vacioDetalle:
    "Un proyecto se marca como interno con la casilla «Proyecto interno» en HubSpot, o al " +
    "crearlo desde «Nuevo proyecto». Acá aparecen los que estén abiertos.",
  contable: { uno: "proyecto interno", varios: "proyectos internos" },
} as const;
