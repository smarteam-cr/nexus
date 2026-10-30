/**
 * lib/hubspot/uso-de-traer-proyectos.ts — cuántas veces se trae la ficha de un cliente desde HubSpot, por día
 * (2026-10-29).
 *
 * Elías preguntó si el botón «Traer proyectos de HubSpot» se usa, y no había cómo saberlo: la ruta no dejaba rastro ni
 * en la base ni en un registro (la copia escribe las filas igual la dispare quien la dispare). Este módulo cuenta cada
 * corrida de `POST /api/clients/[id]/sync-projects` por quién la disparó (`boton`, o `fondo`: la de la ficha al
 * abrirse) y cómo terminó. Lo lee `scripts/uso-de-traer-proyectos.ts`.
 *
 * En la fila `hubspot-traer-proyectos` de `CronJobState` (su `lastResult`), sin SQL nuevo, como el registro del
 * transporte (lib/hubspot/registro-de-fallas.ts). Los últimos 60 días, por día de Costa Rica.
 * ⚠ La de fondo frenada por el cooldown no se cuenta: es cada vez que alguien abre una ficha, y sería una escritura a la
 *   base por página abierta. Para cuántas veces se abre la ficha está `UsoDeNexus`.
 * ⚠ Cuenta también el 3004 de cada PC (`dev:prod`): escribe en la misma base.
 * ⛔ Nunca lanza: contar no puede romper la copia.
 */
import { prisma } from "@/lib/db/prisma";
import { crDateParts } from "@/lib/jobs/time";

export const FILA_DEL_USO = "hubspot-traer-proyectos";
const DIAS_QUE_SE_GUARDAN = 60;

export type Disparo = "boton" | "fondo";
/** corrio = la corrida completa · releyo = el botón releyó por id lo que ya estaba · los otros, frenada. */
export type Desenlace = "corrio" | "releyo" | "en_vuelo" | "piso" | "cooldown" | "error";
export type ConteoDelDia = Partial<Record<`${Disparo}.${Desenlace}`, number>>;

export interface UsoGuardado {
  version: 1;
  dias: Record<string, ConteoDelDia>;
  at: string;
}

/** Cómo terminó una corrida, desde lo que devolvió (o `null` si lanzó). */
export function desenlaceDe(r: { omitido?: string; releidos?: number; errors?: readonly string[] } | null): Desenlace {
  if (!r || (r.errors?.length ?? 0) > 0) return "error";
  if (r.releidos) return "releyo";
  if (r.omitido === "en_vuelo" || r.omitido === "piso" || r.omitido === "cooldown") return r.omitido;
  return "corrio";
}

/** Suma una corrida al registro y descarta los días de más de `DIAS_QUE_SE_GUARDAN`. PURO. */
export function sumarUso(previo: UsoGuardado | null | undefined, dia: string, disparo: Disparo, desenlace: Desenlace, ahora: Date): UsoGuardado {
  const dias: Record<string, ConteoDelDia> = previo?.version === 1 ? { ...previo.dias } : {};
  const clave = `${disparo}.${desenlace}` as const;
  dias[dia] = { ...dias[dia], [clave]: (dias[dia]?.[clave] ?? 0) + 1 };
  const quedan = Object.keys(dias).sort().slice(-DIAS_QUE_SE_GUARDAN);
  return { version: 1, dias: Object.fromEntries(quedan.map((d) => [d, dias[d]])), at: ahora.toISOString() };
}

/** Cuenta una corrida. La de fondo frenada por el cooldown no se cuenta (ver arriba). */
export async function registrarUso(disparo: Disparo, desenlace: Desenlace, ahora = new Date()): Promise<void> {
  if (disparo === "fondo" && desenlace === "cooldown") return;
  try {
    // Con la fila bloqueada, como el registro del transporte: si no, dos clics a la vez cuentan uno.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO "CronJobState" ("id", "updatedAt") VALUES (${FILA_DEL_USO}, now()) ON CONFLICT ("id") DO NOTHING`;
      const filas = await tx.$queryRaw<{ lastResult: unknown }[]>`SELECT "lastResult" FROM "CronJobState" WHERE "id" = ${FILA_DEL_USO} FOR UPDATE`;
      const nuevo = sumarUso(filas[0]?.lastResult as UsoGuardado | null | undefined, crDateParts(ahora).dateKey, disparo, desenlace, ahora);
      await tx.cronJobState.update({ where: { id: FILA_DEL_USO }, data: { lastResult: nuevo as object } });
    });
  } catch (e) {
    console.error("[hubspot/uso-de-traer-proyectos] no se pudo contar", e);
  }
}
