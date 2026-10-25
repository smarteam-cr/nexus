/**
 * lib/sessions/salud-de-las-reuniones-server.ts — lee de la base lo que arma el tablero de salud de las reuniones (T1).
 * SERVIDOR. El armado es puro: lib/sessions/salud-de-las-reuniones.ts.
 *
 * Una sola consulta, sin traer los textos: la clase de texto sale de `sqlClaseDeTexto` (el predicado único), y si tiene
 * minuta, de un EXISTS. Las canceladas sin nada no entran (`noEsCanceladaSinTextoSql`, U1): no ocurrieron. Con `soloDe`,
 * el armado se queda con las que esa persona organizó o en las que estuvo invitada (la regla vive en un solo lugar, el
 * armado), y de las MISMAS filas sale el porcentaje del equipo para comparar: nada se lee dos veces.
 *
 * No arma contexto para ningún agente (es un tablero de conteos, invariante 1 de CLAUDE.md): por eso lee
 * `FirefliesSession` directo, con la dueña de siempre (`resolvedClientId`, la manual solo si no hay).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { encargadosDeLasCuentas } from "@/lib/cuentas/encargado-server";
import { clientesQueNoAbre } from "@/lib/auth/access";
import { dominiosDeLaCasa } from "@/lib/sessions/reuniones-para-seguimiento";
import { noEsCanceladaSinTextoSql } from "@/lib/sessions/canceladas";
import { sqlClaseDeTexto, type ClaseDeTexto } from "@/lib/sessions/tiene-texto";
import { armarSaludDeLasReuniones, type PeriodoDeLaSalud, type PersonaDelEquipo, type ReunionParaLaSalud, type SaludDeLasReuniones } from "./salud-de-las-reuniones";

const DIA_MS = 86_400_000;

export interface TableroDeLaSalud {
  salud: SaludDeLasReuniones;
  /** Con `soloDe`: el porcentaje de todo el equipo (solo el número). null sin `soloDe`. */
  delEquipo: number | null;
}

export async function saludDeLasReuniones(o: {
  dias: PeriodoDeLaSalud;
  /** Solo las reuniones de esta persona (quien no es la líder de CS ni dirección). */
  soloDe?: string | null;
  /** Quien mira: sus reuniones de una empresa que no puede abrir van sin enlace. */
  teamMemberId?: string | null;
  /** La fila abierta con «Ver todas». */
  verTodas?: string | null;
  ahora?: Date;
}): Promise<TableroDeLaSalud> {
  const ahora = o.ahora ?? new Date();
  const desde = new Date(+ahora - o.dias * DIA_MS);
  const soloDe = o.soloDe?.trim().toLowerCase() || null;
  const [filas, equipo, propios] = await Promise.all([
    prisma.$queryRaw<
      {
        id: string;
        title: string;
        date: Date;
        duration: number | null;
        organizerEmail: string | null;
        participants: string[];
        empresaId: string | null;
        empresa: string | null;
        clase: ClaseDeTexto;
        leida: boolean;
        enrichedAt: Date | null;
        enrichAttempts: number;
        enrichError: string | null;
        googleDocId: string | null;
        tieneNotas: boolean;
        canceladaEn: Date | null;
      }[]
    >`
      SELECT s."id", s."title", s."date", s."duration", s."organizerEmail", s."participants",
        c."id" AS "empresaId", c."name" AS "empresa",
        ${sqlClaseDeTexto("s")} AS "clase",
        EXISTS (SELECT 1 FROM "SessionMinute" m WHERE m."sessionId" = s."id") AS "leida",
        s."enrichedAt", s."enrichAttempts", s."enrichError", s."googleDocId",
        (jsonb_typeof(s."summary") = 'object' AND coalesce(btrim(s."summary"->>'overview'), '') <> '') AS "tieneNotas",
        s."canceladaEn"
      FROM "FirefliesSession" s
      LEFT JOIN "Client" c ON c."id" = coalesce(s."resolvedClientId", s."manualClientId")
      WHERE s."date" >= ${desde} AND s."date" <= ${ahora}
        AND ${noEsCanceladaSinTextoSql("s")}
      ORDER BY s."date" DESC`,
    prisma.teamMember.findMany({ where: { deactivatedAt: null }, select: { email: true, name: true, area: true, roleEnum: true } }),
    dominiosDeLaCasa(),
  ]);
  const personas = new Map<string, PersonaDelEquipo>(
    equipo.map((m) => [m.email.toLowerCase(), { email: m.email.toLowerCase(), nombre: m.name, detalle: m.area?.trim() || ROLE_LABEL[m.roleEnum] }]),
  );
  const reuniones: ReunionParaLaSalud[] = filas.map((f) => ({
    id: f.id,
    titulo: f.title,
    fecha: f.date,
    duracion: f.duration,
    organizador: f.organizerEmail,
    participantes: f.participants ?? [],
    empresaId: f.empresaId,
    empresa: f.empresa,
    clase: f.clase,
    leida: f.leida,
    enrichedAt: f.enrichedAt,
    enrichAttempts: f.enrichAttempts,
    enrichError: f.enrichError,
    googleDocId: f.googleDocId,
    tieneNotas: !!f.tieneNotas,
    canceladaEn: f.canceladaEn,
  }));
  const empresas = [...new Set(reuniones.map((r) => r.empresaId).filter((x): x is string => !!x))];
  const [porEmpresa, noAbre] = await Promise.all([
    encargadosDeLasCuentas(empresas),
    o.teamMemberId ? clientesQueNoAbre(o.teamMemberId, empresas) : Promise.resolve(new Set<string>()),
  ]);
  const encargadas = new Map([...porEmpresa].map(([id, e]) => [id, e.nombre ?? (e.deBaja ? `${e.deBaja} (de baja)` : null)]));
  const ctx = { ahora, propios, equipo: personas, encargadas, empresasQueNoAbre: noAbre, verTodas: o.verTodas ?? null };
  const salud = armarSaludDeLasReuniones(reuniones, { ...ctx, soloDe });
  const delEquipo = soloDe ? armarSaludDeLasReuniones(reuniones, ctx).totales.porcentaje : null;
  return { salud, delEquipo };
}
