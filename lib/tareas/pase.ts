/**
 * lib/tareas/pase.ts — qué tareas de una cuenta se mudan cuando cambia quien la lleva (2026-10-19). PURO.
 *
 * ── EL CRITERIO ──────────────────────────────────────────────────────────────────────────────────
 * Se mudan SOLO las tareas que Nexus le dio a esa persona POR SER LA ENCARGADA de la cuenta. Las que hizo o pidió como
 * persona se quedan con ella: son su trabajo y su palabra, no un puesto.
 *   · se mudan:
 *       – el SEGUIMIENTO de lo que prometió el cliente (`lado = "cliente"`, de una reunión o un correo, que propuso
 *         Nexus: `creadaPorEmail` vacío). Nexus se lo manda al CSE de la cuenta o del proyecto (lib/tareas/seguimiento.ts);
 *       – el SIGUIENTE PASO de Customer Success (`origen = "paso"` en el sprint `cs`): es el paso de la cuenta, no de
 *         la persona;
 *       – las RUTINAS del servicio recurrente (`origen = "plantilla"`, `origenId = servicio:…`), que Nexus le asigna
 *         al encargado del proyecto (lib/servicios/servicio-server.ts).
 *   · se quedan: lo que se comprometió la persona en una reunión (`lado = "smarteam"`), lo que creó a mano o con el
 *     chat, lo que alguien le pidió (un pedido es a la persona), sus tareas de HubSpot (la dueña vive en HubSpot y
 *     Nexus no la cambia por esto), sus reuniones planeadas (son de su calendario) y todo lo «Solo para mí».
 * Solo lo abierto (propuesta, pendiente, en curso) y no archivado. Lo hecho no cambia de dueña: es historia.
 */
import { SISTEMA } from "./estados";

export type PorQueLaMueve = "seguimiento" | "siguiente-paso" | "rutina";

export interface TareaParaElPase {
  estado: string;
  privada: boolean;
  archivadaAt: Date | string | null;
  origen: string;
  origenId: string | null;
  clase: string;
  lado: string;
  creadaPorEmail: string | null;
  equipo: string | null;
  responsableEmail: string | null;
}

export const ESTADOS_QUE_SE_MUDAN = ["propuesta", "pendiente", "en_curso"] as const;

/** Por qué esta tarea se muda con la cuenta, o null si se queda con su responsable. */
export function porQueLaMueveElPase(t: TareaParaElPase): PorQueLaMueve | null {
  if (t.archivadaAt || t.privada || !t.responsableEmail) return null;
  if (!(ESTADOS_QUE_SE_MUDAN as readonly string[]).includes(t.estado)) return null;
  if (t.origen === "hubspot" || t.clase === "reunion") return null;
  if (t.lado === "cliente" && !t.creadaPorEmail && (t.origen === "reunion" || t.origen === "correo")) return "seguimiento";
  if (t.origen === "paso" && t.equipo === "cs") return "siguiente-paso";
  if (t.origen === "plantilla" && (t.origenId ?? "").startsWith("servicio:")) return "rutina";
  return null;
}

/** Cómo cambió quien lleva la cuenta: por el pase en Nexus o porque cambió en HubSpot. */
export type MotivoDelPase = "pase" | "hubspot";

/** La línea de la historia de la tarea. */
export function textoDelPase(desde: string, hacia: string, motivo: MotivoDelPase): string {
  return motivo === "pase" ? `pasó de ${desde} a ${hacia} por el pase de cuenta` : `pasó de ${desde} a ${hacia}: cambió el encargado de la cuenta en HubSpot`;
}

/** Quien firma el movimiento: la persona que hizo el pase, o el sistema si cambió en HubSpot. */
export function firmaDelPase(porEmail: string | null | undefined): string {
  return (porEmail ?? "").trim().toLowerCase() || SISTEMA;
}
