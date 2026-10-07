/**
 * lib/cobranza/proyecto-pausado.ts — el aviso de «proyecto pausado» al facturar (pedido de Elías, 2026-10-06).
 *
 * Cuando una cuota está pendiente y el proyecto de ese cliente está pausado en Nexus, quien factura tiene que verlo
 * ANTES de facturar: «El proyecto está pausado. Consulta con Customer Success y el líder antes de facturar.» El aviso
 * no frena nada; es para no mandarle una factura a un cliente que pidió pausar.
 *
 * ── QUÉ ES «PAUSADO» ──────────────────────────────────────────────────────────────
 * Cualquiera de las tres marcas que Nexus tiene de un proyecto en pausa (por proyecto, sin rango de fechas):
 *   · `hubspotStatus === "on_hold"`        el estado de HubSpot, que se espeja. Es la única que se usa hoy.
 *   · `healthStatusOverride === "PAUSADO"` la salud fijada a mano.
 *   · `status === "paused"`                el estado interno del proyecto.
 * NO cuenta un servicio de cobranza en PAUSADO: es una decisión de Finanzas sobre ese servicio, no del proyecto.
 *
 * ── DE QUÉ PROYECTO ES UNA CUOTA ──────────────────────────────────────────────────
 * El del servicio (`ServicioContratado.projectId`) cuando lo tiene: ese manda, pausado o no. Muchos servicios no tienen
 * proyecto (los que vinieron del libro de Alex o se crearon a mano); para esos, cualquier proyecto pausado del cliente.
 * Ahí puede avisar de más si el cliente tiene otro proyecto que sí sigue: preguntar antes de facturar es barato.
 *
 * Se calcula al LEER (la cola, las alertas, el cronograma) y no se guarda en la alerta: `AlertaCobro.mensaje` se
 * conserva entre corridas y el aviso quedaría pegado cuando el proyecto se reanude.
 *
 * PURO: sin Prisma ni red.
 */

export const AVISO_PROYECTO_PAUSADO = "El proyecto está pausado. Consulta con Customer Success y el líder antes de facturar.";

export interface ProyectoParaPausa {
  id: string;
  name: string;
  status: string | null;
  hubspotStatus: string | null;
  healthStatusOverride: string | null;
  /** El CSE encargado (de `csl_encargado`), para decir con quién hablar. */
  hubspotOwnerName: string | null;
}

/** Lo que viaja a la pantalla: qué proyecto y con quién hablar. */
export interface ProyectoPausadoDTO {
  projectId: string;
  nombre: string;
  cse: string | null;
}

/** El `where` de Prisma con las mismas tres marcas (objeto plano: este módulo no importa Prisma). */
export const PROYECTO_PAUSADO_WHERE = {
  OR: [{ hubspotStatus: "on_hold" }, { healthStatusOverride: "PAUSADO" as const }, { status: "paused" }],
};

export function estaPausado(p: Pick<ProyectoParaPausa, "status" | "hubspotStatus" | "healthStatusOverride">): boolean {
  return p.hubspotStatus === "on_hold" || p.healthStatusOverride === "PAUSADO" || p.status === "paused";
}

const aDTO = (p: ProyectoParaPausa): ProyectoPausadoDTO => ({ projectId: p.id, nombre: p.name, cse: p.hubspotOwnerName });

/**
 * El proyecto pausado de una cuota, o null. `delServicio`: el proyecto del servicio (null si no tiene);
 * `pausadosDelCliente`: los proyectos pausados de su cliente, para los servicios sin proyecto.
 */
export function proyectoPausadoDe(
  delServicio: ProyectoParaPausa | null,
  pausadosDelCliente: ReadonlyArray<ProyectoParaPausa>,
): ProyectoPausadoDTO | null {
  if (delServicio) return estaPausado(delServicio) ? aDTO(delServicio) : null;
  const pausado = pausadosDelCliente.find(estaPausado);
  return pausado ? aDTO(pausado) : null;
}
