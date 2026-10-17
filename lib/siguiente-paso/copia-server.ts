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
 *
 * Desde el 2026-10-16 (fase 0.2) el siguiente paso es una tarea: lo nuevo que alguien escribió en HubSpot entra como
 * TAREA del sprint de ese equipo (crearTareaDePasoDeHubspot, el escritor único de Tareas), para su dueño de HubSpot si
 * es de ese sprint y, si no, en «Por asignar». La copia recuerda esa tarea. Lo que se borró allá se marca en la copia y
 * la tarea no se toca: la próxima vez que la tarea cambie, se vuelve a escribir.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { EQUIPOS_DEL_SIGUIENTE_PASO } from "./propiedades";
import { decidirImportacion, leerDeHubspot, NOMBRE_DEL_EQUIPO, type ObjetoDelPaso, type UltimoPaso } from "./reglas";
import { SPRINT_DEL_PASO } from "./desde-tareas";
import { miembrosActivos } from "@/lib/tareas/servidor";
import { claveDeEquipo } from "@/lib/tareas/equipos";
import { crearTareaDePasoDeHubspot } from "@/lib/tareas/mutaciones";

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
  const miembros = await miembrosActivos();
  const sprintDe = new Map(miembros.map((m) => [m.email, claveDeEquipo(m.area, m.email)]));
  // El negocio de HubSpot de cada negocio de Nexus (para ligar la tarea).
  const idsNegocio = entradas.filter((e) => e.objeto === "negocio").map((e) => e.objetoId);
  const dealDe = new Map(
    idsNegocio.length ? (await prisma.negocioAbierto.findMany({ where: { id: { in: idsNegocio } }, select: { id: true, hubspotDealId: true } })).map((n) => [n.id, n.hubspotDealId]) : [],
  );
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
      const sprint = SPRINT_DEL_PASO[equipo];
      const dueno = correoDe(enHubspot!.responsableOwnerId);
      const responsableEmail = dueno && sprintDe.get(dueno) === sprint ? dueno : null;
      // Primero se suelta lo vigente (si mientras tanto alguien lo cambió en Nexus, no se toca nada); después la tarea.
      if (f && f.estado === "vigente") {
        const r = await prisma.siguientePaso.updateMany({
          where: { id: f.id, estado: "vigente", updatedAt: f.updatedAt },
          data: { estado: "reemplazado", cerradoAt: ahora, cerradoPor: "hubspot" },
        });
        if (r.count === 0) {
          res.nuevos--;
          continue;
        }
      }
      const tarea = await crearTareaDePasoDeHubspot(
        {
          titulo: enHubspot!.que,
          venceEl: enHubspot!.fecha,
          responsableEmail,
          equipo: sprint,
          nombreDelEquipo: NOMBRE_DEL_EQUIPO[equipo],
          clientId: e.clientId,
          projectId: e.objeto === "proyecto" ? e.objetoId : null,
          hubspotDealId: e.objeto === "negocio" ? (dealDe.get(e.objetoId) ?? e.hubspotObjectId) : null,
        },
        ahora,
      );
      await prisma.siguientePaso
        .create({
          data: {
            objeto: e.objeto,
            objetoId: e.objetoId,
            equipo,
            que: enHubspot!.que,
            fecha: enHubspot!.fecha ? new Date(`${enHubspot!.fecha}T00:00:00.000Z`) : null,
            responsableOwnerId: enHubspot!.responsableOwnerId,
            responsableEmail,
            escritoPor: "hubspot",
            fuente: "hubspot",
            tareaId: tarea.id,
            clientId: e.clientId,
            hubspotObjectType: e.hubspotObjectType,
            hubspotObjectId: e.hubspotObjectId,
            hubspotEstado: "escrito",
            hubspotEscritoAt: leidoAt,
          },
        })
        // Otro escritor llegó primero (el índice de un solo vigente): la tarea queda, y la próxima copia vuelve a mirar.
        .catch(() => undefined);
    }
  }
  return res;
}
