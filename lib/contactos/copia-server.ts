/**
 * lib/contactos/copia-server.ts — copia los contactos y los tickets de HubSpot de las empresas que están en Nexus a
 * `ContactoDeHubspot` y `TicketDeHubspot` (etapa 6a de docs/mi-dia-plan.md). El ÚNICO escritor de esas dos tablas.
 *
 * Solo LEE HubSpot. Lo corre el job `contactos-y-tickets` cada hora de 6:00 a 20:00 (Costa Rica) y, la primera vez,
 * `scripts/sync-contactos-y-tickets.ts`. Reglas, las de la copia de los negocios (lib/ventas/sync-negocios-abiertos.ts):
 *   · un candado en la base: una corrida a la vez entre el servidor y las dos PCs;
 *   · nunca se borra una fila: lo que la empresa deja de tener asociado queda `vigente = false`;
 *   · solo se da de baja en un cliente que se leyó entero (`planDeCopia`): un 429 no vacía la lista de nadie;
 *   · sin permiso (403), esa mitad no se toca y la corrida lo dice.
 *
 * Entran las empresas de Nexus de tipo CLIENTE o PROSPECTO con su empresa de HubSpot. Los aliados y Smarteam no: la
 * empresa de un aliado (HubSpot) tiene miles de contactos que no son de ningún cliente.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { leerDuenos } from "@/lib/hubspot/duenos";
import {
  asociacionesDeEmpresas,
  etapasDeTickets,
  leerContactos,
  leerTickets,
  type Asociaciones,
} from "@/lib/hubspot/contactos-y-tickets";
import { huellaDe, planDeCopia, ticketAbierto, type PlanDeCopia } from "./reglas";

const LOCK_KEY = "contactos-y-tickets-lock";
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

export interface ResultadoDeLaMitad {
  sinPermiso: boolean;
  leidos: number;
  creados: number;
  actualizados: number;
  bajas: number;
  sinCambio: number;
  /** Empresas que no se pudieron leer (no se les dio de baja nada). */
  ilegibles: number;
  /** Empresas con más de 500 asociaciones: se copiaron las primeras. */
  truncadas: number;
}

export interface ResultadoDeLaCopia {
  locked?: boolean;
  empresas: number;
  contactos: ResultadoDeLaMitad;
  tickets: ResultadoDeLaMitad;
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

const mitadVacia = (): ResultadoDeLaMitad => ({ sinPermiso: false, leidos: 0, creados: 0, actualizados: 0, bajas: 0, sinCambio: 0, ilegibles: 0, truncadas: 0 });

/** Los clientes que se leyeron enteros: todas sus empresas se leyeron y ningún registro faltó. */
function clientesLeidos(clientesPorEmpresa: ReadonlyMap<string, string[]>, a: Asociaciones, faltoAlgo: boolean): Set<string> {
  if (faltoAlgo) return new Set();
  const malos = new Set<string>();
  for (const [empresa, clientes] of clientesPorEmpresa) {
    if (a.ilegibles.has(empresa) || a.truncadas.has(empresa) || !a.porEmpresa.has(empresa)) for (const c of clientes) malos.add(c);
  }
  const out = new Set<string>();
  for (const clientes of clientesPorEmpresa.values()) for (const c of clientes) if (!malos.has(c)) out.add(c);
  return out;
}

/**
 * Copia contactos y tickets. Con `escribir: false` es un simulacro: lee todo, calcula el plan y no escribe nada (ni
 * toma el candado).
 */
export async function copiarContactosYTickets(opciones: { escribir?: boolean } = {}): Promise<ResultadoDeLaCopia & { planes?: { contactos: PlanDeCopia; tickets: PlanDeCopia } }> {
  const escribir = opciones.escribir ?? true;
  const ahora = new Date();
  if (escribir && !(await tomarLock(ahora))) return { locked: true, empresas: 0, contactos: mitadVacia(), tickets: mitadVacia(), errores: [] };
  const errores: string[] = [];
  try {
    const clientes = await prisma.client.findMany({
      where: { hubspotCompanyId: { not: null }, kind: { in: ["CLIENTE", "PROSPECTO"] } },
      select: { id: true, hubspotCompanyId: true },
    });
    const clientesPorEmpresa = new Map<string, string[]>();
    for (const c of clientes) {
      const k = String(c.hubspotCompanyId);
      clientesPorEmpresa.set(k, [...(clientesPorEmpresa.get(k) ?? []), c.id]);
    }
    const empresas = [...clientesPorEmpresa.keys()];
    let hs = await getSystemHubspotClient();
    const duenos = await leerDuenos(hs).catch(() => null);
    const correoDelDueno = (ownerId: string | null) => (ownerId ? (duenos?.porOwner.get(ownerId)?.email ?? null) : null);

    // ── Contactos ────────────────────────────────────────────────────────────
    const contactos = mitadVacia();
    let planContactos: PlanDeCopia | undefined;
    const aC = await asociacionesDeEmpresas(hs, empresas, "contacts");
    if (aC.sinPermiso) contactos.sinPermiso = true;
    else {
      const ids = [...new Set([...aC.porEmpresa.values()].flat())];
      const leidos = await leerContactos(hs, ids);
      hs = await getSystemHubspotClient();
      if (leidos.sinPermiso) contactos.sinPermiso = true;
      else {
        const porId = new Map(leidos.contactos.map((c) => [c.id, c]));
        const faltoAlgo = leidos.fallo || ids.some((id) => !porId.has(id));
        const filas = [...aC.porEmpresa.entries()].flatMap(([empresa, hsIds]) =>
          (clientesPorEmpresa.get(empresa) ?? []).flatMap((clientId) =>
            hsIds.flatMap((id) => {
              const c = porId.get(id);
              if (!c) return [];
              const datos = {
                nombre: c.nombre,
                email: c.email,
                cargo: c.cargo,
                duenoEmail: correoDelDueno(c.ownerId),
                ultimoContactoAt: c.ultimoContacto,
                ultimaActividadAt: c.ultimaActividad,
                creadoEnHubspot: c.creado,
              };
              return [{ clientId, hubspotId: id, huella: huellaDe(datos), datos }];
            }),
          ),
        );
        const existentes = await prisma.contactoDeHubspot.findMany({
          select: { clientId: true, hubspotId: true, vigente: true, nombre: true, email: true, cargo: true, duenoEmail: true, ultimoContactoAt: true, ultimaActividadAt: true, creadoEnHubspot: true },
        });
        planContactos = planDeCopia(
          existentes.map(({ clientId, hubspotId, vigente, ...datos }) => ({ clientId, hubspotId, vigente, huella: huellaDe(datos) })),
          filas,
          clientesLeidos(clientesPorEmpresa, aC, faltoAlgo),
        );
        const datosDe = new Map(filas.map((f) => [`${f.clientId}:${f.hubspotId}`, f.datos]));
        Object.assign(contactos, {
          leidos: leidos.contactos.length,
          creados: planContactos.crear.length,
          actualizados: planContactos.actualizar.length,
          bajas: planContactos.bajas.length,
          sinCambio: planContactos.sinCambio,
          ilegibles: aC.ilegibles.size,
          truncadas: aC.truncadas.size,
        });
        if (escribir) {
          const nuevos = planContactos.crear.map((f) => ({ clientId: f.clientId, hubspotId: f.hubspotId, ...datosDe.get(`${f.clientId}:${f.hubspotId}`)!, copiadoAt: ahora }));
          for (let i = 0; i < nuevos.length; i += 500) await prisma.contactoDeHubspot.createMany({ data: nuevos.slice(i, i + 500), skipDuplicates: true });
          for (const f of planContactos.actualizar) {
            await prisma.contactoDeHubspot.update({
              where: { clientId_hubspotId: { clientId: f.clientId, hubspotId: f.hubspotId } },
              data: { ...datosDe.get(`${f.clientId}:${f.hubspotId}`)!, vigente: true, copiadoAt: ahora },
            });
          }
          for (const b of planContactos.bajas) {
            await prisma.contactoDeHubspot.updateMany({ where: { clientId: b.clientId, hubspotId: b.hubspotId }, data: { vigente: false, copiadoAt: ahora } });
          }
        }
      }
    }

    // ── Tickets ──────────────────────────────────────────────────────────────
    const tickets = mitadVacia();
    let planTickets: PlanDeCopia | undefined;
    const aT = await asociacionesDeEmpresas(hs, empresas, "tickets");
    if (aT.sinPermiso) tickets.sinPermiso = true;
    else {
      const ids = [...new Set([...aT.porEmpresa.values()].flat())];
      const [leidos, etapas] = await Promise.all([leerTickets(hs, ids), etapasDeTickets(hs)]);
      if (leidos.sinPermiso) tickets.sinPermiso = true;
      else {
        const porId = new Map(leidos.tickets.map((t) => [t.id, t]));
        const faltoAlgo = leidos.fallo || ids.some((id) => !porId.has(id));
        const filas = [...aT.porEmpresa.entries()].flatMap(([empresa, hsIds]) =>
          (clientesPorEmpresa.get(empresa) ?? []).flatMap((clientId) =>
            hsIds.flatMap((id) => {
              const t = porId.get(id);
              if (!t) return [];
              const etapa = t.etapaId ? etapas.get(t.etapaId) : undefined;
              const datos = {
                asunto: t.asunto,
                pipeline: etapa?.pipeline ?? t.pipeline,
                etapa: etapa?.nombre ?? t.etapaId,
                abierto: ticketAbierto(t.cerrado, etapa ? etapa.cerrada : null),
                prioridad: t.prioridad,
                duenoEmail: correoDelDueno(t.ownerId),
                creadoEnHubspot: t.creado,
                cerradoEnHubspot: t.cerrado,
                modificadoEnHubspot: t.modificado,
              };
              return [{ clientId, hubspotId: id, huella: huellaDe(datos), datos }];
            }),
          ),
        );
        const existentes = await prisma.ticketDeHubspot.findMany({
          select: {
            clientId: true, hubspotId: true, vigente: true, asunto: true, pipeline: true, etapa: true, abierto: true, prioridad: true,
            duenoEmail: true, creadoEnHubspot: true, cerradoEnHubspot: true, modificadoEnHubspot: true,
          },
        });
        planTickets = planDeCopia(
          existentes.map(({ clientId, hubspotId, vigente, ...datos }) => ({ clientId, hubspotId, vigente, huella: huellaDe(datos) })),
          filas,
          clientesLeidos(clientesPorEmpresa, aT, faltoAlgo),
        );
        const datosDe = new Map(filas.map((f) => [`${f.clientId}:${f.hubspotId}`, f.datos]));
        Object.assign(tickets, {
          leidos: leidos.tickets.length,
          creados: planTickets.crear.length,
          actualizados: planTickets.actualizar.length,
          bajas: planTickets.bajas.length,
          sinCambio: planTickets.sinCambio,
          ilegibles: aT.ilegibles.size,
          truncadas: aT.truncadas.size,
        });
        if (escribir) {
          const nuevos = planTickets.crear.map((f) => ({ clientId: f.clientId, hubspotId: f.hubspotId, ...datosDe.get(`${f.clientId}:${f.hubspotId}`)!, copiadoAt: ahora }));
          for (let i = 0; i < nuevos.length; i += 500) await prisma.ticketDeHubspot.createMany({ data: nuevos.slice(i, i + 500), skipDuplicates: true });
          for (const f of planTickets.actualizar) {
            await prisma.ticketDeHubspot.update({
              where: { clientId_hubspotId: { clientId: f.clientId, hubspotId: f.hubspotId } },
              data: { ...datosDe.get(`${f.clientId}:${f.hubspotId}`)!, vigente: true, copiadoAt: ahora },
            });
          }
          for (const b of planTickets.bajas) {
            await prisma.ticketDeHubspot.updateMany({ where: { clientId: b.clientId, hubspotId: b.hubspotId }, data: { vigente: false, copiadoAt: ahora } });
          }
        }
      }
    }

    return {
      empresas: empresas.length,
      contactos,
      tickets,
      errores,
      ...(planContactos && planTickets ? { planes: { contactos: planContactos, tickets: planTickets } } : {}),
    };
  } catch (e) {
    errores.push(e instanceof Error ? e.message : String(e));
    throw e;
  } finally {
    if (escribir) await soltarLock();
  }
}
