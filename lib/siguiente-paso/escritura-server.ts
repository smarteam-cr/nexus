/**
 * lib/siguiente-paso/escritura-server.ts — fijar un siguiente paso, darlo por hecho y escribirlo en HubSpot (2026-10-15,
 * etapa 2 de docs/mi-dia-plan.md). SERVER-ONLY. Es el ÚNICO escritor de `SiguientePaso` junto con la copia que vuelve de
 * HubSpot (copia-server.ts).
 *
 * El orden es Nexus primero, HubSpot después: la historia vive en Nexus y no se pierde si HubSpot no responde. El paso
 * queda «pendiente» de escribirse allá y el job `negocios-abiertos` lo reintenta cada hora (hasta 5 veces).
 *
 * Quién puede:
 *   · el equipo: el suyo (reglas.ts › equiposQueEscribe);
 *   · el objeto: con acceso a su cliente (`requireAccessToClient`). Un negocio sin cliente en Nexus: su dueño, o quien
 *     tiene `ventas.write`.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { ownerIdPorCorreo } from "@/lib/hubspot/owner-por-correo";
import { requireAccessToClient } from "@/lib/auth/access";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";
import type { EquipoDelSiguientePaso } from "./propiedades";
import {
  MAX_INTENTOS_EN_HUBSPOT,
  OBJETO_EN_HUBSPOT,
  equiposQueEscribe,
  valoresParaHubspot,
  type FuenteDelPaso,
  type ObjetoDelPaso,
} from "./reglas";

export class ErrorDelPaso extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Persona = Parameters<typeof can>[0] & { id: string; email: string; roleEnum: string };

export interface ObjetoResuelto {
  objeto: ObjetoDelPaso;
  objetoId: string;
  nombre: string;
  clientId: string | null;
  hubspotObjectType: string;
  hubspotObjectId: string | null;
  /** Solo un negocio: su dueño en Nexus. */
  vendedorId?: string | null;
}

export async function resolverObjeto(objeto: ObjetoDelPaso, objetoId: string): Promise<ObjetoResuelto> {
  const tipo = OBJETO_EN_HUBSPOT[objeto];
  if (objeto === "empresa") {
    const c = await prisma.client.findUnique({ where: { id: objetoId }, select: { id: true, name: true, hubspotCompanyId: true } });
    if (!c) throw new ErrorDelPaso(404, "Esa empresa no existe.");
    return { objeto, objetoId, nombre: c.name, clientId: c.id, hubspotObjectType: tipo, hubspotObjectId: c.hubspotCompanyId };
  }
  if (objeto === "negocio") {
    const n = await prisma.negocioAbierto.findUnique({
      where: { id: objetoId },
      select: { id: true, nombre: true, clientId: true, hubspotDealId: true, vendedorId: true, abierto: true },
    });
    if (!n) throw new ErrorDelPaso(404, "Ese negocio no existe.");
    return { objeto, objetoId, nombre: n.nombre, clientId: n.clientId, hubspotObjectType: tipo, hubspotObjectId: n.hubspotDealId, vendedorId: n.vendedorId };
  }
  const p = await prisma.project.findUnique({ where: { id: objetoId }, select: { id: true, name: true, clientId: true, hubspotServiceId: true } });
  if (!p) throw new ErrorDelPaso(404, "Ese proyecto no existe.");
  return { objeto, objetoId, nombre: p.name, clientId: p.clientId, hubspotObjectType: tipo, hubspotObjectId: p.hubspotServiceId };
}

/** ¿Puede esta persona ver el objeto? Se pregunta con la sesión del pedido (`requireAccessToClient`). */
export async function exigirAcceso(o: ObjetoResuelto, persona: Persona): Promise<void> {
  if (o.clientId) {
    try {
      await requireAccessToClient(o.clientId);
      return;
    } catch (e) {
      if (e instanceof ForbiddenError || e instanceof UnauthorizedError) throw new ErrorDelPaso(403, "No tienes acceso a esta cuenta.");
      throw e;
    }
  }
  if (o.objeto === "negocio" && (o.vendedorId === persona.id || (await can(persona, "ventas", "write")))) return;
  throw new ErrorDelPaso(403, "Solo su dueño o alguien con permiso de Ventas puede cambiar este negocio.");
}

/* ── Fijar y dar por hecho ───────────────────────────────────────────────────────────── */

export interface NuevoPaso {
  objeto: ObjetoDelPaso;
  objetoId: string;
  equipo: EquipoDelSiguientePaso;
  que: string;
  /** `YYYY-MM-DD`. */
  fecha: string | null;
  /** Correo de quien lo lleva. Sin él, quien lo escribe. */
  responsableEmail?: string | null;
  fuente?: Exclude<FuenteDelPaso, "hubspot">;
}

const esUnicoDuplicado = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function fijarSiguientePaso(persona: Persona, n: NuevoPaso) {
  if (!equiposQueEscribe(persona.roleEnum).includes(n.equipo)) {
    throw new ErrorDelPaso(403, "Solo puedes escribir el siguiente paso de tu equipo.");
  }
  const que = n.que.trim();
  if (!que) throw new ErrorDelPaso(400, "Escribe qué sigue.");
  const o = await resolverObjeto(n.objeto, n.objetoId);
  await exigirAcceso(o, persona);

  const responsableEmail = (n.responsableEmail ?? persona.email).trim().toLowerCase();
  const responsable = await prisma.teamMember.findUnique({ where: { email: responsableEmail }, select: { email: true, deactivatedAt: true } });
  if (!responsable || responsable.deactivatedAt) throw new ErrorDelPaso(400, "Esa persona no está en el equipo.");
  const responsableOwnerId = await ownerIdPorCorreo(responsableEmail);
  const fecha = n.fecha ? new Date(`${n.fecha}T00:00:00.000Z`) : null;
  const yo = persona.email.toLowerCase();
  const ahora = new Date();

  let creado;
  try {
    creado = await prisma.$transaction(async (tx) => {
      const vigente = await tx.siguientePaso.findFirst({ where: { objeto: o.objeto, objetoId: o.objetoId, equipo: n.equipo, estado: "vigente" } });
      if (
        vigente &&
        vigente.que === que &&
        (vigente.fecha?.getTime() ?? null) === (fecha?.getTime() ?? null) &&
        (vigente.responsableEmail ?? null) === responsableEmail
      ) {
        return { fila: vigente, nuevo: false };
      }
      if (vigente) {
        await tx.siguientePaso.update({ where: { id: vigente.id }, data: { estado: "reemplazado", cerradoAt: ahora, cerradoPor: yo } });
      }
      const fila = await tx.siguientePaso.create({
        data: {
          objeto: o.objeto,
          objetoId: o.objetoId,
          equipo: n.equipo,
          que,
          fecha,
          responsableEmail,
          responsableOwnerId,
          escritoPor: yo,
          fuente: n.fuente ?? "persona",
          clientId: o.clientId,
          hubspotObjectType: o.hubspotObjectType,
          hubspotObjectId: o.hubspotObjectId,
          hubspotEstado: o.hubspotObjectId ? "pendiente" : "sin_hubspot",
        },
      });
      return { fila, nuevo: true };
    });
  } catch (e) {
    if (esUnicoDuplicado(e)) throw new ErrorDelPaso(409, "Otra persona acaba de cambiar este siguiente paso. Recarga para ver el último.");
    throw e;
  }

  const fila = creado.nuevo ? await escribirEnHubspot(creado.fila.id) : creado.fila;
  olvidarMedicion(yo);
  if (responsableEmail !== yo) olvidarMedicion(responsableEmail);
  return fila;
}

export async function darPorHecho(persona: Persona, id: string) {
  const p = await prisma.siguientePaso.findUnique({ where: { id } });
  if (!p) throw new ErrorDelPaso(404, "Ese siguiente paso no existe.");
  if (p.estado !== "vigente") throw new ErrorDelPaso(409, "Ese siguiente paso ya no está vigente. Recarga para ver el último.");
  const yo = persona.email.toLowerCase();
  // Darlo por hecho lo puede quien lo lleva, aunque sea de otro equipo; si no, quien escribe el de ese equipo.
  if (p.responsableEmail !== yo && !equiposQueEscribe(persona.roleEnum).includes(p.equipo as EquipoDelSiguientePaso)) {
    throw new ErrorDelPaso(403, "Solo quien lo lleva o alguien de su equipo puede darlo por hecho.");
  }
  await exigirAcceso(await resolverObjeto(p.objeto as ObjetoDelPaso, p.objetoId), persona);
  const r = await prisma.siguientePaso.updateMany({
    where: { id, estado: "vigente" },
    data: { estado: "hecho", cerradoAt: new Date(), cerradoPor: yo, hubspotEstado: p.hubspotObjectId ? "pendiente" : "sin_hubspot", hubspotError: null, hubspotIntentos: 0 },
  });
  if (r.count === 0) throw new ErrorDelPaso(409, "Ese siguiente paso ya no está vigente. Recarga para ver el último.");
  const fila = await escribirEnHubspot(id);
  olvidarMedicion(yo);
  if (p.responsableEmail && p.responsableEmail !== yo) olvidarMedicion(p.responsableEmail);
  return fila;
}

/* ── HubSpot ─────────────────────────────────────────────────────────────────────────── */

/**
 * Escribe en HubSpot lo que dice el paso: sus valores si está vigente, vacío si se dio por hecho. Nunca lanza: si
 * HubSpot no responde, el paso queda en «error» y el job lo reintenta.
 */
export async function escribirEnHubspot(id: string) {
  const p = await prisma.siguientePaso.findUnique({ where: { id } });
  if (!p) throw new ErrorDelPaso(404, "Ese siguiente paso no existe.");
  if (p.estado === "reemplazado" || p.hubspotEstado === "escrito" || p.hubspotEstado === "sin_hubspot") return p;
  if (!p.hubspotObjectId) return prisma.siguientePaso.update({ where: { id }, data: { hubspotEstado: "sin_hubspot" } });

  // Un paso dado por hecho que ya tiene uno más nuevo: lo que dice HubSpot lo decide el más nuevo.
  if (p.estado === "hecho") {
    const masNuevo = await prisma.siguientePaso.count({
      where: { objeto: p.objeto, objetoId: p.objetoId, equipo: p.equipo, createdAt: { gt: p.createdAt } },
    });
    if (masNuevo > 0) return prisma.siguientePaso.update({ where: { id }, data: { hubspotEstado: "escrito", hubspotError: "Lo cubre un paso más nuevo." } });
  }

  const properties = valoresParaHubspot(
    p.equipo as EquipoDelSiguientePaso,
    p.estado === "vigente" ? { que: p.que, fecha: p.fecha ? p.fecha.toISOString().slice(0, 10) : null, responsableOwnerId: p.responsableOwnerId } : null,
  );
  let error: string | null = null;
  try {
    const hs = await getSystemHubspotClient();
    const res = await hs.apiRequest({ method: "PATCH", path: `/crm/v3/objects/${p.hubspotObjectType}/${p.hubspotObjectId}`, body: { properties } });
    if (!res.ok) error = `HubSpot ${res.status}: ${(await res.text()).slice(0, 300)}`;
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
  }
  return prisma.siguientePaso.update({
    where: { id },
    data: error
      ? { hubspotEstado: "error", hubspotError: error, hubspotIntentos: { increment: 1 } }
      : { hubspotEstado: "escrito", hubspotError: null, hubspotEscritoAt: new Date() },
  });
}

/** Lo que quedó sin escribir en HubSpot (pendiente o con error), hasta 5 intentos. Lo corre el job `negocios-abiertos`. */
export async function reintentarEscrituras(limite = 25): Promise<{ intentados: number; escritos: number; conError: number }> {
  const filas = await prisma.siguientePaso.findMany({
    where: {
      estado: { in: ["vigente", "hecho"] },
      hubspotEstado: { in: ["pendiente", "error"] },
      hubspotIntentos: { lt: MAX_INTENTOS_EN_HUBSPOT },
      // Lo que se está escribiendo en este momento no se pisa.
      updatedAt: { lt: new Date(Date.now() - 60_000) },
    },
    orderBy: { updatedAt: "asc" },
    take: limite,
    select: { id: true },
  });
  let escritos = 0;
  let conError = 0;
  for (const f of filas) {
    const r = await escribirEnHubspot(f.id);
    if (r.hubspotEstado === "escrito") escritos++;
    else if (r.hubspotEstado === "error") conError++;
  }
  return { intentados: filas.length, escritos, conError };
}
