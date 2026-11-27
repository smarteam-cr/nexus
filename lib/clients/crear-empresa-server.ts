/**
 * lib/clients/crear-empresa-server.ts — escribir la empresa arriba de sus unidades, y deshacerla (2026-11-26).
 *
 * Lo usa scripts/crear-empresa-de-unidades.ts (`--apply` y `--deshacer --apply`), que antes decide en simulacro. Aparte del
 * script para poder probarlo contra la base de pruebas (crear-empresa.int.test.ts). El plan puro: lib/clients/crear-empresa.ts.
 * DECISIONS «La empresa arriba de sus unidades».
 */
import { prisma } from "@/lib/db/prisma";
import { devolverComunicaciones } from "@/lib/comunicaciones/de-la-empresa-server";
import type { PlanDeLaEmpresa } from "./crear-empresa";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Escribe el plan en UNA transacción. Devuelve el id de la empresa. */
export async function aplicarLaEmpresa(plan: PlanDeLaEmpresa): Promise<string> {
  return prisma.$transaction(async (tx) => {
    /* Primero se suelta la empresa de HubSpot de la vieja principal: una empresa es de una sola ficha (índice único). */
    for (const c of plan.cambios) if (c.data.hubspotCompanyId === null) await tx.client.update({ where: { id: c.id }, data: { hubspotCompanyId: null } });
    const empresa = await tx.client.create({ data: plan.crear, select: { id: true } });
    for (const c of plan.cambios) {
      /* Solo lo que el plan cambia: los dominios, el `company` que era un dominio, la empresa de HubSpot y la llave. */
      await tx.client.update({
        where: { id: c.id },
        data: {
          comparteDominioConId: empresa.id,
          ...(c.data.emailDomains !== undefined ? { emailDomains: c.data.emailDomains } : {}),
          ...(c.data.company !== undefined ? { company: c.data.company } : {}),
          ...(c.data.hubspotCompanyId !== undefined ? { hubspotCompanyId: c.data.hubspotCompanyId } : {}),
        },
      });
    }
    return empresa.id;
  });
}

/** Lo que vuelve al deshacer. */
export interface LoQueVuelve {
  proyectos: number;
  contactos: number;
  tickets: number;
  comunicaciones: number;
  leads: number;
  negocios: number;
  ventas: number;
}

/**
 * Una tabla con único (ficha, id de HubSpot): de cada id queda UNA fila en la principal (la vigente, si hay) y las demás se
 * borran (revisión del 26 nov: un contacto que esperó en la empresa y después se confirmó en AE tiene dos filas, y mandar
 * las dos a TAE chocaba con el único y cancelaba todo).
 */
async function juntarEnLaPrincipal(tx: Tx, tabla: "contactoDeHubspot" | "ticketDeHubspot", de: readonly string[], principal: string): Promise<number> {
  const d = tx[tabla] as unknown as {
    findMany(a: unknown): Promise<{ id: string; clientId: string; hubspotId: string; vigente: boolean }[]>;
    deleteMany(a: unknown): Promise<unknown>;
    updateMany(a: unknown): Promise<unknown>;
  };
  const filas = await d.findMany({ where: { clientId: { in: [principal, ...de] } }, select: { id: true, clientId: true, hubspotId: true, vigente: true } });
  const porId = new Map<string, typeof filas>();
  for (const f of filas) porId.set(f.hubspotId, [...(porId.get(f.hubspotId) ?? []), f]);
  const borrar: string[] = [];
  const mover: string[] = [];
  for (const grupo of porId.values()) {
    const queda = grupo.find((f) => f.vigente) ?? grupo.find((f) => f.clientId === principal) ?? grupo[0]!;
    for (const f of grupo) if (f !== queda) borrar.push(f.id);
    if (queda.clientId !== principal) mover.push(queda.id);
  }
  if (borrar.length) await d.deleteMany({ where: { id: { in: borrar } } });
  if (mover.length) await d.updateMany({ where: { id: { in: mover } }, data: { clientId: principal } });
  return mover.length;
}

/**
 * Deshacer una empresa: lo que tiene la empresa y lo que se repartió a sus unidades sin empresa de HubSpot propia vuelve a
 * la vieja principal, con sus dominios y su empresa de HubSpot; las unidades vuelven a colgar como estaban. La ficha de la
 * empresa se borra al final, vacía: nada se borra con ella. Sin vieja principal (Grupo Teamnet), las unidades vuelven a no
 * colgar de nadie y lo de la empresa se queda sin mover (una empresa así no tiene empresa de HubSpot).
 */
export async function deshacerLaEmpresa(o: { empresaId: string; principal: string | null; unidades: readonly string[] }): Promise<LoQueVuelve> {
  return prisma.$transaction(async (tx) => {
    const empresa = await tx.client.findUniqueOrThrow({ where: { id: o.empresaId }, select: { kind: true, emailDomains: true, company: true, hubspotCompanyId: true } });
    if (empresa.kind !== "EMPRESA") throw new Error("Esa ficha no es una empresa.");
    const vuelve: LoQueVuelve = { proyectos: 0, contactos: 0, tickets: 0, comunicaciones: 0, leads: 0, negocios: 0, ventas: 0 };
    if (o.principal) {
      const p = await tx.client.findUniqueOrThrow({ where: { id: o.principal }, select: { emailDomains: true, company: true, hubspotCompanyId: true } });
      const sinEmpresaPropia = (await tx.client.findMany({ where: { id: { in: o.unidades.filter((u) => u !== o.principal) }, hubspotCompanyId: null }, select: { id: true } })).map((u) => u.id);
      const traen = [o.empresaId, ...sinEmpresaPropia];
      vuelve.contactos = await juntarEnLaPrincipal(tx, "contactoDeHubspot", traen, o.principal);
      vuelve.tickets = await juntarEnLaPrincipal(tx, "ticketDeHubspot", traen, o.principal);
      vuelve.comunicaciones = await devolverComunicaciones(tx, traen, o.principal);
      vuelve.leads = (await tx.leadDeHubspot.updateMany({ where: { clientId: { in: traen } }, data: { clientId: o.principal } })).count;
      vuelve.negocios = (await tx.negocioAbierto.updateMany({ where: { clientId: o.empresaId }, data: { clientId: o.principal } })).count;
      vuelve.ventas = (await tx.ventaGanada.updateMany({ where: { clientId: o.empresaId }, data: { clientId: o.principal } })).count;
      vuelve.proyectos = (await tx.project.updateMany({ where: { clientId: o.empresaId }, data: { clientId: o.principal } })).count;
      await tx.client.update({ where: { id: o.empresaId }, data: { hubspotCompanyId: null } });
      await tx.client.update({
        where: { id: o.principal },
        data: {
          comparteDominioConId: null,
          emailDomains: [...new Set([...p.emailDomains, ...empresa.emailDomains])],
          ...(empresa.company && !p.company ? { company: empresa.company } : {}),
          ...(empresa.hubspotCompanyId && !p.hubspotCompanyId ? { hubspotCompanyId: empresa.hubspotCompanyId } : {}),
        },
      });
      await tx.client.updateMany({ where: { id: { in: o.unidades.filter((u) => u !== o.principal) } }, data: { comparteDominioConId: o.principal } });
    } else {
      const quedan = await tx.project.count({ where: { clientId: o.empresaId } });
      if (quedan) throw new Error(`La empresa tiene ${quedan} proyecto(s) esperando unidad: pásalos a una unidad antes de deshacerla.`);
      await tx.client.updateMany({ where: { id: { in: [...o.unidades] } }, data: { comparteDominioConId: null } });
    }
    await tx.client.delete({ where: { id: o.empresaId } });
    return vuelve;
  });
}
