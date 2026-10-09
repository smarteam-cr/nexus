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
 * proyecto (los que vinieron del libro de Alex o se crearon a mano); para esos, el cliente: avisa solo si tiene un
 * proyecto pausado y NINGUNO en marcha.
 * ⚠ 2026-10-08: la primera regla («cualquier pausado del cliente») avisó en Bluesat por «BLUESAT - SERVICE HUB» (en
 * pausa en HubSpot) mientras la implementación de SignNow, a semana y media de terminar, seguía en marcha (Alex
 * Vanegas). Un aviso que se equivoca enseña a ignorarlo.
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

/** En marcha: activo y sin ninguna marca de pausa. */
export const enMarcha = (p: Pick<ProyectoParaPausa, "status" | "hubspotStatus" | "healthStatusOverride">): boolean =>
  p.status === "active" && !estaPausado(p);

/**
 * El proyecto pausado de una cuota, o null. `delServicio`: el proyecto del servicio (null si no tiene);
 * `delCliente`: los proyectos del cliente (pausados o activos), para los servicios sin proyecto. Con uno en marcha, no
 * avisa: la cuota puede ser de ese.
 */
export function proyectoPausadoDe(
  delServicio: ProyectoParaPausa | null,
  delCliente: ReadonlyArray<ProyectoParaPausa>,
): ProyectoPausadoDTO | null {
  if (delServicio) return estaPausado(delServicio) ? aDTO(delServicio) : null;
  if (delCliente.some(enMarcha)) return null;
  const pausado = delCliente.find(estaPausado);
  return pausado ? aDTO(pausado) : null;
}
