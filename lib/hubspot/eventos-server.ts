/**
 * lib/hubspot/eventos-server.ts — procesa los AVISOS de HubSpot que guardó la ruta de webhooks (U10, 2026-10-25).
 * SERVER-ONLY. Lo corre el job `hubspot-eventos` en cada tick en que hay avisos pendientes.
 *
 * Qué dispara cada aviso: lib/hubspot/eventos.ts (puro). Las copias que se adelantan son las del sondeo, con sus candados.
 * Un aviso no decide de quién es nada (invariante 1): solo adelanta la copia que ya lo decide.
 *
 * ⚠ El tick del scheduler es UNO para todos los jobs, uno detrás de otro: este job hace poco por tick a propósito
 * (`CLIENTES_POR_TICK` sincronizaciones y, como mucho, UNA copia adelantada, una cada 20 minutos y solo de día). Lo que no
 * entra queda pendiente para el tick siguiente.
 *
 * Un aviso queda «procesado» solo cuando lo que pide corrió de verdad: la sincronización de la ficha (no la que se saltó
 * por el piso de 60 s) o la copia adelantada. Lo que falla suma un intento, y a los 5 queda «error» (rojo del job). Una
 * copia adelantada que falla anota su hora igual: no se reintenta cada minuto.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { crDateParts } from "@/lib/jobs/time";
import { guardarPares } from "./fusiones-server";
import { avisoListo, planDeEventos, sePuedeAdelantar } from "./eventos";

const LOCK_KEY = "hubspot-eventos-lock";
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;
/** Cuándo se adelantó (o se intentó adelantar) cada copia por última vez. */
const FILA_DE_ADELANTOS = "hubspot-eventos-adelantos";
const POR_TICK = 300;
export const MAX_INTENTOS_DE_UN_AVISO = 5;
/** Las sincronizaciones de proyectos por tick (cada una son varios pedidos a HubSpot): el resto, el tick siguiente. */
const CLIENTES_POR_TICK = 3;
/** Cuánto se guardan los avisos ya procesados o ignorados (para mirar qué llegó). Los pendientes y con error, siempre. */
export const DIAS_QUE_SE_GUARDAN_LOS_AVISOS = 30;

export interface ResultadoDeLosAvisos {
  sinTabla?: boolean;
  locked?: boolean;
  pendientes: number;
  procesados: number;
  ignorados: number;
  conError: number;
  fusiones: number;
  clientes: number;
  contactos: "copiados" | "esperan" | "fallo" | null;
  negocios: "copiados" | "esperan" | "fallo" | null;
  errores: string[];
}

async function tomarLock(now: Date): Promise<boolean> {
  await prisma.cronJobState
    .upsert({ where: { id: LOCK_KEY }, update: {}, create: { id: LOCK_KEY } })
    .catch((e) => {
      if ((e as { code?: string })?.code !== "P2002") throw e;
    });
  const claimed = await prisma.cronJobState.updateMany({
    where: { id: LOCK_KEY, OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } }] },
    data: { lastRunAt: now },
  });
  return claimed.count === 1;
}

async function soltarLock(): Promise<void> {
  await prisma.cronJobState.updateMany({ where: { id: LOCK_KEY }, data: { lastRunAt: null } }).catch(() => {});
}

/** La última vez que corrió cada copia: la del sondeo (la fila de su job) o la adelantada por un aviso. */
async function ultimasCopias(): Promise<{ contactos: Date | null; negocios: Date | null }> {
  const filas = await prisma.cronJobState.findMany({ where: { id: { in: ["contactos-y-tickets", "negocios-abiertos", FILA_DE_ADELANTOS] } }, select: { id: true, lastRunAt: true, lastResult: true } });
  const de = (id: string) => filas.find((f) => f.id === id);
  const adelantos = (de(FILA_DE_ADELANTOS)?.lastResult ?? {}) as { contactos?: string; negocios?: string };
  const max = (a: Date | null | undefined, b: string | undefined) => {
    const fb = b ? new Date(b) : null;
    if (!a) return fb;
    if (!fb) return a;
    return a > fb ? a : fb;
  };
  return { contactos: max(de("contactos-y-tickets")?.lastRunAt, adelantos.contactos), negocios: max(de("negocios-abiertos")?.lastRunAt, adelantos.negocios) };
}

async function anotarAdelanto(que: "contactos" | "negocios", ahora: Date): Promise<void> {
  const fila = await prisma.cronJobState.findUnique({ where: { id: FILA_DE_ADELANTOS }, select: { lastResult: true } });
  const previo = (fila?.lastResult ?? {}) as Record<string, string>;
  const valor = { ...previo, [que]: ahora.toISOString() };
  await prisma.cronJobState.upsert({ where: { id: FILA_DE_ADELANTOS }, update: { lastResult: valor }, create: { id: FILA_DE_ADELANTOS, lastResult: valor } });
}

async function marcar(ids: readonly string[], estado: "procesado" | "ignorado", ahora: Date): Promise<number> {
  if (!ids.length) return 0;
  const r = await prisma.eventoDeHubspot.updateMany({ where: { id: { in: [...ids] }, estado: "pendiente" }, data: { estado, procesadoAt: ahora, error: null } });
  return r.count;
}

/** Suma un intento; a los `MAX_INTENTOS_DE_UN_AVISO`, el aviso queda «error». Devuelve cuántos quedaron en error. */
async function fallo(ids: readonly string[], error: string): Promise<number> {
  if (!ids.length) return 0;
  await prisma.eventoDeHubspot.updateMany({ where: { id: { in: [...ids] }, estado: "pendiente" }, data: { intentos: { increment: 1 }, error: error.slice(0, 500) } });
  const r = await prisma.eventoDeHubspot.updateMany({ where: { id: { in: [...ids] }, estado: "pendiente", intentos: { gte: MAX_INTENTOS_DE_UN_AVISO } }, data: { estado: "error" } });
  return r.count;
}

/** Borra los avisos procesados o ignorados de hace más de `DIAS_QUE_SE_GUARDAN_LOS_AVISOS` (son un registro, no una copia). */
export async function limpiarAvisosViejos(ahora = new Date()): Promise<number> {
  try {
    const r = await prisma.eventoDeHubspot.deleteMany({
      where: { estado: { in: ["procesado", "ignorado"] }, procesadoAt: { lt: new Date(+ahora - DIAS_QUE_SE_GUARDAN_LOS_AVISOS * 86_400_000) } },
    });
    return r.count;
  } catch (e) {
    if (esquemaDesactualizado(e)) return 0;
    throw e;
  }
}

/** Un tick: los avisos pendientes, en orden de llegada. null = no había nada que hacer. */
export async function procesarAvisosDeHubspot(ahora = new Date()): Promise<ResultadoDeLosAvisos | null> {
  const r: ResultadoDeLosAvisos = { pendientes: 0, procesados: 0, ignorados: 0, conError: 0, fusiones: 0, clientes: 0, contactos: null, negocios: null, errores: [] };
  let pendientes;
  try {
    /* Las empresas y las fusiones, primero y aparte: una importación de 2.000 contactos no puede taparlas. De los
       contactos, tickets y negocios alcanza con saber que hay (la copia adelantada es la entera, y al terminar da por
       hechos TODOS los avisos de su tipo que llegaron antes de arrancar). */
    const select = { id: true, objeto: true, tipo: true, hubspotId: true, idsFusionados: true, idSobreviviente: true, recibidoAt: true } as const;
    const [deEmpresas, delResto] = await Promise.all([
      prisma.eventoDeHubspot.findMany({ where: { estado: "pendiente", OR: [{ objeto: "empresa" }, { tipo: "fusion" }] }, orderBy: { recibidoAt: "asc" }, take: POR_TICK, select }),
      prisma.eventoDeHubspot.findMany({ where: { estado: "pendiente", objeto: { not: "empresa" }, tipo: { not: "fusion" } }, orderBy: { recibidoAt: "asc" }, take: POR_TICK, select }),
    ]);
    pendientes = [...deEmpresas, ...delResto];
  } catch (e) {
    if (esquemaDesactualizado(e)) return { ...r, sinTabla: true };
    throw e;
  }
  if (!pendientes.length) return null;
  if (!(await tomarLock(ahora))) return { ...r, locked: true };
  try {
    r.pendientes = pendientes.length;
    const clientes = await prisma.client.findMany({ where: { hubspotCompanyId: { not: null }, kind: { in: ["CLIENTE", "PROSPECTO"] } }, select: { id: true, hubspotCompanyId: true } });
    const clientesPorEmpresa = new Map<string, string[]>();
    for (const c of clientes) clientesPorEmpresa.set(String(c.hubspotCompanyId), [...(clientesPorEmpresa.get(String(c.hubspotCompanyId)) ?? []), c.id]);
    const plan = planDeEventos(pendientes, clientesPorEmpresa);

    r.ignorados += await marcar(plan.ignorados, "ignorado", ahora);

    // Las empresas de Nexus: la sincronización de sus proyectos (la de la ficha). `force` salta el cooldown de 10 min
    // (un aviso es justamente «cambió algo»); el piso de 60 s no se salta, y entonces el aviso espera al tick siguiente.
    const sincronizadas = new Set<string>();
    const fallaron = new Set<string>();
    if (plan.clientes.length) {
      const { syncProjectsForClient } = await import("./sync-projects");
      for (const clientId of plan.clientes.slice(0, CLIENTES_POR_TICK)) {
        try {
          const s = await syncProjectsForClient(clientId, { force: true });
          // La sincronización no lanza ante un token vencido o una empresa que no se pudo verificar: lo anota en `errors`.
          if (s.errors.length) {
            fallaron.add(clientId);
            r.errores.push(`proyectos de ${clientId}: ${s.errors[0]}`);
          } else if (!s.omitido || s.omitido === "en_vuelo") {
            sincronizadas.add(clientId);
            r.clientes++;
          }
        } catch (e) {
          fallaron.add(clientId);
          r.errores.push(`proyectos de ${clientId}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
    const listosPorEmpresa = (ids: readonly string[]) => ids.filter((id) => avisoListo(plan.clientesDelAviso.get(id), sincronizadas));
    const conFallaDeEmpresa = (ids: readonly string[]) => ids.filter((id) => (plan.clientesDelAviso.get(id) ?? []).some((c) => fallaron.has(c)));

    // U9: las fusiones, a la tabla. La de una empresa de Nexus queda procesada cuando su ficha se sincronizó.
    if (plan.porCopia.fusiones.length) {
      try {
        r.fusiones = await guardarPares(plan.pares, ahora);
        r.procesados += await marcar(listosPorEmpresa(plan.porCopia.fusiones), "procesado", ahora);
        r.conError += await fallo(conFallaDeEmpresa(plan.porCopia.fusiones), "la sincronización de proyectos falló");
      } catch (e) {
        r.errores.push(`fusiones: ${e instanceof Error ? e.message : e}`);
        r.conError += await fallo(plan.porCopia.fusiones, e instanceof Error ? e.message : String(e));
      }
    }
    r.procesados += await marcar(listosPorEmpresa(plan.porCopia.empresas), "procesado", ahora);
    r.conError += await fallo(conFallaDeEmpresa(plan.porCopia.empresas), "la sincronización de proyectos falló");

    // Como mucho UNA copia adelantada por tick (la que más tiempo lleva sin correr), y solo de día.
    const ultimas = await ultimasCopias();
    const hora = crDateParts(ahora).hour;
    const quieren = (
      [
        plan.copiarContactos ? { que: "contactos" as const, ultima: ultimas.contactos } : null,
        plan.copiarNegocios ? { que: "negocios" as const, ultima: ultimas.negocios } : null,
      ].filter(Boolean) as { que: "contactos" | "negocios"; ultima: Date | null }[]
    ).sort((a, b) => +(a.ultima ?? 0) - +(b.ultima ?? 0));
    let adelantada = false;
    for (const q of quieren) {
      if (adelantada || !sePuedeAdelantar(q.ultima, ahora, hora)) {
        r[q.que] = "esperan";
        continue;
      }
      adelantada = true;
      const ids = q.que === "contactos" ? plan.porCopia.contactos : plan.porCopia.negocios;
      const arranque = new Date();
      try {
        const locked =
          q.que === "contactos"
            ? (await (await import("@/lib/contactos/copia-server")).copiarContactosYTickets()).locked
            : (await (await import("@/lib/ventas/sync-negocios-abiertos")).syncNegociosAbiertos()).locked;
        await anotarAdelanto(q.que, ahora);
        if (locked) r[q.que] = "esperan";
        else {
          r[q.que] = "copiados";
          // Todos los de su tipo que llegaron antes de que arrancara la copia (también los que no entraron en este tick).
          const objetos = q.que === "contactos" ? ["contacto", "ticket"] : ["negocio"];
          const hechos = await prisma.eventoDeHubspot.updateMany({
            where: { estado: "pendiente", objeto: { in: objetos }, tipo: { not: "fusion" }, recibidoAt: { lte: arranque } },
            data: { estado: "procesado", procesadoAt: ahora, error: null },
          });
          r.procesados += hechos.count;
        }
      } catch (e) {
        // Se anota la hora igual: una falla (el token, la base) no relanza la copia entera cada minuto.
        await anotarAdelanto(q.que, ahora).catch(() => {});
        r[q.que] = "fallo";
        r.errores.push(`${q.que}: ${e instanceof Error ? e.message : e}`);
        r.conError += await fallo(ids, `la copia adelantada de ${q.que} falló: ${e instanceof Error ? e.message : e}`);
      }
    }
    return r;
  } finally {
    await soltarLock();
  }
}
