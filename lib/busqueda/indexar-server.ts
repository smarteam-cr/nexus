/**
 * lib/busqueda/indexar-server.ts — parte en turnos las transcripciones de las reuniones con clientes y prospectos, para
 * buscar en ellas (etapa 4c de docs/mi-dia-plan.md). El ÚNICO escritor de `TurnoDeReunion` y `ReunionIndexada`.
 *
 * Lo corre el job `indice-de-reuniones` (cada hora, de a `POR_CORRIDA`) y, la primera vez, scripts/indexar-reuniones.ts.
 * Una reunión se vuelve a partir solo si su transcripción cambió (la huella): si no, solo se anota que se miró.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { huellaDeTranscripcion, turnosParaIndexar } from "./turnos";

/** Cuántas reuniones por corrida. */
export const POR_CORRIDA = 60;
/** Hasta cuántos días atrás se indexa. Lo más viejo no se busca: el resumen mira lo reciente. */
export const DIAS_A_INDEXAR = 180;

export interface ResultadoDelIndice {
  sinTabla?: boolean;
  miradas: number;
  partidas: number;
  turnos: number;
  sinCambio: number;
  /** Cuántas quedan por mirar después de esta corrida. */
  faltan: number;
}

/** Las reuniones por partir: de clientes y prospectos, con transcripción, que nunca se partieron o cambiaron después. */
async function candidatas(limite: number, dias: number, ahora: Date): Promise<{ ids: string[]; total: number }> {
  const desde = new Date(ahora.getTime() - dias * 86_400_000);
  const filtro = Prisma.sql`
    FROM "FirefliesSession" s
    JOIN "Client" c ON c.id = coalesce(s."resolvedClientId", s."manualClientId") AND c.kind IN ('CLIENTE', 'PROSPECTO')
    LEFT JOIN "ReunionIndexada" r ON r."sessionId" = s.id
    WHERE s.transcript IS NOT NULL AND length(s.transcript) > 200
      AND s.date >= ${desde} AND s.date <= ${ahora}
      AND (r."sessionId" IS NULL OR s."updatedAt" > r."indexadoAt")`;
  const [filas, total] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT s.id ${filtro} ORDER BY s.date DESC LIMIT ${limite}`),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT count(*) AS n ${filtro}`),
  ]);
  return { ids: filas.map((f) => f.id), total: Number(total[0]?.n ?? 0) };
}

export async function indexarReuniones(o: { limite?: number; dias?: number; escribir?: boolean; ahora?: Date } = {}): Promise<ResultadoDelIndice> {
  const ahora = o.ahora ?? new Date();
  const escribir = o.escribir ?? true;
  if (!modeloDisponible(prisma.turnoDeReunion) || !modeloDisponible(prisma.reunionIndexada)) return { sinTabla: true, miradas: 0, partidas: 0, turnos: 0, sinCambio: 0, faltan: 0 };
  const limite = o.limite ?? POR_CORRIDA;
  const { ids, total } = await candidatas(limite, o.dias ?? DIAS_A_INDEXAR, ahora);
  const r: ResultadoDelIndice = { miradas: ids.length, partidas: 0, turnos: 0, sinCambio: 0, faltan: Math.max(0, total - ids.length) };
  for (const id of ids) {
    const s = await prisma.firefliesSession.findUnique({ where: { id }, select: { transcript: true, indexada: { select: { huella: true } } } });
    if (!s?.transcript) continue;
    const huella = huellaDeTranscripcion(s.transcript);
    if (s.indexada?.huella === huella) {
      r.sinCambio++;
      if (escribir) await prisma.reunionIndexada.update({ where: { sessionId: id }, data: { indexadoAt: ahora } });
      continue;
    }
    const turnos = turnosParaIndexar(s.transcript);
    r.partidas++;
    r.turnos += turnos.length;
    if (!escribir) continue;
    try {
      await prisma.$transaction([
        prisma.turnoDeReunion.deleteMany({ where: { sessionId: id } }),
        prisma.turnoDeReunion.createMany({ data: turnos.map((t) => ({ sessionId: id, orden: t.orden, hablante: t.hablante, texto: t.texto })) }),
        prisma.reunionIndexada.upsert({
          where: { sessionId: id },
          create: { sessionId: id, huella, turnos: turnos.length, indexadoAt: ahora },
          update: { huella, turnos: turnos.length, indexadoAt: ahora },
        }),
      ]);
    } catch (e) {
      // Otra corrida (el job o la carga inicial) la partió al mismo tiempo: ya quedó, se sigue con las demás.
      if ((e as { code?: string }).code === "P2002") continue;
      throw e;
    }
  }
  return r;
}
