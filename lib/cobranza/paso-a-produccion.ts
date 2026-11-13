/**
 * lib/cobranza/paso-a-produccion.ts — el paso a producción de un conector o de un servicio recurrente, por proyecto
 * (2026-11-13). PURO y CLIENT-SAFE.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────────
 * El cobro de un conector o de un servicio recurrente arranca cuando el servicio está EN PRODUCCIÓN, y eso lo sabe quien
 * lo construyó, no el cronograma. Hasta hoy `ServicioContratado.fechaInicioFacturacion` copiaba el arranque del
 * cronograma, y nadie confirmaba nada: a Construtecho, Ferretería Noelito y Grupo Printer no se les podía cobrar por
 * Stripe porque faltaba la confirmación de Alejandro Salas (Solution Architect). Ahora la confirmación es un dato: el
 * día, quién y cuándo (`CobroDelProyecto`).
 *
 * ── QUÉ PROYECTOS ENTRAN ────────────────────────────────────────────────────────
 *  · Los de Desarrollo e integración en marcha, y los que HubSpot ya tiene en «Recurrente» (entregados y vivos: así
 *    quedan los conectores y los sitios con mantenimiento).
 *  · Cualquier proyecto con un servicio de Cobranza CONECTOR o RECURRENTE ligado.
 *  · Cualquiera que ya tenga su fila (alguien le puso responsables).
 *
 * ── LAS TRES SITUACIONES ────────────────────────────────────────────────────────
 *  · «falta-confirmar»: el desarrollo quedó en «Recurrente» en HubSpot (o terminó y tiene un servicio de cobro
 *    recurrente ligado) y nadie confirmó la producción. Le llega a quien confirma (por defecto Alejandro Salas). Un
 *    desarrollo «Finalizado» sin servicio recurrente no: fue un trabajo de una vez (JUDESUR, medido el 2026-11-13), y su
 *    cobro no depende de ninguna producción.
 *  · «en-produccion»: confirmado. Si no tiene un servicio de Cobranza ligado, quien cobra tiene que arrancarlo.
 *  · «en-desarrollo»: todavía no terminó; no pide nada.
 */
import { PROJECT_PIPELINES } from "@/lib/projects/kind";
import { responsablesDelProyecto } from "./responsables";

const DESARROLLO = PROJECT_PIPELINES.find((p) => p.key === "development")!;
/** El pipeline de Desarrollo e integración en HubSpot. */
export const PIPELINE_DESARROLLO = DESARROLLO.hubspotPipelineId;
/** «Recurrente»: entregado y vivo, el servicio sigue. Es la etapa que pide confirmar la producción. */
export const ETAPA_RECURRENTE: string = DESARROLLO.stages.find((s) => s.label === "Recurrente")!.id;
/** Las etapas que dicen «el desarrollo terminó»: Recurrente (vivo) y Finalizado. No Cancelado. */
export const ETAPAS_TERMINADAS: readonly string[] = DESARROLLO.stages
  .filter((s) => s.label === "Recurrente" || s.label === "Finalizado")
  .map((s) => s.id);

export interface FilaDeCobroDelProyecto {
  confirmaProduccionEmail: string | null;
  cobraEmail: string | null;
  /** AAAA-MM-DD. */
  produccionDesde: string | null;
  produccionConfirmadaPor: string | null;
  /** ISO. */
  produccionConfirmadaEn: string | null;
}

export interface ServicioDelProyecto {
  id: string;
  tipoServicio: string;
  modalidad: string;
  estado: string;
  cobros: number;
}

export interface ProyectoParaProduccion {
  id: string;
  nombre: string;
  clientId: string;
  clienteNombre: string;
  hubspotPipelineId: string | null;
  hubspotPipelineStageId: string | null;
  hubspotPipelineStageLabel: string | null;
  hubspotStatus: string | null;
  /** `Project.status === "active"`. */
  activo: boolean;
  servicios: ServicioDelProyecto[];
  fila: FilaDeCobroDelProyecto | null;
}

export type SituacionDeProduccion =
  | { clave: "en-desarrollo" }
  | { clave: "falta-confirmar" }
  | { clave: "en-produccion"; desde: string; por: string; en: string; cobroArrancado: boolean };

export interface FilaDeProduccion extends ProyectoParaProduccion {
  situacion: SituacionDeProduccion;
  confirma: string;
  cobra: string;
}

/**
 * ¿El cobro de este servicio arranca con el paso a producción? Los conectores y los servicios recurrentes (soporte,
 * mantenimiento de un sitio, CRM). La SUSCRIPCIÓN no: es la licencia, y arranca con el contrato.
 */
export const arrancaConProduccion = (tipoServicio: string, modalidad: string): boolean =>
  tipoServicio === "CONECTOR" || (modalidad === "RECURRENTE" && tipoServicio !== "SUSCRIPCION");

const esDeCobroRecurrente = (s: ServicioDelProyecto) => s.estado !== "FINALIZADO" && arrancaConProduccion(s.tipoServicio, s.modalidad);

/** ¿Este proyecto va en la tabla? */
export function entraEnLaTabla(p: ProyectoParaProduccion): boolean {
  if (p.fila) return true;
  if (p.servicios.some(esDeCobroRecurrente)) return true;
  // Los de Desarrollo en marcha también: la CSL les pone responsables antes de que terminen.
  return p.hubspotPipelineId === PIPELINE_DESARROLLO && (p.activo || p.hubspotPipelineStageId === ETAPA_RECURRENTE);
}

/** HubSpot dice que el desarrollo terminó: «Recurrente» o «Finalizado», o el estado del servicio en `completed`. */
export function desarrolloTerminado(p: Pick<ProyectoParaProduccion, "hubspotPipelineStageId" | "hubspotStatus">): boolean {
  return (!!p.hubspotPipelineStageId && ETAPAS_TERMINADAS.includes(p.hubspotPipelineStageId)) || p.hubspotStatus === "completed";
}

/** ¿Pide confirmar la producción? En «Recurrente», o terminado con un servicio de cobro recurrente ligado. */
export function pideProduccion(p: ProyectoParaProduccion): boolean {
  return p.hubspotPipelineStageId === ETAPA_RECURRENTE || (desarrolloTerminado(p) && p.servicios.some(esDeCobroRecurrente));
}

export function situacionDeProduccion(p: ProyectoParaProduccion): SituacionDeProduccion {
  const f = p.fila;
  if (f?.produccionDesde && f.produccionConfirmadaPor && f.produccionConfirmadaEn) {
    // Arrancado = ya hay un servicio de cobro recurrente ligado al proyecto.
    return { clave: "en-produccion", desde: f.produccionDesde, por: f.produccionConfirmadaPor, en: f.produccionConfirmadaEn, cobroArrancado: p.servicios.some(esDeCobroRecurrente) };
  }
  return pideProduccion(p) ? { clave: "falta-confirmar" } : { clave: "en-desarrollo" };
}

/** La tabla: cada proyecto con su situación y sus dos responsables. Lo que pide algo, primero. */
export function tablaDeProduccion(proyectos: readonly ProyectoParaProduccion[]): FilaDeProduccion[] {
  const orden = (s: SituacionDeProduccion) => (s.clave === "falta-confirmar" ? 0 : s.clave === "en-produccion" && !s.cobroArrancado ? 1 : s.clave === "en-desarrollo" ? 2 : 3);
  return proyectos
    .filter(entraEnLaTabla)
    .map((p) => {
      const r = responsablesDelProyecto(p.fila);
      return { ...p, situacion: situacionDeProduccion(p), confirma: r.confirma, cobra: r.cobra };
    })
    .sort((a, b) => orden(a.situacion) - orden(b.situacion) || a.clienteNombre.localeCompare(b.clienteNombre, "es") || a.nombre.localeCompare(b.nombre, "es"));
}

/** Lo que le toca a una persona: confirmar producciones y arrancar cobros. */
export function loQueLeToca(filas: readonly FilaDeProduccion[], email: string): { confirmar: FilaDeProduccion[]; arrancar: FilaDeProduccion[] } {
  const e = email.trim().toLowerCase();
  return {
    confirmar: filas.filter((f) => f.situacion.clave === "falta-confirmar" && f.confirma === e),
    arrancar: filas.filter((f) => f.situacion.clave === "en-produccion" && !f.situacion.cobroArrancado && f.cobra === e),
  };
}

/**
 * Al confirmar la producción: a qué servicios del proyecto se les pone la fecha de arranque del cobro. Solo a los de
 * cobro recurrente que todavía no tienen cuotas: un servicio con cuotas ya tiene su calendario, y moverle el arranque
 * abriría la alerta «el arranque cambió» sobre plata que ya está en marcha.
 */
export function serviciosQueArrancan(servicios: readonly ServicioDelProyecto[]): string[] {
  return servicios.filter((s) => esDeCobroRecurrente(s) && s.cobros === 0).map((s) => s.id);
}
