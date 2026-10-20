/**
 * lib/cuentas/pase-server.ts — el pase de cuenta mueve lo abierto al encargado nuevo (2026-10-19). SERVIDOR.
 *
 * De quién a quién lo decide lib/cuentas/pase.ts (puro); qué tareas se mudan, lib/tareas/pase.ts. Acá se aplica, cada
 * cosa por el escritor de su módulo:
 *   · las tareas (seguimientos, siguiente paso de CS, rutinas del servicio): `pasarTareasPorElPase` (lib/tareas), con su
 *     evento «pasó de X a Y por el pase de cuenta»; y el siguiente paso en HubSpot se pone al día (`sincronizarCuenta`);
 *   · los avisos sin leer que le llegaron por llevar la cuenta: `pasarAvisosDeLaCuenta` (lib/para-ti);
 *   · las alertas abiertas de la cuenta que el anterior ya había visto vuelven a «sin ver», para que el nuevo las vea:
 *     `reabrirAlertasVistasPor` (lib/cs).
 * Lo que «Para ti» CALCULA por encargado (la cartera, las cuentas sin siguiente paso, cuándo presentar un documento, las
 * alertas de sus cuentas) no se mueve: sale solo del encargado nuevo en cuanto el espejo lo trae.
 *
 * Lo llaman la ruta del pase (`app/api/clients/[id]/cse-encargado`) y la sincronización de proyectos cuando ve que el
 * encargado cambió en HubSpot (`lib/hubspot/sync-projects.ts`). Correrlo dos veces no mueve nada la segunda.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { pasarTareasPorElPase, type TareaDelPase } from "@/lib/tareas/mutaciones";
import type { MotivoDelPase } from "@/lib/tareas/pase";
import { pasarAvisosDeLaCuenta, avisar } from "@/lib/para-ti/avisos-server";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";
import { reabrirAlertasVistasPor } from "@/lib/cs/alertas-del-pase-server";
import { sincronizarCuenta } from "@/lib/siguiente-paso/escritura-server";
import { proyectoQueLleva } from "./encargado";
import { SELECT_PARA_EL_ENCARGADO, nombresDelEquipo } from "./encargado-server";
import { destinoDelPase, hayPase, paresDelPase, planDelPase, type FusionDelPase, type PlanDelPase, type ProyectoDelPase } from "./pase";

/** Los proyectos activos de la cuenta con dueño, de cualquier pipeline: la foto que se compara antes y después. */
export async function fotoParaElPase(clientId: string): Promise<ProyectoDelPase[]> {
  const filas = await prisma.project.findMany({
    where: { clientId, status: "active", hubspotOwnerEmail: { not: null } },
    select: { id: true, ...SELECT_PARA_EL_ENCARGADO },
  });
  return filas.map((f) => ({ id: f.id, hubspotServiceId: f.hubspotServiceId, ownerId: f.hubspotOwnerId, ...proyectoQueLleva(f) }));
}

/** Quién lleva cada proyecto activo de la cuenta, de cualquier pipeline: sus tareas no se mudan en el pase. */
export async function quienesSiguen(clientId: string): Promise<Map<string, string>> {
  const foto = await fotoParaElPase(clientId);
  return new Map(foto.filter((p) => p.email).map((p) => [p.id, p.email!.toLowerCase()]));
}

export interface ResumenDelPase {
  tareas: TareaDelPase[];
  fusionadas: number;
  noSePudieron: number;
  avisos: number;
  alertas: number;
}

export const PASE_VACIO: ResumenDelPase = { tareas: [], fusionadas: 0, noSePudieron: 0, avisos: 0, alertas: 0 };

/** Aplica (o con `simular`, solo cuenta) lo que cambia de manos según el plan. */
export async function pasarLoDeLaCuenta(p: {
  clientId: string;
  plan: PlanDelPase;
  porEmail: string | null;
  motivo: MotivoDelPase;
  simular?: boolean;
}): Promise<ResumenDelPase> {
  if (!hayPase(p.plan)) return PASE_VACIO;
  const tareas = await pasarTareasPorElPase(
    { clientId: p.clientId, destino: (t) => destinoDelPase(p.plan, t), porEmail: p.porEmail, motivo: p.motivo },
    { simular: p.simular },
  );
  let avisos = 0;
  const porDestino = new Map<string, string[]>();
  for (const par of paresDelPase(p.plan)) porDestino.set(par.a, [...(porDestino.get(par.a) ?? []), par.de]);
  for (const [a, de] of porDestino) avisos += await pasarAvisosDeLaCuenta({ clientId: p.clientId, de, a, simular: p.simular });
  const alertas = await reabrirAlertasVistasPor(p.clientId, [...new Set([...porDestino.values()].flat())], { simular: p.simular });

  if (!p.simular) {
    if (tareas.movidas.some((t) => t.porQue === "siguiente-paso")) {
      // El siguiente paso de CS vive en HubSpot desde su tarea: con el responsable nuevo, se reescribe allá.
      await sincronizarCuenta(p.clientId).catch((e) => console.error(`[pase] no se pudo poner al día el siguiente paso de ${p.clientId}:`, e instanceof Error ? e.message : e));
    }
    for (const e of new Set([...porDestino.keys(), ...[...porDestino.values()].flat()])) olvidarMedicion(e);
  }
  return { tareas: tareas.movidas, fusionadas: tareas.fusionadas, noSePudieron: tareas.noSePudieron, avisos, alertas };
}

/** Una línea para el aviso: qué se le pasó a la persona nueva. Vacía si no se pasó nada. */
export function lineaDeLoQuePaso(r: ResumenDelPase, para: string): string {
  const suyas = r.tareas.filter((t) => t.a === para.toLowerCase()).length;
  const partes = [suyas ? `${suyas} ${suyas === 1 ? "tarea abierta" : "tareas abiertas"}` : "", r.avisos ? `${r.avisos} ${r.avisos === 1 ? "aviso" : "avisos"}` : "", r.alertas ? `${r.alertas} ${r.alertas === 1 ? "alerta" : "alertas"} sin ver` : ""].filter(Boolean);
  return partes.length ? `Te pasaron ${partes.join(", ")} de quien la llevaba.` : "";
}

/**
 * Después de una sincronización: si el encargado de la cuenta (o el de un proyecto) cambió, lo abierto pasa al nuevo.
 * `porEmail` = quien hizo el pase (si la sincronización la pidió el pase); null = cambió en HubSpot. NUNCA lanza: la
 * sincronización ya terminó bien y esto no la puede tumbar.
 */
export async function pasarSiCambioElEncargado(p: {
  clientId: string;
  antes: readonly ProyectoDelPase[];
  fusiones: readonly FusionDelPase[];
  porEmail: string | null;
}): Promise<ResumenDelPase> {
  try {
    const [despues, equipo] = await Promise.all([fotoParaElPase(p.clientId), nombresDelEquipo()]);
    const activos = new Set([...equipo.nombres.keys()].filter((e) => !equipo.deBaja.has(e)));
    const plan = planDelPase(p.antes, despues, { deBaja: equipo.deBaja, activos, fusiones: p.fusiones });
    if (!hayPase(plan)) return PASE_VACIO;
    const motivo: MotivoDelPase = p.porEmail ? "pase" : "hubspot";
    const r = await pasarLoDeLaCuenta({ clientId: p.clientId, plan, porEmail: p.porEmail, motivo });
    // El pase en Nexus ya avisa desde su ruta. Si cambió en HubSpot, nadie le avisó al nuevo: se le avisa acá.
    if (motivo === "hubspot" && plan.cuenta) {
      const cliente = await prisma.client.findUnique({ where: { id: p.clientId }, select: { name: true } });
      const dia = new Date().toISOString().slice(0, 10);
      await avisar({
        para: plan.cuenta.a,
        tipo: "proyecto.encargado",
        titulo: `Quedaste como encargado de ${cliente?.name ?? "una cuenta"}`,
        detalle: ["Cambió en HubSpot.", lineaDeLoQuePaso(r, plan.cuenta.a)].filter(Boolean).join(" "),
        href: `/clients/${encodeURIComponent(p.clientId)}`,
        actorEmail: null,
        dedupeKey: `proyecto.encargado:${p.clientId}:${dia}`,
      });
    }
    return r;
  } catch (e) {
    console.error(`[pase] no se pudo pasar lo de la cuenta ${p.clientId}:`, e instanceof Error ? e.message : e);
    return PASE_VACIO;
  }
}
