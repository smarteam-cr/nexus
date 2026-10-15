/**
 * lib/siguiente-paso/copia-server.ts — lo que alguien cambió en HubSpot vuelve a Nexus (2026-10-15, etapa 2 de
 * docs/mi-dia-plan.md). SERVER-ONLY.
 *
 * La copia de los negocios abiertos (lib/ventas/sync-negocios-abiertos.ts) lee además las propiedades del siguiente
 * paso de cada negocio y de cada empresa de Nexus, y se las pasa a esta función. La regla de qué gana está en
 * `decidirImportacion` (reglas.ts): Nexus gana mientras no haya escrito lo suyo; lo distinto en HubSpot entra como un
 * paso nuevo con fuente «hubspot», y lo borrado allá se da por hecho.
 *
 * ⚠ Los proyectos (0-970) no se leen todavía: lo que se cambie en el proyecto de HubSpot no vuelve. Se escribe igual.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { EQUIPOS_DEL_SIGUIENTE_PASO } from "./propiedades";
import { decidirImportacion, leerDeHubspot, type ObjetoDelPaso, type UltimoPaso } from "./reglas";

export interface EntradaDeHubspot {
  objeto: ObjetoDelPaso;
  objetoId: string;
  clientId: string | null;
  hubspotObjectType: string;
  hubspotObjectId: string;
  props: Record<string, string | null | undefined>;
}

export interface ResultadoDeLaCopia {
  nuevos: number;
  cerrados: number;
  sinTabla?: true;
}

export async function copiarPasosDeHubspot(
  entradas: readonly EntradaDeHubspot[],
  correoDe: (ownerId: string | null) => string | null,
  leidoAt: Date,
  opciones: { dryRun?: boolean } = {},
): Promise<ResultadoDeLaCopia> {
  const res: ResultadoDeLaCopia = { nuevos: 0, cerrados: 0 };
  if (entradas.length === 0) return res;

  // El último paso (vigente o hecho) de cada objeto y equipo.
  let filas;
  try {
    filas = await prisma.siguientePaso.findMany({
      where: { estado: { in: ["vigente", "hecho"] }, OR: entradas.map((e) => ({ objeto: e.objeto, objetoId: e.objetoId })) },
      orderBy: { createdAt: "desc" },
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) return { ...res, sinTabla: true };
    throw e;
  }
  const ultimo = new Map<string, (typeof filas)[number]>();
  for (const f of filas) {
    const k = `${f.objeto}:${f.objetoId}:${f.equipo}`;
    const previo = ultimo.get(k);
    // El vigente manda; si no hay, el más nuevo (ya vienen ordenados).
    if (!previo || (f.estado === "vigente" && previo.estado !== "vigente")) ultimo.set(k, f);
  }

  const ahora = new Date();
  for (const e of entradas) {
    for (const { clave: equipo } of EQUIPOS_DEL_SIGUIENTE_PASO) {
      const f = ultimo.get(`${e.objeto}:${e.objetoId}:${equipo}`) ?? null;
      const enHubspot = leerDeHubspot(equipo, e.props);
      const u: UltimoPaso | null = f
        ? {
            estado: f.estado as "vigente" | "hecho",
            que: f.que,
            fecha: f.fecha ? f.fecha.toISOString().slice(0, 10) : null,
            responsableOwnerId: f.responsableOwnerId,
            hubspotEstado: f.hubspotEstado as UltimoPaso["hubspotEstado"],
            hubspotEscritoAt: f.hubspotEscritoAt,
            creadoAt: f.createdAt,
            cerradoAt: f.cerradoAt,
          }
        : null;
      const decision = decidirImportacion(u, enHubspot, leidoAt);
      if (decision === "nada") continue;

      if (decision === "cerrar") {
        res.cerrados++;
        if (opciones.dryRun) continue;
        // Si mientras tanto alguien lo cambió en Nexus, no se toca.
        await prisma.siguientePaso.updateMany({
          where: { id: f!.id, estado: "vigente", updatedAt: f!.updatedAt },
          data: { estado: "hecho", cerradoAt: ahora, cerradoPor: "hubspot", hubspotEstado: "escrito", hubspotEscritoAt: leidoAt },
        });
        continue;
      }

      res.nuevos++;
      if (opciones.dryRun) continue;
      await prisma
        .$transaction(async (tx) => {
          if (f && f.estado === "vigente") {
            const r = await tx.siguientePaso.updateMany({
              where: { id: f.id, estado: "vigente", updatedAt: f.updatedAt },
              data: { estado: "reemplazado", cerradoAt: ahora, cerradoPor: "hubspot" },
            });
            if (r.count === 0) throw new Error("cambió en Nexus mientras tanto");
          }
          await tx.siguientePaso.create({
            data: {
              objeto: e.objeto,
              objetoId: e.objetoId,
              equipo,
              que: enHubspot!.que,
              fecha: enHubspot!.fecha ? new Date(`${enHubspot!.fecha}T00:00:00.000Z`) : null,
              responsableOwnerId: enHubspot!.responsableOwnerId,
              responsableEmail: correoDe(enHubspot!.responsableOwnerId),
              escritoPor: "hubspot",
              fuente: "hubspot",
              clientId: e.clientId,
              hubspotObjectType: e.hubspotObjectType,
              hubspotObjectId: e.hubspotObjectId,
              hubspotEstado: "escrito",
              hubspotEscritoAt: leidoAt,
            },
          });
        })
        .catch(() => {
          // Otro escritor llegó primero (una persona en Nexus, o el índice de un solo vigente): la próxima copia vuelve a
          // mirar con lo que haya.
          res.nuevos--;
        });
    }
  }
  return res;
}
