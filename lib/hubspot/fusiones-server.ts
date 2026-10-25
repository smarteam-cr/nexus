/**
 * lib/hubspot/fusiones-server.ts — la búsqueda diaria de las FUSIONES de HubSpot (U9, 2026-10-25). SERVER-ONLY.
 *
 * Lo corre el job `hubspot-fusiones` una vez al día (y el simulacro de scripts/fusiones-de-hubspot.ts). Hace dos cosas:
 *   1. guarda los pares absorbido → sobreviviente en `FusionDeHubspot` (el único escritor junto con el aviso de fusión de
 *      lib/hubspot/eventos-server.ts, que usa `guardarPares`);
 *   2. arma el INFORME de lo que en Nexus todavía apunta a un id absorbido: la ficha de la empresa (`Client` y sus
 *      business cases), los proyectos (0-970) y el negocio de un proyecto, los contactos y los tickets copiados.
 *
 * NO reapunta nada: eso es una decisión con consecuencias (proyectos, cobranza, cartera) y va con simulacro, a mano:
 * `scripts/reapuntar-empresa-fusionada.ts` (la ficha y sus BC) y `scripts/proyectos-fusionados-en-hubspot.ts` (los
 * proyectos). Los contactos y los tickets se arreglan solos: la copia de cada hora sigue las asociaciones, que se mudaron
 * al sobreviviente, y deja la fila vieja `vigente = false`. INV54 se pone en rojo mientras una ficha apunte a una
 * empresa absorbida.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { getSystemHubspotClient } from "./client";
import { buscarFusiones, OBJETOS_FUSIONABLES, sobrevivienteFinal, type ObjetoFusionable, type ParDeFusion } from "./fusiones";

/** La fila de `CronJobState` donde queda el último informe (la del job la pisa el semáforo con `{ok, at}`). */
export const FILA_DEL_INFORME = "hubspot-fusiones-informe";

export interface FichaConIdViejo {
  clientId: string;
  nombre: string;
  idViejo: string;
  idNuevo: string;
  /** Otra ficha ya tiene la empresa sobreviviente: son la misma empresa y hay que fusionarlas (merge-duplicate-clients). */
  sobrevivienteEnOtraFicha: string | null;
}

export interface InformeDeFusiones {
  at: string;
  /** Los pares que se vieron, por tipo de objeto (null = esa búsqueda no se pudo leer o no tiene permiso). */
  pares: Record<ObjetoFusionable, number | null>;
  fichas: FichaConIdViejo[];
  /** Business cases con el id viejo de la empresa. */
  businessCases: number;
  /** Los proyectos ACTIVOS con el id viejo (los inactivos ya se dieron de baja). */
  proyectos: { projectId: string; nombre: string; idViejo: string; idNuevo: string }[];
  negociosDeProyectos: { projectId: string; nombre: string; idViejo: string; idNuevo: string }[];
  contactosVigentes: number;
  ticketsVigentes: number;
  sinTabla?: boolean;
}

/** Guarda (o refresca) los pares. Lo llaman la búsqueda diaria y el aviso de fusión. */
export async function guardarPares(pares: readonly ParDeFusion[], ahora: Date): Promise<number> {
  let n = 0;
  for (const p of pares) {
    await prisma.fusionDeHubspot.upsert({
      where: { objeto_idAbsorbido: { objeto: p.objeto, idAbsorbido: p.idAbsorbido } },
      update: { idSobreviviente: p.idSobreviviente, vistaAt: ahora },
      create: { objeto: p.objeto, idAbsorbido: p.idAbsorbido, idSobreviviente: p.idSobreviviente, vistaAt: ahora },
    });
    n++;
  }
  return n;
}

/**
 * La búsqueda y el informe. Con `escribir: false` es un simulacro: busca en HubSpot y arma el informe con lo que trajo,
 * sin tocar la base.
 */
export async function revisarFusiones(o: { escribir?: boolean; ahora?: Date } = {}): Promise<InformeDeFusiones> {
  const escribir = o.escribir ?? true;
  const ahora = o.ahora ?? new Date();
  const hs = await getSystemHubspotClient();
  const pares: Record<ObjetoFusionable, number | null> = { empresa: null, contacto: null, negocio: null, proyecto: null, ticket: null };
  const todos: ParDeFusion[] = [];
  let sinTabla = false;
  for (const objeto of OBJETOS_FUSIONABLES) {
    const b = await buscarFusiones(hs, objeto);
    if (b.sinPermiso || !b.completa) {
      // Lo que se trajo igual sirve (son pares ciertos); lo que no, no se da por inexistente.
      if (!b.sinPermiso) todos.push(...b.pares);
      continue;
    }
    pares[objeto] = b.pares.length;
    todos.push(...b.pares);
  }
  if (escribir) {
    try {
      await guardarPares(todos, ahora);
    } catch (e) {
      if (!esquemaDesactualizado(e)) throw e;
      sinTabla = true;
    }
  }

  // Lo que se sabe: lo de hoy y, si la tabla existe, lo de antes (una búsqueda incompleta no borra lo conocido).
  const conocidos = new Map<string, Map<string, string>>();
  const sumar = (objeto: string, viejo: string, nuevo: string) => {
    const m = conocidos.get(objeto) ?? new Map<string, string>();
    m.set(viejo, nuevo);
    conocidos.set(objeto, m);
  };
  const guardados = await prisma.fusionDeHubspot.findMany({ select: { objeto: true, idAbsorbido: true, idSobreviviente: true } }).catch((e: unknown) => {
    if (esquemaDesactualizado(e)) {
      sinTabla = true;
      return [];
    }
    throw e;
  });
  for (const g of guardados) sumar(g.objeto, g.idAbsorbido, g.idSobreviviente);
  for (const p of todos) sumar(p.objeto, p.idAbsorbido, p.idSobreviviente);
  const de = (objeto: ObjetoFusionable) => conocidos.get(objeto) ?? new Map<string, string>();
  const nuevo = (objeto: ObjetoFusionable, viejo: string) => sobrevivienteFinal(viejo, de(objeto));

  const empresas = [...de("empresa").keys()];
  const fichasViejas = empresas.length
    ? await prisma.client.findMany({ where: { hubspotCompanyId: { in: empresas } }, select: { id: true, name: true, hubspotCompanyId: true } })
    : [];
  const sobrevivientes = fichasViejas.map((f) => nuevo("empresa", f.hubspotCompanyId!));
  const tomadas = sobrevivientes.length
    ? new Map((await prisma.client.findMany({ where: { hubspotCompanyId: { in: sobrevivientes } }, select: { name: true, hubspotCompanyId: true } })).map((c) => [c.hubspotCompanyId!, c.name]))
    : new Map<string, string>();
  const fichas: FichaConIdViejo[] = fichasViejas.map((f) => {
    const idNuevo = nuevo("empresa", f.hubspotCompanyId!);
    return { clientId: f.id, nombre: f.name, idViejo: f.hubspotCompanyId!, idNuevo, sobrevivienteEnOtraFicha: tomadas.get(idNuevo) ?? null };
  });
  const businessCases = empresas.length ? await prisma.businessCase.count({ where: { hubspotCompanyId: { in: empresas } } }) : 0;

  const idsDeProyectos = [...de("proyecto").keys()];
  const proyectos = idsDeProyectos.length
    ? (await prisma.project.findMany({ where: { status: "active", hubspotServiceId: { in: idsDeProyectos } }, select: { id: true, name: true, hubspotServiceId: true } })).map((p) => ({
        projectId: p.id,
        nombre: p.name,
        idViejo: p.hubspotServiceId!,
        idNuevo: nuevo("proyecto", p.hubspotServiceId!),
      }))
    : [];
  const idsDeNegocios = [...de("negocio").keys()];
  const negociosDeProyectos = idsDeNegocios.length
    ? (await prisma.project.findMany({ where: { status: "active", hubspotDealId: { in: idsDeNegocios } }, select: { id: true, name: true, hubspotDealId: true } })).map((p) => ({
        projectId: p.id,
        nombre: p.name,
        idViejo: p.hubspotDealId!,
        idNuevo: nuevo("negocio", p.hubspotDealId!),
      }))
    : [];
  const idsDeContactos = [...de("contacto").keys()];
  const contactosVigentes = idsDeContactos.length ? await prisma.contactoDeHubspot.count({ where: { vigente: true, hubspotId: { in: idsDeContactos } } }) : 0;
  const idsDeTickets = [...de("ticket").keys()];
  const ticketsVigentes = idsDeTickets.length ? await prisma.ticketDeHubspot.count({ where: { vigente: true, hubspotId: { in: idsDeTickets } } }) : 0;

  const informe: InformeDeFusiones = {
    at: ahora.toISOString(),
    pares,
    fichas,
    businessCases,
    proyectos,
    negociosDeProyectos,
    contactosVigentes,
    ticketsVigentes,
    ...(sinTabla ? { sinTabla: true } : {}),
  };
  if (escribir) {
    const guardable = JSON.parse(JSON.stringify(informe));
    await prisma.cronJobState.upsert({ where: { id: FILA_DEL_INFORME }, update: { lastResult: guardable }, create: { id: FILA_DEL_INFORME, lastResult: guardable } });
  }
  return informe;
}
