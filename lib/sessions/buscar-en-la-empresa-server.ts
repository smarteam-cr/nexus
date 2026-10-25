/**
 * lib/sessions/buscar-en-la-empresa-server.ts — las búsquedas de T8 (2026-10-25). SERVIDOR. Solo lectura.
 * Las reglas: lib/sessions/buscar-en-la-empresa.ts.
 *
 *   · `idsDeLaEmpresaQueCoinciden`: las reuniones de la empresa (la misma regla que `whereBelongsToClient`) cuyo título,
 *     organizador o invitados coinciden con lo escrito, en toda su historia;
 *   · `reunionesEnOtraEmpresa`: las que quedaron en otra empresa con gente de un dominio de esta. Las de una empresa que
 *     quien busca no puede abrir no se muestran (ni su título): solo se cuentan, y se cuentan ANTES de filtrar por lo
 *     escrito: si el número cambiara con cada letra, deletreando se adivinaría el título que no se muestra.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { clientesQueNoAbre } from "@/lib/auth/access";
import { noEsCanceladaSinTextoSql } from "./canceladas";
import { dominiosDeLaCasa } from "./reuniones-para-seguimiento";
import { duenoDeLaSesion } from "./project-sources";
import { sqlClaseDeTexto } from "./tiene-texto";
import { normalize } from "./categorize";
import { DIAS_EN_OTRA_EMPRESA, TOPE_EN_OTRA_EMPRESA, dominiosDeLaEmpresa, dominiosEnComun, patronDeBusqueda } from "./buscar-en-la-empresa";

/** Las reuniones de la empresa que coinciden con lo escrito, de la más reciente a la más vieja. */
export async function idsDeLaEmpresaQueCoinciden(clientId: string, q: string, take = 100): Promise<string[]> {
  const patron = patronDeBusqueda(q);
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s."id"
    FROM "FirefliesSession" s
    WHERE (s."resolvedClientId" = ${clientId} OR s."manualClientId" = ${clientId})
      AND s."date" <= now()
      AND ${noEsCanceladaSinTextoSql("s")}
      AND (s."title" ILIKE ${patron} OR coalesce(s."organizerEmail", '') ILIKE ${patron}
           OR EXISTS (SELECT 1 FROM unnest(s."participants") p WHERE p ILIKE ${patron}))
    ORDER BY s."date" DESC
    LIMIT ${take}`;
  return filas.map((f) => f.id);
}

export interface ReunionEnOtraEmpresa {
  sessionId: string;
  titulo: string;
  fecha: string;
  empresa: { id: string; nombre: string };
  /** Los dominios de esta empresa que estuvieron. */
  dominios: string[];
  conTexto: boolean;
}

export async function reunionesEnOtraEmpresa(o: { clientId: string; teamMemberId: string; q?: string | null; ahora?: Date }): Promise<{
  reuniones: ReunionEnOtraEmpresa[];
  /** Las que están en empresas que quien busca no tiene asignadas. */
  ocultas: number;
  dominios: string[];
}> {
  const ahora = o.ahora ?? new Date();
  const [empresa, propios] = await Promise.all([
    prisma.client.findUnique({ where: { id: o.clientId }, select: { emailDomains: true, company: true } }),
    dominiosDeLaCasa(),
  ]);
  const dominios = empresa ? dominiosDeLaEmpresa(empresa, propios) : [];
  if (!dominios.length) return { reuniones: [], ocultas: 0, dominios };
  const desde = new Date(+ahora - DIAS_EN_OTRA_EMPRESA * 86_400_000);
  const q = normalize(o.q?.trim() ?? "");
  const filas = await prisma.$queryRaw<
    { id: string; title: string; date: Date; participants: string[]; organizerEmail: string | null; resolvedClientId: string | null; manualClientId: string | null; clase: string }[]
  >`
    SELECT s."id", s."title", s."date", s."participants", s."organizerEmail", s."resolvedClientId", s."manualClientId",
      ${sqlClaseDeTexto("s")} AS "clase"
    FROM "FirefliesSession" s
    WHERE s."date" >= ${desde} AND s."date" <= ${ahora}
      AND coalesce(s."resolvedClientId", s."manualClientId") IS NOT NULL
      AND coalesce(s."resolvedClientId", s."manualClientId") <> ${o.clientId}
      AND ${noEsCanceladaSinTextoSql("s")}
      AND (lower(split_part(coalesce(s."organizerEmail", ''), '@', 2)) = ANY(${dominios})
           OR EXISTS (SELECT 1 FROM unnest(s."participants") p WHERE lower(split_part(p, '@', 2)) = ANY(${dominios})))
    ORDER BY s."date" DESC
    LIMIT 500`;
  // La regla de dueño de siempre, y los dominios como los mira el resolver (sin calendarios ni salas).
  const candidatas = filas
    .map((f) => ({ f, dueno: duenoDeLaSesion(f), comun: dominiosEnComun(f, dominios) }))
    .filter((x): x is typeof x & { dueno: string } => !!x.dueno && x.dueno !== o.clientId && x.comun.length > 0);
  if (!candidatas.length) return { reuniones: [], ocultas: 0, dominios };
  const duenos = [...new Set(candidatas.map((x) => x.dueno))];
  const [noAbre, nombres] = await Promise.all([
    clientesQueNoAbre(o.teamMemberId, duenos),
    prisma.client.findMany({ where: { id: { in: duenos } }, select: { id: true, name: true } }),
  ]);
  const nombreDe = new Map(nombres.map((c) => [c.id, c.name]));
  const visibles = candidatas.filter((x) => !noAbre.has(x.dueno) && (!q || normalize(x.f.title).includes(q)));
  const ocultas = candidatas.filter((x) => noAbre.has(x.dueno)).length;
  return {
    reuniones: visibles.slice(0, TOPE_EN_OTRA_EMPRESA).map((x) => ({
      sessionId: x.f.id,
      titulo: x.f.title,
      fecha: x.f.date.toISOString(),
      empresa: { id: x.dueno, nombre: nombreDe.get(x.dueno) ?? "(sin nombre)" },
      dominios: x.comun,
      conTexto: x.f.clase !== "nada",
    })),
    ocultas,
    dominios,
  };
}
