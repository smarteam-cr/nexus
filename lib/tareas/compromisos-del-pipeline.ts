/**
 * lib/tareas/compromisos-del-pipeline.ts — lo que Smarteam prometió en las reuniones con las empresas de los negocios
 * abiertos (Ventas › Pipeline, 2026-10-30). SERVIDOR. Solo lee.
 *
 * Se lee como lo vería la persona en Tareas: `tareasVisiblesWhere`, y la cita con su regla (`veLaCitaDe`: quien estuvo en
 * la reunión o un Super Admin). Una tarea cuya reunión ya es de otro cliente no sale (invariante 1): el dueño de la
 * reunión se lee al momento por lib/sessions, nunca de la tarea.
 */
import "server-only";
import type { TeamMember } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { DIAS_QUE_AVISA } from "@/lib/comunicaciones/sin-agendar";
import { duenosDeReuniones, salasDeReuniones } from "@/lib/sessions/reuniones-para-tareas";
import { clientesQueVesParaTareas } from "./clientes";
import { comoFecha, hoyEnCostaRica } from "./semana";
import { contextoDeTareas, nombreDe, tareasDisponible } from "./servidor";
import { veLaCitaDe } from "./serializar";
import { tareasVisiblesWhere } from "./visibilidad";

export interface CompromisoLeido {
  id: string;
  titulo: string;
  clientId: string;
  estado: string;
  lado: string;
  origen: string;
  origenId: string | null;
  responsableEmail: string | null;
  /** El nombre, o null si está «Por asignar». */
  responsable: string | null;
  equipo: string | null;
  venceEl: string | null;
  creadaAt: Date;
  mismaQueId: string | null;
  /** null = quien mira no la ve. */
  cita: string | null;
  /** La reunión, solo para quien ve la cita. `fecha`: el día en Costa Rica. */
  reunion: { titulo: string; fecha: string } | null;
}

const esDeOtroCliente = (dueno: string | null | undefined, clientId: string | null) => !!dueno && dueno !== clientId;

/**
 * De estas tareas, las que salieron de una reunión que hoy es de otro cliente. La lectura del siguiente paso no mira la
 * reunión de la tarea: sin esto, el título de una reunión que alguien corrigió seguiría saliendo en la empresa vieja.
 */
export async function tareasDeReunionAjena(ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length || !(await tareasDisponible())) return new Set();
  const filas = await prisma.tarea.findMany({ where: { id: { in: [...ids] }, sessionId: { not: null } }, select: { id: true, clientId: true, sessionId: true } });
  const duenos = await duenosDeReuniones(filas.map((f) => f.sessionId!));
  return new Set(filas.filter((f) => esDeOtroCliente(duenos.get(f.sessionId!)?.clientId, f.clientId)).map((f) => f.id));
}

/** Hasta cuántas filas se leen: las más nuevas. */
const TOPE = 400;

export async function compromisosDeLasEmpresas(
  tm: TeamMember,
  clientIds: readonly string[],
  ahora: Date,
): Promise<CompromisoLeido[]> {
  if (!clientIds.length || !(await tareasDisponible())) return [];
  const [ctx, clientes] = await Promise.all([contextoDeTareas({ teamMember: tm }), clientesQueVesParaTareas(tm)]);
  const filas = await prisma.tarea.findMany({
    where: {
      AND: [
        tareasVisiblesWhere(ctx),
        {
          privada: false,
          lado: "smarteam",
          clientId: { in: [...clientIds] },
          sessionId: { not: null },
          origen: { not: "correo" },
          origenId: { startsWith: "l:", contains: ":seg-" },
          OR: [
            { estado: { in: ["pendiente", "en_curso"] } },
            { estado: { in: ["propuesta", "vencida"] }, createdAt: { gte: new Date(+ahora - DIAS_QUE_AVISA * 86_400_000) } },
          ],
        },
      ],
    },
    select: {
      id: true,
      titulo: true,
      clientId: true,
      estado: true,
      lado: true,
      origen: true,
      origenId: true,
      responsableEmail: true,
      creadaPorEmail: true,
      equipo: true,
      venceEl: true,
      createdAt: true,
      mismaQueId: true,
      cita: true,
      sessionId: true,
    },
    orderBy: { createdAt: "desc" },
    take: TOPE,
  });
  const ids = filas.map((f) => f.sessionId!);
  const [salas, duenos] = await Promise.all([salasDeReuniones({ email: ctx.email, esSuperAdmin: ctx.esSuperAdmin, clientes }, ids), duenosDeReuniones(ids)]);
  return filas
    .filter((f) => !esDeOtroCliente(duenos.get(f.sessionId!)?.clientId, f.clientId))
    .map((f) => {
      const sala = salas.get(f.sessionId!);
      const veLaCita = !!sala && veLaCitaDe(sala, f, ctx);
      return {
        id: f.id,
        titulo: f.titulo,
        clientId: f.clientId!,
        estado: f.estado,
        lado: f.lado,
        origen: f.origen,
        origenId: f.origenId,
        responsableEmail: f.responsableEmail,
        responsable: f.responsableEmail ? nombreDe(f.responsableEmail, ctx.miembros) : null,
        equipo: f.equipo,
        venceEl: comoFecha(f.venceEl),
        creadaAt: f.createdAt,
        mismaQueId: f.mismaQueId,
        cita: veLaCita ? f.cita : null,
        reunion: veLaCita && sala ? { titulo: sala.titulo, fecha: hoyEnCostaRica(sala.inicio) } : null,
      };
    });
}
