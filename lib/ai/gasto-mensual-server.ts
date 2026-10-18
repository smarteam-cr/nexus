/**
 * lib/ai/gasto-mensual-server.ts — LO QUE LA BASE SUMA PARA /integrations/gasto-ia. SERVIDOR, solo lectura.
 *
 * Todo se agrega en SQL (sin tope de filas): por mes y modelo, por mes y agente, por día, por mes de las reuniones
 * leídas y por mes y empresa. El mes y el día son los de Costa Rica (UTC−6 todo el año, sin horario de verano).
 *
 * ⛔ El gate NO está acá: la página corta antes de llamar (solo dirección). Gasto de IA por proceso y por empresa,
 * nunca por persona.
 *
 * La empresa de una llamada se resuelve igual que en «Uso de Nexus» (lib/uso/ia-server.ts): la que guardó la llamada,
 * la de su corrida (`AgentRun.clientId`) o la dueña de la reunión que la disparó (`resolvedClientId`, el manual solo si
 * no hay — la precedencia de `duenoDeLaSesion`). Lo que no se puede ubicar no entra a «por cliente».
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { limitesDelEntorno, topeSugerido } from "./presupuesto";
import {
  compararConLaFactura,
  resumirMeses,
  type ComparacionConLaFactura,
  type FilaDia,
  type FilaMesAgente,
  type FilaMesCliente,
  type FilaMesModelo,
  type FilaMesReuniones,
  type MesDeGasto,
} from "./gasto-mensual";
import { baseDeLaProyeccion, type BaseDeLaProyeccion } from "./proyeccion-server";

const DIA_MS = 86_400_000;
/** Cuántos meses hacia atrás se miran. El medidor arrancó el 2026-08-17. */
export const MESES_DE_HISTORIA = 12;
/** Los días que se miran para el tope sugerido. */
export const DIAS_PARA_EL_TOPE = 60;

/** El mes y el día en hora de Costa Rica, como los agrupa Postgres. */
const MES_CR = Prisma.sql`to_char(date_trunc('month', l."at" - interval '6 hours'), 'YYYY-MM')`;
const DIA_CR = Prisma.sql`to_char(l."at" - interval '6 hours', 'YYYY-MM-DD')`;
/** El id de la reunión de un `origen = "reunion:<id> › …"`. */
const REUNION = Prisma.sql`split_part(split_part(l."origen", ' ', 1), ':', 2)`;

export interface DatosDelGasto {
  faltaLaTabla: boolean;
  /** Sin la columna `lote` (falta scripts/sql/2026-10-18-gasto-de-ia.sql): los lotes no se distinguen. */
  faltaElSqlDeHoy: boolean;
  meses: MesDeGasto[];
  dias: FilaDia[];
  limites: ReturnType<typeof limitesDelEntorno>;
  sugerido: ReturnType<typeof topeSugerido>;
  facturas: ComparacionConLaFactura[];
  base: BaseDeLaProyeccion | null;
}

async function porMesYModelo(desde: Date, conLote: boolean): Promise<FilaMesModelo[]> {
  const lote = conLote ? Prisma.sql`l."lote"` : Prisma.sql`false`;
  const filas = await prisma.$queryRaw<
    { mes: string; model: string; lote: boolean; llamadas: number; fallidas: number; sinTarifa: number; costo: number; costoHumano: number; e: number; s: number; cl: number; ce: number }[]
  >(Prisma.sql`
    SELECT ${MES_CR} AS mes, l."model" AS model, ${lote} AS lote,
      count(*)::int AS llamadas,
      (count(*) FILTER (WHERE NOT l."ok"))::int AS fallidas,
      (count(*) FILTER (WHERE l."costUsd" IS NULL))::int AS "sinTarifa",
      coalesce(sum(l."costUsd"), 0)::float8 AS costo,
      coalesce(sum(l."costUsd") FILTER (WHERE l."triggeredByEmail" IS NOT NULL), 0)::float8 AS "costoHumano",
      coalesce(sum(l."inputTokens"), 0)::float8 AS e,
      coalesce(sum(l."outputTokens"), 0)::float8 AS s,
      coalesce(sum(l."cacheReadTokens"), 0)::float8 AS cl,
      coalesce(sum(l."cacheCreationTokens"), 0)::float8 AS ce
    FROM "LlmCall" l
    WHERE l."at" >= ${desde}
    GROUP BY 1, 2, 3`);
  return filas.map((f) => ({
    mes: f.mes,
    model: f.model,
    lote: f.lote,
    llamadas: f.llamadas,
    fallidas: f.fallidas,
    sinTarifa: f.sinTarifa,
    costo: f.costo,
    costoHumano: f.costoHumano,
    tokensEntrada: f.e,
    tokensSalida: f.s,
    tokensCacheLectura: f.cl,
    tokensCacheEscritura: f.ce,
  }));
}

async function porMesYAgente(desde: Date): Promise<FilaMesAgente[]> {
  return prisma.$queryRaw<FilaMesAgente[]>(Prisma.sql`
    SELECT ${MES_CR} AS mes, l."agentSlug" AS "agentSlug",
      coalesce(l."origen" LIKE '%avance%', false) AS "esAvance",
      coalesce(l."origen" LIKE '%sessions/post-process%', false) AS "esLectura",
      coalesce(sum(l."costUsd"), 0)::float8 AS costo,
      count(*)::int AS llamadas,
      count(DISTINCT l."agentRunId")::int AS corridas
    FROM "LlmCall" l
    WHERE l."at" >= ${desde}
    GROUP BY 1, 2, 3, 4`);
}

async function porDia(desde: Date): Promise<FilaDia[]> {
  return prisma.$queryRaw<FilaDia[]>(Prisma.sql`
    SELECT ${DIA_CR} AS dia,
      coalesce(sum(l."costUsd") FILTER (WHERE l."triggeredByEmail" IS NOT NULL), 0)::float8 AS "costoHumano",
      coalesce(sum(l."costUsd") FILTER (WHERE l."triggeredByEmail" IS NULL), 0)::float8 AS "costoAutomatico"
    FROM "LlmCall" l
    WHERE l."at" >= ${desde}
    GROUP BY 1
    ORDER BY 1`);
}

async function reunionesPorMes(desde: Date): Promise<FilaMesReuniones[]> {
  return prisma.$queryRaw<FilaMesReuniones[]>(Prisma.sql`
    SELECT ${MES_CR} AS mes, count(DISTINCT ${REUNION})::int AS reuniones, coalesce(sum(l."costUsd"), 0)::float8 AS costo
    FROM "LlmCall" l
    WHERE l."at" >= ${desde} AND l."origen" LIKE 'reunion:%'
    GROUP BY 1`);
}

async function clientesPorMes(desde: Date): Promise<FilaMesCliente[]> {
  return prisma.$queryRaw<FilaMesCliente[]>(Prisma.sql`
    WITH ubicadas AS (
      SELECT ${MES_CR} AS mes, l."costUsd" AS costo,
        coalesce(l."clientId", ar."clientId", fs."resolvedClientId", fs."manualClientId") AS "clientId"
      FROM "LlmCall" l
      LEFT JOIN "AgentRun" ar ON ar."id" = l."agentRunId"
      LEFT JOIN "FirefliesSession" fs ON l."origen" LIKE 'reunion:%' AND fs."id" = ${REUNION}
      WHERE l."at" >= ${desde}
    )
    SELECT u.mes, u."clientId", coalesce(c."name", 'Empresa borrada') AS nombre,
      coalesce(sum(u.costo), 0)::float8 AS costo, count(*)::int AS llamadas
    FROM ubicadas u
    LEFT JOIN "Client" c ON c."id" = u."clientId"
    WHERE u."clientId" IS NOT NULL
    GROUP BY 1, 2, 3`);
}

/**
 * ¿Falta una tabla o una columna? Un `$queryRaw` que falla por eso llega como P2010, con el código de Postgres en el
 * mensaje («Code: 42703»), que `esquemaDesactualizado` no reconoce.
 */
function faltaEnLaBase(e: unknown): boolean {
  if (esquemaDesactualizado(e)) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /42703|42P01|(column|relation) .* does not exist/i.test(msg);
}

/** El primer día del mes, `meses` meses atrás, en hora de Costa Rica. */
function inicioDeLaHistoria(ahora: Date, meses: number): Date {
  const cr = new Date(ahora.getTime() - 6 * 3_600_000);
  return new Date(Date.UTC(cr.getUTCFullYear(), cr.getUTCMonth() - (meses - 1), 1, 6, 0, 0));
}

/** Las facturas anotadas, o null si falta la tabla (scripts/sql/2026-10-18-gasto-de-ia.sql). */
async function facturasAnotadas(): Promise<{ mes: string; montoUsd: number }[] | null> {
  try {
    const filas = await prisma.facturaDeAnthropic.findMany({ select: { mes: true, montoUsd: true }, orderBy: { mes: "asc" } });
    return filas.map((f) => ({ mes: f.mes, montoUsd: Number(f.montoUsd) }));
  } catch (e) {
    if (faltaEnLaBase(e) || !modeloDisponible((prisma as unknown as { facturaDeAnthropic?: unknown }).facturaDeAnthropic)) return null;
    throw e;
  }
}

/** El último mes completo medido (el anterior al de hoy, en Costa Rica), para comparar con la proyección. */
function ultimoMesCompleto(meses: readonly MesDeGasto[], ahora: Date): { mes: string; costo: number } | null {
  const hoy = new Date(ahora.getTime() - 6 * 3_600_000).toISOString().slice(0, 7);
  const m = [...meses].reverse().find((x) => x.mes < hoy);
  return m ? { mes: m.mes, costo: m.costo } : null;
}

export async function datosDelGasto(ahora = new Date()): Promise<DatosDelGasto> {
  const desde = inicioDeLaHistoria(ahora, MESES_DE_HISTORIA);
  const desdeDias = new Date(Math.min(desde.getTime(), ahora.getTime() - DIAS_PARA_EL_TOPE * DIA_MS));
  const limites = limitesDelEntorno();
  const vacio: DatosDelGasto = { faltaLaTabla: true, faltaElSqlDeHoy: true, meses: [], dias: [], limites, sugerido: null, facturas: [], base: null };

  let modelos: FilaMesModelo[];
  let faltaElSqlDeHoy = false;
  try {
    modelos = await porMesYModelo(desde, true);
  } catch (e) {
    if (!faltaEnLaBase(e)) throw e;
    try {
      modelos = await porMesYModelo(desde, false);
      faltaElSqlDeHoy = true;
    } catch (e2) {
      if (faltaEnLaBase(e2)) return vacio;
      throw e2;
    }
  }

  const [agentes, dias, reuniones, clientes, facturas, base] = await Promise.all([
    porMesYAgente(desde),
    porDia(desdeDias),
    reunionesPorMes(desde),
    clientesPorMes(desde),
    facturasAnotadas(),
    baseDeLaProyeccion(ahora).catch((e) => {
      console.error("[gasto-ia] no se pudo armar la base de la proyección:", e instanceof Error ? e.message : e);
      return null;
    }),
  ]);
  const meses = resumirMeses({ modelos, agentes, dias: dias.filter((d) => d.dia >= desde.toISOString().slice(0, 10)), reuniones, clientes }, limites);
  const ultimos = dias.filter((d) => d.dia >= new Date(ahora.getTime() - DIAS_PARA_EL_TOPE * DIA_MS - 6 * 3_600_000).toISOString().slice(0, 10));
  return {
    faltaLaTabla: false,
    faltaElSqlDeHoy: faltaElSqlDeHoy || facturas === null,
    meses,
    dias,
    limites,
    sugerido: topeSugerido(ultimos),
    facturas: compararConLaFactura(meses, facturas ?? []),
    base: base ? { ...base, ultimoMesCompleto: ultimoMesCompleto(meses, ahora) } : null,
  };
}
