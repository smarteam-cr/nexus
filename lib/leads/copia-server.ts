/**
 * lib/leads/copia-server.ts — copia los LEADS de HubSpot de las empresas de Nexus (clientes y prospectos) y de sus
 * contactos a `LeadDeHubspot` (B3 etapa 1, 2026-10-25). El ÚNICO escritor de esa tabla. SERVER-ONLY.
 *
 * Solo LEE HubSpot. Lo corre el job `hubspot-leads` cada hora de 6:00 a 20:00 (Costa Rica) y, la primera vez,
 * `scripts/sync-leads-de-hubspot.ts`. Las reglas, las de la copia de contactos (lib/contactos/copia-server.ts):
 *   · un candado en la base: una corrida a la vez entre el servidor y las dos PCs;
 *   · nunca se borra una fila: lo que deja de ser de un cliente queda `vigente = false`;
 *   · un lead es de UN cliente (lib/leads/reglas.ts, la misma regla de las comunicaciones); el de dos no se guarda;
 *   · sin permiso (403) no se toca nada y la corrida lo dice.
 *
 * Lo que sigue en el plan (B3 etapas 2 y 3): verlos en la preventa y en «Llegaron por el test», y que los lean los
 * agentes de la preventa. Esta copia no tiene lectores todavía.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { leerDuenos } from "@/lib/hubspot/duenos";
import { asociacionesDeLeads, etapasDeLeads, listarLeads } from "@/lib/hubspot/leads";
import { clienteDelLead, datosDelLead, huellaDelLead, planDeLeads, type LeadParaCopiar, type PlanDeLeads } from "./reglas";

const LOCK_KEY = "hubspot-leads-lock";
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

export interface ResultadoDeLaCopiaDeLeads {
  locked?: boolean;
  sinPermiso: boolean;
  completa: boolean;
  leidos: number;
  creados: number;
  actualizados: number;
  bajas: number;
  sinCambio: number;
  /** De dos o más clientes: no se guardan (invariante 1). */
  ambiguos: number;
  /** No son de ningún cliente de Nexus. */
  deNadie: number;
  /** Sus asociaciones no se pudieron leer: no se tocan. */
  ilegibles: number;
  porCliente: Map<string, number>;
  plan?: PlanDeLeads;
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

/** Copia los leads. Con `escribir: false` es un simulacro: lee todo, arma el plan y no escribe nada (ni toma el candado). */
export async function copiarLeads(opciones: { escribir?: boolean; ahora?: Date } = {}): Promise<ResultadoDeLaCopiaDeLeads> {
  const escribir = opciones.escribir ?? true;
  const ahora = opciones.ahora ?? new Date();
  const r: ResultadoDeLaCopiaDeLeads = {
    sinPermiso: false, completa: false, leidos: 0, creados: 0, actualizados: 0, bajas: 0, sinCambio: 0, ambiguos: 0, deNadie: 0, ilegibles: 0, porCliente: new Map(),
  };
  if (escribir && !(await tomarLock(ahora))) return { ...r, locked: true };
  try {
    const clientes = await prisma.client.findMany({
      where: { hubspotCompanyId: { not: null }, kind: { in: ["CLIENTE", "PROSPECTO"] } },
      select: { id: true, hubspotCompanyId: true },
    });
    const idsDeClientes = new Set(clientes.map((c) => c.id));
    const clientesPorEmpresa = new Map<string, string[]>();
    for (const c of clientes) clientesPorEmpresa.set(String(c.hubspotCompanyId), [...(clientesPorEmpresa.get(String(c.hubspotCompanyId)) ?? []), c.id]);
    const clientesPorContacto = new Map<string, string[]>();
    for (const c of await prisma.contactoDeHubspot.findMany({ where: { vigente: true }, select: { hubspotId: true, clientId: true } })) {
      if (!idsDeClientes.has(c.clientId)) continue;
      const lista = clientesPorContacto.get(c.hubspotId) ?? [];
      if (!lista.includes(c.clientId)) lista.push(c.clientId);
      clientesPorContacto.set(c.hubspotId, lista);
    }

    const hs = await getSystemHubspotClient();
    const lista = await listarLeads(hs);
    if (lista.sinPermiso) return { ...r, sinPermiso: true };
    r.completa = lista.completa;
    r.leidos = lista.leads.length;
    const ids = lista.leads.map((l) => l.id);
    const [aEmpresas, aContactos, etapas, duenos] = await Promise.all([
      asociacionesDeLeads(hs, ids, "companies"),
      asociacionesDeLeads(hs, ids, "contacts"),
      etapasDeLeads(hs),
      leerDuenos(hs).catch(() => null),
    ]);
    if (aEmpresas.sinPermiso || aContactos.sinPermiso) return { ...r, sinPermiso: true };
    const correoDelDueno = (ownerId: string | null) => (ownerId ? (duenos?.porOwner.get(ownerId)?.email ?? null) : null);

    const ilegibles = new Set([...aEmpresas.ilegibles, ...aContactos.ilegibles]);
    r.ilegibles = ilegibles.size;
    const decididos = new Set<string>();
    const paraCopiar: LeadParaCopiar[] = [];
    for (const l of lista.leads) {
      if (ilegibles.has(l.id)) continue;
      decididos.add(l.id);
      const contactos = aContactos.porLead.get(l.id) ?? [];
      const cliente = clienteDelLead({ empresas: aEmpresas.porLead.get(l.id) ?? [], contactos }, clientesPorEmpresa, clientesPorContacto);
      if (cliente.tipo === "ambigua") {
        r.ambiguos++;
        continue;
      }
      if (cliente.tipo === "ninguno") {
        r.deNadie++;
        continue;
      }
      const datos = datosDelLead(l.p, { etapas, correoDelDueno, contactoPrincipal: contactos[0] ?? null });
      paraCopiar.push({ hubspotId: l.id, clientId: cliente.clientId, datos, huella: huellaDelLead(datos) });
      r.porCliente.set(cliente.clientId, (r.porCliente.get(cliente.clientId) ?? 0) + 1);
    }

    const existentes = await prisma.leadDeHubspot.findMany({ select: { hubspotId: true, clientId: true, huella: true, vigente: true } }).catch((e: unknown) => {
      // En el simulacro, sin la tabla (el SQL sin aplicar) todo cuenta como nuevo. Al escribir, sí falla.
      if (!escribir && esquemaDesactualizado(e)) return [];
      throw e;
    });
    const plan = planDeLeads(existentes, paraCopiar, { decididos, enLaLista: new Set(ids), listaCompleta: lista.completa });
    Object.assign(r, { creados: plan.crear.length, actualizados: plan.actualizar.length, bajas: plan.bajas.length, sinCambio: plan.sinCambio, plan });

    if (escribir) {
      if (plan.crear.length) {
        await prisma.leadDeHubspot.createMany({
          data: plan.crear.map((l) => ({ hubspotId: l.hubspotId, clientId: l.clientId, ...l.datos, huella: l.huella, copiadoAt: ahora })),
          skipDuplicates: true,
        });
      }
      for (const l of plan.actualizar) {
        await prisma.leadDeHubspot.update({
          where: { hubspotId: l.hubspotId },
          data: { clientId: l.clientId, ...l.datos, huella: l.huella, vigente: true, copiadoAt: ahora },
        });
      }
      if (plan.bajas.length) await prisma.leadDeHubspot.updateMany({ where: { hubspotId: { in: plan.bajas } }, data: { vigente: false, copiadoAt: ahora } });
    }
    return r;
  } finally {
    if (escribir) await soltarLock();
  }
}
