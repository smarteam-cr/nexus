/**
 * lib/tareas/reunion-hecha-server.ts — une cada reunión planeada (tarea de clase «reunion») con la reunión de Meet que
 * la cumplió (P3 etapa 2, 2026-10-27; las reglas en lib/tareas/reunion-hecha.ts). SERVIDOR.
 *
 * Lo corre el job `tareas-n2-reunion-hecha` cada hora. Lee las reuniones COMO la responsable de cada tarea, por el
 * chokepoint (`getReunionesParaTareas` solo devuelve las suyas y con su dueño), y escribe solo `reunionHechaId` por el
 * escritor único. La reunión unida se lee con IA como cualquier otra: la lectura de cada reunión (lib/lecturas) no
 * cambia. Nunca corre la sincronización de Meet.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getReunionesParaTareas } from "@/lib/sessions/reuniones-para-tareas";
import { DIAS_PARA_UNIRLA, MINUTOS_DE_MARGEN, reunionHechaDe } from "./reunion-hecha";
import { clientesQueVesParaTareas } from "./clientes";
import { unirReunionHecha } from "./mutaciones";

export interface ResultadoDeLasReunionesHechas {
  planeadas: number;
  unidas: number;
}

export async function unirReunionesHechas(ahora = new Date()): Promise<ResultadoDeLasReunionesHechas> {
  const planeadas = await prisma.tarea.findMany({
    where: {
      clase: "reunion",
      reunionHechaId: null,
      archivadaAt: null,
      responsableEmail: { not: null },
      reunionInicio: { gte: new Date(+ahora - DIAS_PARA_UNIRLA * 86_400_000), lte: ahora },
    },
    select: { id: true, origenId: true, clientId: true, reunionInicio: true, invitados: true, responsableEmail: true },
    orderBy: { reunionInicio: "asc" },
    take: 100,
  });
  if (!planeadas.length) return { planeadas: 0, unidas: 0 };

  // Las reuniones que ya cumplieron otra planeada no se usan dos veces.
  const usadas = new Set(
    (await prisma.tarea.findMany({ where: { reunionHechaId: { not: null }, reunionInicio: { gte: new Date(+ahora - 2 * DIAS_PARA_UNIRLA * 86_400_000) } }, select: { reunionHechaId: true } })).map(
      (t) => t.reunionHechaId!,
    ),
  );
  const porPersona = new Map<string, typeof planeadas>();
  for (const t of planeadas) porPersona.set(t.responsableEmail!, [...(porPersona.get(t.responsableEmail!) ?? []), t]);

  let unidas = 0;
  for (const [email, suyas] of porPersona) {
    try {
      const tm = await prisma.teamMember.findFirst({ where: { email: { equals: email, mode: "insensitive" }, deactivatedAt: null } });
      if (!tm) continue;
      const clientes = await clientesQueVesParaTareas(tm);
      const desde = new Date(Math.min(...suyas.map((t) => +t.reunionInicio!)) - MINUTOS_DE_MARGEN * 60_000);
      const reuniones = await getReunionesParaTareas({ quien: { email: tm.email.toLowerCase(), esSuperAdmin: false, clientes }, desde, tope: 80 });
      for (const t of suyas) {
        const id = reunionHechaDe({ origenId: t.origenId, clientId: t.clientId, reunionInicio: t.reunionInicio!, invitados: t.invitados }, reuniones.filter((r) => !usadas.has(r.id)));
        if (!id) continue;
        if (await unirReunionHecha(t.id, id, ahora)) {
          usadas.add(id);
          unidas++;
        }
      }
    } catch (e) {
      console.error(`[tareas/reunion-hecha] las reuniones de ${email}:`, e instanceof Error ? e.message : e);
    }
  }
  return { planeadas: planeadas.length, unidas };
}
