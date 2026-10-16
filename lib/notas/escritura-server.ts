/**
 * lib/notas/escritura-server.ts — anotar en la cuenta y escribir la nota en HubSpot (etapa 5 de docs/mi-dia-plan.md).
 * SERVER-ONLY. Es el ÚNICO escritor de `NotaDeLaCuenta`.
 *
 * El orden es Nexus primero, HubSpot después (como el siguiente paso): la nota no se pierde si HubSpot no responde. Queda
 * «pendiente» y el job `contactos-y-tickets` la reintenta cada hora, hasta 5 veces. En HubSpot va como nota de la
 * empresa (y del negocio o el proyecto, si se eligió), a nombre de quien la escribió.
 *
 * Quién puede: anotar, cualquiera con acceso al cliente (lo pide la ruta). Sacar una nota de Nexus, quien la escribió o
 * quien lidera Customer Success o dirección. Sacarla de Nexus NO la borra en HubSpot: allá queda en el registro.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { ownerIdPorCorreo } from "@/lib/hubspot/owner-por-correo";
import { OBJETO_PROYECTOS } from "@/lib/hubspot/asociaciones-proyecto";
import type { NuevaNota } from "./schema";
import {
  MAX_INTENTOS_EN_HUBSPOT,
  cuerpoParaHubspot,
  diaDeCostaRica,
  horaEnHubspot,
  type CanalDeLaNota,
} from "./reglas";

export class ErrorDeLaNota extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface QuienAnota {
  email: string;
  /** El rol de Nexus (TeamMember.roleEnum): sacar una nota ajena lo puede la CSL o dirección. */
  rol: string | null;
}

/** HUBSPOT_DEFINED: nota → empresa (la misma que usa la nota de la ficha). */
const NOTA_A_EMPRESA = 190;

const esUnicoDuplicado = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** El día de hoy en Costa Rica, y si una fecha es de más adelante (una nota cuenta lo que ya pasó). */
function noEsDelFuturo(diaISO: string, ahora = new Date()): boolean {
  return diaISO <= diaDeCostaRica(ahora);
}

/** Una nota escrita a mano en La cuenta › Notas. Devuelve la fila, ya con lo que dijo HubSpot. */
export async function crearNota(clientId: string, quien: QuienAnota, n: NuevaNota) {
  const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, hubspotCompanyId: true } });
  if (!cliente) throw new ErrorDeLaNota(404, "Ese cliente no existe.");
  if (!noEsDelFuturo(n.fecha)) throw new ErrorDeLaNota(400, "La fecha es de lo que ya pasó: no puede ser de más adelante.");

  let projectId: string | null = null;
  if (n.projectId) {
    const p = await prisma.project.findUnique({ where: { id: n.projectId }, select: { clientId: true } });
    if (!p || p.clientId !== clientId) throw new ErrorDeLaNota(400, "Ese proyecto no es de este cliente.");
    projectId = n.projectId;
  }
  let hubspotDealId: string | null = null;
  if (n.negocioId) {
    const neg = await prisma.negocioAbierto.findUnique({ where: { id: n.negocioId }, select: { clientId: true, hubspotDealId: true } });
    if (!neg || neg.clientId !== clientId) throw new ErrorDeLaNota(400, "Ese negocio no es de este cliente.");
    hubspotDealId = neg.hubspotDealId;
  }

  const fila = await prisma.notaDeLaCuenta.create({
    data: {
      clientId,
      projectId,
      hubspotDealId,
      canal: n.canal,
      fecha: new Date(`${n.fecha}T00:00:00.000Z`),
      texto: n.texto.trim(),
      autorEmail: quien.email.toLowerCase(),
      origen: "persona",
      hubspotEstado: cliente.hubspotCompanyId ? "pendiente" : "sin_hubspot",
    },
  });
  return fila.hubspotEstado === "pendiente" ? escribirNotaEnHubspot(fila.id) : fila;
}

const PUEDEN_SACAR_AJENAS = new Set(["CSL", "SUPER_ADMIN"]);

/** Saca una nota de Nexus (y de la memoria de la cuenta). En HubSpot queda: se borra allá si hace falta. */
export async function archivarNota(clientId: string, quien: QuienAnota, id: string) {
  const nota = await prisma.notaDeLaCuenta.findUnique({ where: { id }, select: { clientId: true, autorEmail: true, estado: true } });
  if (!nota || nota.clientId !== clientId) throw new ErrorDeLaNota(404, "Esa nota no existe.");
  if (nota.estado !== "vigente") throw new ErrorDeLaNota(409, "Esa nota ya no está en Nexus. Recarga para ver la lista.");
  const yo = quien.email.toLowerCase();
  if (nota.autorEmail !== yo && !PUEDEN_SACAR_AJENAS.has(quien.rol ?? "")) {
    throw new ErrorDeLaNota(403, "Solo quien la escribió, quien lidera Customer Success o dirección puede sacarla.");
  }
  const r = await prisma.notaDeLaCuenta.updateMany({
    where: { id, estado: "vigente" },
    data: { estado: "archivada", archivadaPor: yo, archivadaAt: new Date() },
  });
  if (r.count === 0) throw new ErrorDeLaNota(409, "Esa nota ya no está en Nexus. Recarga para ver la lista.");
}

/* ── La nota sugerida después de una reunión ─────────────────────────────────────────── */

export interface ReunionDeLaSugerencia {
  sessionId: string;
  clientId: string;
  /** ISO de la reunión. */
  fecha: string;
  /** El proyecto, si la reunión es de uno solo (del cliente: lo verifica la ruta). */
  projectId: string | null;
}

/** Usar la nota sugerida (con el texto que dejó la persona): se guarda y va a HubSpot. */
export async function usarNotaSugerida(r: ReunionDeLaSugerencia, quien: QuienAnota, texto: string) {
  const cliente = await prisma.client.findUnique({ where: { id: r.clientId }, select: { hubspotCompanyId: true } });
  if (!cliente) throw new ErrorDeLaNota(404, "Ese cliente no existe.");
  let fila;
  try {
    fila = await prisma.notaDeLaCuenta.create({
      data: {
        clientId: r.clientId,
        projectId: r.projectId,
        canal: "reunion" satisfies CanalDeLaNota,
        fecha: new Date(`${diaDeCostaRica(new Date(r.fecha))}T00:00:00.000Z`),
        texto: texto.trim(),
        autorEmail: quien.email.toLowerCase(),
        origen: "reunion",
        sessionId: r.sessionId,
        hubspotEstado: cliente.hubspotCompanyId ? "pendiente" : "sin_hubspot",
      },
    });
  } catch (e) {
    if (esUnicoDuplicado(e)) throw new ErrorDeLaNota(409, "La nota de esta reunión ya se decidió. Recarga para verla.");
    throw e;
  }
  return fila.hubspotEstado === "pendiente" ? escribirNotaEnHubspot(fila.id) : fila;
}

/** Descartar la nota sugerida: queda registrado (con lo que se proponía) y no se vuelve a sugerir. No va a HubSpot. */
export async function descartarNotaSugerida(r: ReunionDeLaSugerencia, quien: QuienAnota, textoSugerido: string) {
  try {
    return await prisma.notaDeLaCuenta.create({
      data: {
        clientId: r.clientId,
        projectId: r.projectId,
        canal: "reunion",
        fecha: new Date(`${diaDeCostaRica(new Date(r.fecha))}T00:00:00.000Z`),
        texto: textoSugerido.trim() || "(sin texto)",
        autorEmail: quien.email.toLowerCase(),
        origen: "reunion",
        sessionId: r.sessionId,
        estado: "descartada",
        hubspotEstado: "no_va",
      },
    });
  } catch (e) {
    if (esUnicoDuplicado(e)) throw new ErrorDeLaNota(409, "La nota de esta reunión ya se decidió. Recarga para verla.");
    throw e;
  }
}

/* ── HubSpot ─────────────────────────────────────────────────────────────────────────── */

/** Asocia la nota a un objeto con la asociación por defecto (v4): sin adivinar el tipo de asociación. */
async function asociar(hs: Awaited<ReturnType<typeof getSystemHubspotClient>>, notaId: string, objeto: string, id: string): Promise<string | null> {
  try {
    const res = await hs.apiRequest({
      method: "PUT",
      path: `/crm/v4/objects/notes/${encodeURIComponent(notaId)}/associations/default/${objeto}/${encodeURIComponent(id)}`,
    });
    return res.ok ? null : `HubSpot ${res.status}`;
  } catch (e) {
    return e instanceof Error ? e.message.slice(0, 120) : "sin respuesta";
  }
}

/**
 * Escribe la nota en HubSpot. Nunca lanza: si HubSpot no responde, queda en «error» y el job la reintenta. Una nota que
 * ya está allá no se vuelve a escribir (si faltó asociarla a un negocio o un proyecto, se dice en `hubspotError`).
 */
export async function escribirNotaEnHubspot(id: string) {
  const n = await prisma.notaDeLaCuenta.findUnique({
    where: { id },
    include: {
      client: { select: { hubspotCompanyId: true } },
      project: { select: { name: true, hubspotServiceId: true } },
      session: { select: { title: true } },
    },
  });
  if (!n) throw new ErrorDeLaNota(404, "Esa nota no existe.");
  if (n.estado !== "vigente" || n.hubspotNotaId || ["escrita", "sin_hubspot", "no_va"].includes(n.hubspotEstado)) return n;
  if (!n.client.hubspotCompanyId) return prisma.notaDeLaCuenta.update({ where: { id }, data: { hubspotEstado: "sin_hubspot" } });

  const autor = await prisma.teamMember.findUnique({ where: { email: n.autorEmail }, select: { name: true } });
  const ownerId = await ownerIdPorCorreo(n.autorEmail);
  const fecha = n.fecha.toISOString().slice(0, 10);

  let error: string | null = null;
  let notaId: string | null = null;
  const faltan: string[] = [];
  try {
    const hs = await getSystemHubspotClient();
    const res = await hs.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/notes",
      body: {
        properties: {
          hs_timestamp: horaEnHubspot(fecha),
          hs_note_body: cuerpoParaHubspot({
            canal: n.canal as CanalDeLaNota,
            fecha,
            texto: n.texto,
            autor: autor?.name ?? n.autorEmail,
            proyecto: n.project?.name ?? null,
            reunion: n.session?.title ?? null,
          }),
          ...(ownerId ? { hubspot_owner_id: ownerId } : {}),
        },
        associations: [
          { to: { id: n.client.hubspotCompanyId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: NOTA_A_EMPRESA }] },
        ],
      },
    });
    if (!res.ok) {
      error = `HubSpot ${res.status}: ${(await res.text()).slice(0, 300)}`;
    } else {
      notaId = String(((await res.json()) as { id?: string | number }).id ?? "") || null;
      if (!notaId) error = "HubSpot no devolvió el id de la nota.";
      else {
        if (n.hubspotDealId) {
          const e = await asociar(hs, notaId, "deals", n.hubspotDealId);
          if (e) faltan.push(`el negocio (${e})`);
        }
        if (n.project?.hubspotServiceId) {
          const e = await asociar(hs, notaId, OBJETO_PROYECTOS, n.project.hubspotServiceId);
          if (e) faltan.push(`el proyecto (${e})`);
        }
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
  }

  if (notaId) {
    return prisma.notaDeLaCuenta.update({
      where: { id },
      data: {
        hubspotEstado: "escrita",
        hubspotNotaId: notaId,
        hubspotEscritaAt: new Date(),
        hubspotError: faltan.length ? `Quedó en la empresa, sin asociar a ${faltan.join(" ni a ")}.` : null,
      },
    });
  }
  return prisma.notaDeLaCuenta.update({ where: { id }, data: { hubspotEstado: "error", hubspotError: error, hubspotIntentos: { increment: 1 } } });
}

/** Lo que quedó sin escribir en HubSpot (pendiente o con error), hasta 5 intentos. Lo corre el job `contactos-y-tickets`. */
export async function reintentarNotas(limite = 25): Promise<{ intentadas: number; escritas: number; conError: number }> {
  const filas = await prisma.notaDeLaCuenta.findMany({
    where: {
      estado: "vigente",
      hubspotEstado: { in: ["pendiente", "error"] },
      hubspotIntentos: { lt: MAX_INTENTOS_EN_HUBSPOT },
      // Lo que se está escribiendo en este momento no se pisa.
      updatedAt: { lt: new Date(Date.now() - 60_000) },
    },
    orderBy: { updatedAt: "asc" },
    take: limite,
    select: { id: true },
  });
  let escritas = 0;
  let conError = 0;
  for (const f of filas) {
    const r = await escribirNotaEnHubspot(f.id);
    if (r.hubspotEstado === "escrita") escritas++;
    else if (r.hubspotEstado === "error") conError++;
  }
  return { intentadas: filas.length, escritas, conError };
}
