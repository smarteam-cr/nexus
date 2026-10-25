/**
 * lib/sessions/propuesta-de-empresa-server.ts — calcula y guarda a qué empresa propone Nexus cada reunión con texto sin
 * dueña (T3, 2026-10-25). SERVIDOR.
 *
 * Lo corre el job `reuniones-propuestas` (una vez por hora) y, la primera vez, scripts/proponer-empresa-de-reuniones.ts.
 * Mira las reuniones de los últimos `DIAS_DE_LA_PROPUESTA` días con texto, con alguien de fuera y sin dueña por ninguna de
 * las dos vías; arma UN contexto del resolver (`buildCategorizeCtx`) y UNA consulta a HubSpot por los dominios de todas
 * (`buildHubspotDomainMap`, solo lectura), y deja en `PropuestaDeEmpresa` lo que dice `proponerEmpresa`. Una propuesta
 * que alguien ya decidió no se toca; una sin decidir que el resolver ya no sostiene, se borra.
 * Nunca escribe el dueño de una reunión: eso lo hace una persona (lib/sessions/empresa-de-la-reunion-server.ts).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { buildCategorizeCtx, buildHubspotDomainMap } from "./resolve-client";
import { dominiosDeLaCasa } from "./reuniones-para-seguimiento";
import { conAlguienDeFuera } from "./salud-de-las-reuniones";
import { sqlClaseDeTexto } from "./tiene-texto";
import { mismaPropuesta, proponerEmpresa } from "./propuesta-de-empresa";

/** Cuántos días hacia atrás: los del tablero de salud (su periodo más largo). Las 67 del plan son de 90 días. */
export const DIAS_DE_LA_PROPUESTA = 90;
const DIA_MS = 86_400_000;

export interface ReunionSinDuena {
  id: string;
  title: string;
  date: Date;
  participants: string[];
  organizerEmail: string | null;
}

/** Las reuniones de la ventana con texto (o lo que contó una persona), con alguien de fuera, sin dueña. */
export async function reunionesConTextoSinDuena(ahora: Date, dias = DIAS_DE_LA_PROPUESTA): Promise<ReunionSinDuena[]> {
  const desde = new Date(+ahora - dias * DIA_MS);
  const [filas, propios] = await Promise.all([
    prisma.$queryRaw<ReunionSinDuena[]>`
      SELECT s."id", s."title", s."date", s."participants", s."organizerEmail"
      FROM "FirefliesSession" s
      WHERE s."date" >= ${desde} AND s."date" <= ${ahora}
        AND s."resolvedClientId" IS NULL AND s."manualClientId" IS NULL
        AND (${sqlClaseDeTexto("s")} <> 'nada' OR coalesce(jsonb_typeof(s."summary") = 'object' AND s."summary" ? 'aMano', false))
      ORDER BY s."date" DESC`,
    dominiosDeLaCasa(),
  ]);
  return filas.filter((f) => conAlguienDeFuera({ organizador: f.organizerEmail, participantes: f.participants ?? [] }, propios));
}

export interface ResultadoDeLasPropuestas {
  miradas: number;
  nuevas: number;
  cambiadas: number;
  borradas: number;
  sinPropuesta: number;
  /** HubSpot no respondió: las de empresas que Nexus no tiene no se pudieron proponer (no se borra nada por eso). */
  sinHubspot: boolean;
}

export async function calcularPropuestas(o: { ahora?: Date; dias?: number; simulacro?: boolean } = {}): Promise<ResultadoDeLasPropuestas> {
  const ahora = o.ahora ?? new Date();
  const reuniones = await reunionesConTextoSinDuena(ahora, o.dias);
  const r: ResultadoDeLasPropuestas = { miradas: reuniones.length, nuevas: 0, cambiadas: 0, borradas: 0, sinPropuesta: 0, sinHubspot: false };
  if (!reuniones.length) return r;

  const ctx = await buildCategorizeCtx();
  // Los participantes tal como los mira la materialización (resolve-client.ts): ni uno más, así la propuesta es lo que
  // diría el resolver.
  const sesiones = reuniones.map((s) => ({ ...s, participants: s.participants ?? [] }));
  ctx.hubspotCompaniesByDomain = await buildHubspotDomainMap(sesiones, ctx.internalDomains);
  // Sin HubSpot (falló, o no hay conexión) las propuestas de empresas nuevas no salen: no se borra lo que ya había.
  r.sinHubspot = ctx.hubspotCompaniesByDomain.size === 0;

  const guardadas = new Map(
    (
      await prisma.propuestaDeEmpresa.findMany({
        where: { sessionId: { in: reuniones.map((s) => s.id) } },
        select: { id: true, sessionId: true, tipo: true, clientId: true, hubspotCompanyId: true, decision: true },
      })
    ).map((p) => [p.sessionId, p]),
  );

  for (const s of sesiones) {
    const p = proponerEmpresa({ title: s.title, participants: s.participants, manualClientId: null }, ctx);
    const g = guardadas.get(s.id);
    if (g?.decision) continue; // Lo que decidió una persona queda como lo dejó.
    if (!p) {
      r.sinPropuesta++;
      if (g && !(r.sinHubspot && g.tipo === "HUBSPOT")) {
        r.borradas++;
        if (!o.simulacro) await prisma.propuestaDeEmpresa.delete({ where: { id: g.id } });
      }
      continue;
    }
    if (g && mismaPropuesta(g, p)) continue;
    if (g) r.cambiadas++;
    else r.nuevas++;
    if (o.simulacro) continue;
    const datos = { tipo: p.tipo, clientId: p.clientId, hubspotCompanyId: p.hubspotCompanyId, nombre: p.nombre, dominio: p.dominio, propuestaAt: ahora };
    await prisma.propuestaDeEmpresa.upsert({ where: { sessionId: s.id }, create: { sessionId: s.id, ...datos }, update: datos });
  }
  return r;
}

/** La propuesta de cada reunión, para el tablero y la página de la reunión. Sin la tabla, ninguna. */
export async function propuestasDe(sessionIds: readonly string[]): Promise<
  Map<string, { tipo: "CLIENTE" | "HUBSPOT"; clientId: string | null; hubspotCompanyId: string | null; nombre: string; dominio: string | null; decision: string | null }>
> {
  if (!sessionIds.length) return new Map();
  const filas = await prisma.propuestaDeEmpresa
    .findMany({
      where: { sessionId: { in: [...sessionIds] } },
      select: { sessionId: true, tipo: true, clientId: true, hubspotCompanyId: true, nombre: true, dominio: true, decision: true },
    })
    .catch(() => []);
  return new Map(filas.map((f) => [f.sessionId, { tipo: f.tipo, clientId: f.clientId, hubspotCompanyId: f.hubspotCompanyId, nombre: f.nombre, dominio: f.dominio, decision: f.decision }]));
}
