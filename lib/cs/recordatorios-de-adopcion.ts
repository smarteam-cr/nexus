/**
 * lib/cs/recordatorios-de-adopcion.ts — CUÁNDO se le recuerda al CSE de la cuenta y a la líder de
 * Customer Success revisar la adopción del cliente (2026-10-07). PURO.
 *
 * Pedido de Elías: tres momentos, y el recordatorio lleva directo a la pestaña Adopción de la cuenta.
 *   1. A los 30 días de iniciado el proyecto (el arranque del cronograma o, sin él, cuando se creó en
 *      HubSpot).
 *   2. Una semana antes de la entrega (el cierre que muestra el cronograma: el fijado a mano o el
 *      proyectado). Si la entrega se mueve, el recordatorio vale para la fecha nueva.
 *   3. Una vez al mes en las cuentas con servicio recurrente (tag `recurrente`, la etapa
 *      Continuidad o un proyecto de SmartLoop), en la primera semana del mes.
 *
 * No es retroactivo: cada momento tiene una ventana de siete días. Un proyecto que cumplió los 30 días
 * hace dos meses no recibe el recordatorio el día que esto llegó a producción.
 */
import { diasEntre } from "./formato";

/** Los días que dura la ventana de cada momento: el job corre a diario, y una caída de un día no lo pierde. */
export const VENTANA_DEL_RECORDATORIO = 7;
export const DIAS_DESDE_EL_INICIO = 30;
export const DIAS_ANTES_DE_LA_ENTREGA = 7;

export type MomentoDeAdopcion = "inicio" | "entrega" | "mensual";

export interface ProyectoParaRecordar {
  projectId: string;
  clientId: string;
  /** AAAA-MM-DD: el arranque del cronograma o, sin él, cuando se creó en HubSpot. null = no se sabe. */
  inicio: string | null;
  /** AAAA-MM-DD: la entrega que muestra el cronograma. null = sin fecha. */
  entrega: string | null;
  recurrente: boolean;
}

export interface Recordatorio {
  momento: MomentoDeAdopcion;
  clientId: string;
  /** null en el mensual: es de la cuenta, no de un proyecto. */
  projectId: string | null;
  /** Lo que hace único al recordatorio (con la persona, no se repite). */
  clave: string;
  /** La fecha del momento (inicio + 30, la entrega o el mes). */
  referencia: string;
}

/** Los recordatorios que tocan hoy para un proyecto. El mensual sale una vez por cuenta (lo junta `recordatoriosDeHoy`). */
export function recordatoriosDelProyecto(p: ProyectoParaRecordar, hoy: string): Recordatorio[] {
  const fuera: Recordatorio[] = [];
  if (p.inicio) {
    const dias = diasEntre(p.inicio, hoy);
    if (dias >= DIAS_DESDE_EL_INICIO && dias < DIAS_DESDE_EL_INICIO + VENTANA_DEL_RECORDATORIO) {
      fuera.push({
        momento: "inicio",
        clientId: p.clientId,
        projectId: p.projectId,
        clave: `adopcion:inicio:${p.projectId}`,
        referencia: p.inicio,
      });
    }
  }
  if (p.entrega) {
    const faltan = diasEntre(hoy, p.entrega);
    if (faltan >= 0 && faltan <= DIAS_ANTES_DE_LA_ENTREGA) {
      fuera.push({
        momento: "entrega",
        clientId: p.clientId,
        projectId: p.projectId,
        clave: `adopcion:entrega:${p.projectId}:${p.entrega}`,
        referencia: p.entrega,
      });
    }
  }
  if (p.recurrente && Number(hoy.slice(8, 10)) <= VENTANA_DEL_RECORDATORIO) {
    const mes = hoy.slice(0, 7);
    fuera.push({ momento: "mensual", clientId: p.clientId, projectId: null, clave: `adopcion:mes:${p.clientId}:${mes}`, referencia: mes });
  }
  return fuera;
}

/** Los de todos los proyectos, sin repetir: el mensual de una cuenta con dos proyectos recurrentes sale una vez. */
export function recordatoriosDeHoy(proyectos: readonly ProyectoParaRecordar[], hoy: string): Recordatorio[] {
  const vistos = new Map<string, Recordatorio>();
  for (const p of proyectos) for (const r of recordatoriosDelProyecto(p, hoy)) if (!vistos.has(r.clave)) vistos.set(r.clave, r);
  return [...vistos.values()];
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** El título y el detalle del aviso. */
export function textoDelRecordatorio(r: Recordatorio, empresa: string, proyecto: string | null): { titulo: string; detalle: string } {
  switch (r.momento) {
    case "inicio":
      return {
        titulo: `Revisa la adopción de ${empresa}: lleva 30 días`,
        detalle: `«${proyecto ?? empresa}» arrancó hace un mes. Mira qué se está usando y qué todavía no se activó.`,
      };
    case "entrega":
      return {
        titulo: `Revisa la adopción de ${empresa} antes de la entrega`,
        detalle: `«${proyecto ?? empresa}» se entrega en menos de una semana. Llega a la entrega sabiendo qué usa y qué no.`,
      };
    case "mensual": {
      const mes = MESES[Number(r.referencia.slice(5, 7)) - 1] ?? r.referencia;
      return {
        titulo: `Revisa la adopción de ${empresa} (${mes})`,
        detalle: "La revisión mensual de las cuentas con servicio recurrente: uso, licencias y lo que falta activar.",
      };
    }
  }
}

/** Adónde lleva: la pestaña Adopción de la cuenta en Éxito del cliente. */
export function urlDeLaAdopcion(clientId: string): string {
  return `/customer-success/${clientId}?pestana=adopcion`;
}
