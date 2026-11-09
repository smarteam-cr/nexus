/**
 * scripts/separar-en-unidades.ts — SEPARAR UNA EMPRESA EN UNIDADES, con simulacro y tabla (etapa U1, 2026-11-07).
 *
 * Elías, 6 nov: «Que una empresa (un dominio) pueda tener varias unidades, y que cada unidad funcione en Nexus como un
 * cliente propio […] Nunca debe adivinar en silencio». Plan: docs/empresas-con-dominio-compartido-plan.md, parte 2;
 * DECISIONS «Una empresa con varias unidades». Reemplaza a scripts/separar-tec.ts y scripts/reubicar-reuniones-
 * compartidas.ts (nombres fijos del TEC): las empresas viven en scripts/lib/unidades.ts.
 *
 * Lo que hace, en un solo paso:
 *   1. Las fichas: la principal cambia de nombre y suma sus siglas; cada unidad (existente o nueva) toma su nombre, sus
 *      siglas, sus dominios propios y la marca `comparteDominioConId` → la principal.
 *   2. Las reuniones: cada una a la unidad que dice el resolver único (lib/sessions/categorize.ts) con las fichas como
 *      quedarán (título → gente o dominio → por decidir). Este script no decide ninguna reunión. Lo por decidir queda
 *      con `resolvedClientId` null, a la vista en /sessions («Por decidir: A o B»). Lo asignado a mano no se toca.
 *   3. Proyectos, propuestas y preventas: a la unidad que nombra su título, o la de la gente de sus reuniones
 *      (lib/sessions/separar-en-unidades.ts). Lo que no decidió el título ni una persona se marca «confirmar» y NO se
 *      mueve hasta que alguien lo ponga en `aMano` (scripts/lib/unidades.ts).
 *   4. Los vínculos reunión–proyecto y cada fila con `clientId` (tareas, hechos, alertas, handoff, telemetría…): con
 *      la reunión de la que salieron, o con su proyecto, preventa o propuesta (lib/sessions/reubicar-entre-entidades.ts).
 *      Solo las del grupo: lo que cuelga en OTRA ficha de una reunión que pasa al grupo NO se mueve (sería mover datos
 *      entre dos clientes) y el simulacro lo lista en «Se quedan en otra ficha» para revisarlo a mano (revisión del 8 nov).
 *
 * Simulacro por defecto, en SOLO LECTURA (la conexión nace read-only): imprime la tabla y la deja en
 * `backups/<fecha>-separar-en-unidades/<empresa>-simulacro.md`. Si la base todavía no tiene `comparteDominioConId`
 * (antes del SQL 2026-10-29-dominio-compartido.sql), simula la separación en memoria, igual.
 *
 * ⚠ ORDEN: el SQL 2026-10-29-dominio-compartido.sql → el deploy de este código (el resolver tiene que conocer las
 * reglas de las unidades) → ESTE con `--apply`. Antes del deploy, producción re-resolvería con el código viejo y
 * pisaría lo escrito (KNOWN-ERRORS «El backfill de atribución…»).
 *
 *   npx tsx scripts/separar-en-unidades.ts --empresa tec                                         (simulacro)
 *   ALLOW_PROD_WRITE=1 SIN_RESPALDO=1 npx tsx scripts/separar-en-unidades.ts --empresa tec --apply   (respaldo en JSON)
 * Con pg_dump en la PC, sin SIN_RESPALDO: el guard respalda además las tablas enteras.
 * Se puede correr dos veces: la segunda no encuentra nada que mover.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";

const PIDE_APPLY = process.argv.includes("--apply");
/* ⛔ El simulacro no escribe ni por error: la conexión nace de solo lectura (pg lee PGOPTIONS al abrir cada conexión). */
if (!PIDE_APPLY) {
  process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on"].filter(Boolean).join(" ");
}

import { imprimirDestino, nombreDelScript, planDeRespaldo, resolverApply } from "./lib/guard";
import { guardarRespaldoJson } from "./lib/respaldo-json";
import { columnasDelEsquema, comparteDominioGuardado, hayColumnaComparteDominio } from "./lib/columnas";
import { EMPRESAS_EN_UNIDADES } from "./lib/unidades";
import { prisma } from "@/lib/db/prisma";
import {
  aprenderPersonasDeEntidades,
  buildInternalDomainsSet,
  categorizeSession,
  computeAmbiguousNameTokens,
  decidirEntreEntidades,
  effectiveDomainsForClient,
  entidadesDelDominio,
  ORDEN_DE_CLIENTES_PARA_ATRIBUIR,
  type CategorizeContext,
} from "@/lib/sessions/categorize";
import { buildHubspotDomainMap, resolveSessionClientId } from "@/lib/sessions/resolve-client";
import { asignarDuenioManual } from "@/lib/sessions/duenio-manual";
import { isLockedLink } from "@/lib/sessions/session-project-locks";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { pierdeSuDuena, planDeVinculos, vinculosQueFaltan, type ProyectoDelGrupo } from "@/lib/sessions/reubicar-entre-entidades";
import {
  bloquea,
  conLasUnidadesYaCreadas,
  destinoEfectivo,
  porDecidirConVinculoDeUnaPersona,
  seMueve,
  clientesDespues,
  destinosDeFilas,
  destinosDePreventas,
  destinosDePropuestas,
  destinosDeProyectos,
  fichaCambia,
  fichasDespues,
  POR_QUE,
  type Destino,
  type FichaActual,
  type FilaParaSeparar,
  type PlanDeFilaSeparada,
  type PorQue,
} from "@/lib/sessions/separar-en-unidades";

const ESQUEMA = columnasDelEsquema();
const LLAVES_DE_FILA = ["projectId", "sessionId", "exploracionId", "businessCaseId"] as const;

/** Tablas con `clientId` que NO se mueven con este flujo, y por qué. Toda otra que cuelgue de algo, sí. */
const NO_SE_MUEVEN: Readonly<Record<string, string>> = {
  Client: "son las fichas",
  Project: "va por su regla (la tabla de proyectos)",
  BusinessCase: "va por su regla (la tabla de propuestas)",
  ExploracionDeVenta: "va por su regla (la tabla de preventas)",
  PropuestaDeEmpresa: "es la propuesta de dueño para la reunión: la decide una persona en /sessions",
  AnalisisDeVenta: "el de la dueña anterior se suelta (soltarAnalisisDeVentaAjenos, INV57), no se muda",
};
const TABLAS_QUE_CUELGAN = [...ESQUEMA]
  .filter(([m, cols]) => !(m in NO_SE_MUEVEN) && cols.has("clientId") && LLAVES_DE_FILA.some((k) => cols.has(k)))
  .map(([m]) => m);

const APPLY = resolverApply({
  tablas: ["Client", "Project", "BusinessCase", "ExploracionDeVenta", "FirefliesSession", "SessionProject", "CsAccountBrief", ...TABLAS_QUE_CUELGAN],
});

/** Más que esto no son las siglas: es HubSpot caído u otra deriva, y el `--apply` no sigue. */
const TOPE_DE_RESCATES = 10;

/** Lo mismo que escribe el clasificador en su atajo de «un solo proyecto» (classify-session-project.ts). */
const VINCULO_NUEVO = { isPrimary: true, source: "agent", confidence: 0.7 };

type Delegado = {
  findMany(a: { where: Record<string, unknown>; select?: Record<string, boolean> }): Promise<Record<string, unknown>[]>;
  updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
};
const delegado = (db: unknown, modelo: string) => (db as Record<string, Delegado>)[modelo.charAt(0).toLowerCase() + modelo.slice(1)]!;

type PorDeReunion = PorQue | "fuera-del-grupo";
const POR_DE_REUNION: Record<PorDeReunion, string> = { ...POR_QUE, "fuera-del-grupo": "el resolver la saca de la empresa" };

const fecha = (d: Date) => d.toISOString().slice(0, 10);
/** Un texto dentro de una celda de la tabla: los nombres traen «|» («AE | RE-IMPLEMENTACION HUBSPOT»). */
const celda = (s: string) => s.trim().replace(/\|/g, "\\|");
const lineas: string[] = [];
const log = (s = "") => {
  lineas.push(s);
  console.log(s);
};

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  imprimirDestino();
  const clave = (argumento("--empresa") ?? "").toLowerCase();
  const delArchivo = EMPRESAS_EN_UNIDADES[clave];
  if (!delArchivo) {
    console.error(`⛔ Falta --empresa. Las que hay: ${Object.keys(EMPRESAS_EN_UNIDADES).join(", ")} (scripts/lib/unidades.ts).`);
    process.exit(1);
  }
  const abortar = (m: string): never => {
    console.error(`\n⛔ ${m}`);
    process.exit(1);
  };
  log(`# Separar «${delArchivo.empresa}» en unidades — ${APPLY ? "APPLY (escribe)" : "SIMULACRO (no escribe)"}`);

  /* ── 1. Las fichas, como están y como quedarán ── */
  const hayColumna = await hayColumnaComparteDominio();
  const comparte = await comparteDominioGuardado();
  if (!hayColumna) log("\n⚠ La base todavía no tiene `Client.comparteDominioConId` (falta el SQL 2026-10-29-dominio-compartido.sql): simulo la separación en memoria.");
  if (APPLY && !hayColumna) abortar("Primero el SQL 2026-10-29-dominio-compartido.sql y el deploy: sin la columna no hay dónde marcar las unidades.");
  /* Sin `comparteDominioConId` en el select: antes del SQL la columna no existe y el simulacro igual tiene que correr. */
  const [crudos, categories] = await Promise.all([
    prisma.client.findMany({
      orderBy: ORDEN_DE_CLIENTES_PARA_ATRIBUIR,
      select: { id: true, name: true, company: true, emailDomains: true, hubspotCompanyId: true, siglas: true, kind: true },
    }),
    prisma.sessionCategory.findMany({ select: { id: true, name: true, slug: true, domains: true, kind: true, color: true } }),
  ]);
  const actuales = crudos.map((c) => ({ ...c, comparteDominioConId: comparte.get(c.id) ?? null }));
  const porId = new Map<string, FichaActual & { kind: (typeof crudos)[number]["kind"] }>(actuales.map((c) => [c.id, c]));
  const colgadas = new Map<string, string[]>();
  for (const [id, duena] of comparte) colgadas.set(duena, [...(colgadas.get(duena) ?? []), id]);
  /* Una unidad nueva que un --apply anterior ya creó se reconoce: correr de nuevo no crea otra. */
  const { sep, encontradas } = conLasUnidadesYaCreadas(delArchivo, porId, colgadas);
  for (const e of encontradas) log(`\n«${porId.get(e.id)?.name}» (${e.clave}) ya existe: \`${e.id}\`. Anótalo en scripts/lib/unidades.ts.`);
  const idsDeLaSeparacion = new Set([sep.principal.id, ...sep.unidades.flatMap((u) => (u.id ? [u.id] : []))]);
  const dominioDeOtra = (d: string) => actuales.find((c) => !idsDeLaSeparacion.has(c.id) && effectiveDomainsForClient(c).includes(d))?.name ?? null;
  const { fichas, errores } = fichasDespues(sep, porId, colgadas, dominioDeOtra);
  if (errores.length) {
    for (const e of errores) console.error(`⛔ ${e}`);
    if (APPLY || fichas.length === 0) abortar("La separación no es coherente con la base: corrige scripts/lib/unidades.ts.");
  }
  const claveDe = new Map(fichas.map((f) => [f.clave.toUpperCase(), f.id]));
  const idPorClave = (k: string, que: string) => claveDe.get(k.toUpperCase()) ?? abortar(`«${k}» (${que}) no es la clave de ninguna unidad.`);
  const aMano = (m: Record<string, string> | undefined, que: string) =>
    new Map(Object.entries(m ?? {}).map(([id, k]) => [id, idPorClave(k, `${que} ${id}`)]));
  const manoProyectos = aMano(sep.aMano?.proyectos, "proyecto");
  const manoPropuestas = aMano(sep.aMano?.propuestas, "propuesta");
  const manoPreventas = aMano(sep.aMano?.preventas, "preventa");
  const manoReuniones = aMano(sep.aMano?.reuniones, "reunión");

  const nombreDe = new Map<string, string>(actuales.map((c) => [c.id, c.name]));
  for (const f of fichas) nombreDe.set(f.id, f.despues.name);
  const nombre = (id: string | null) => (id ? (nombreDe.get(id) ?? id) : "POR DECIDIR");

  log("\n## 1. Las fichas\n");
  log("| Unidad | Hoy | Queda | Siglas | Dominios | Empresa de HubSpot |");
  log("|---|---|---|---|---|---|");
  for (const f of fichas) {
    const d = f.despues;
    const empresa = f.antes?.hubspotCompanyId && !d.hubspotCompanyId ? `${f.antes.hubspotCompanyId} → (ninguna)` : (d.hubspotCompanyId ?? "(ninguna)");
    const dominios = d.emailDomains?.length ? d.emailDomains.join(", ") : `(los de «${fichas[0]!.despues.name}»)`;
    log(`| ${f.clave}${f.esPrincipal ? " (principal)" : ""} | ${f.antes ? `«${f.antes.name}»` : "(nueva)"} | «${d.name}» | ${(d.siglas ?? []).join(", ")} | ${dominios} | ${empresa} |`);
  }

  /* ── 2. El resolver con las fichas como quedarán ── */
  const clients = clientesDespues(actuales, fichas);
  const ctx: CategorizeContext = {
    clients,
    categories,
    hubspotCompaniesByDomain: new Map(),
    internalDomains: buildInternalDomainsSet(categories),
    clientsByHubspotCompanyId: new Map(
      clients.filter((c) => c.hubspotCompanyId).map((c) => [c.hubspotCompanyId!, { id: c.id, name: c.name, company: c.company }]),
    ),
    ambiguousNameTokens: computeAmbiguousNameTokens(clients),
  };
  const grupo = entidadesDelDominio(sep.principal.id, ctx) ?? abortar("La principal no quedó con unidades: revisa scripts/lib/unidades.ts.");
  const idsAntes = [...idsDeLaSeparacion];
  const idsDespues = new Set(grupo.map((c) => c.id));

  const todas = (
    await prisma.firefliesSession.findMany({
      select: { id: true, title: true, date: true, participants: true, manualClientId: true, resolvedClientId: true },
      orderBy: { date: "asc" },
    })
  ).map((s) => ({ ...s, manualClientId: manoReuniones.get(s.id) ?? s.manualClientId, manualAntes: s.manualClientId }));
  ctx.personasDeEntidades = aprenderPersonasDeEntidades(todas, ctx);
  ctx.hubspotCompaniesByDomain = await buildHubspotDomainMap(todas, ctx.internalDomains);
  const nuevoDe = new Map(todas.map((s) => [s.id, resolveSessionClientId(s, ctx)]));
  const proyectosCrudos = await prisma.project.findMany({
    where: { clientId: { in: idsAntes } },
    select: { id: true, name: true, clientId: true, status: true, serviceType: true },
    orderBy: { name: "asc" },
  });
  const vinculadas = new Set(
    (await prisma.sessionProject.findMany({ where: { projectId: { in: proyectosCrudos.map((p) => p.id) } }, select: { sessionId: true } })).map((v) => v.sessionId),
  );
  const enAlgunaAntes = (id: string | null) => !!id && idsDeLaSeparacion.has(id);
  const sesiones = todas.filter((s) => {
    if (enAlgunaAntes(s.resolvedClientId) || enAlgunaAntes(s.manualClientId) || enAlgunaAntes(s.manualAntes)) return true;
    if (!s.resolvedClientId && !s.manualClientId && vinculadas.has(s.id)) return true;
    const nuevo = nuevoDe.get(s.id);
    return !!nuevo && idsDespues.has(nuevo);
  });
  /* Reuniones de otra ficha que perderían a su dueña por las siglas o el nombre de la empresa: la conservan a mano. */
  const rescatadas = todas.filter((s) => pierdeSuDuena(s, nuevoDe.get(s.id) ?? null, idsDespues));

  const etiquetaPorDecidir = `Por decidir: ${grupo.map((e) => e.name).join(" o ")}`;
  const decisiones = sesiones.map((s) => {
    const nuevo = nuevoDe.get(s.id) ?? null;
    let por: PorDeReunion;
    if (s.manualClientId && idsDespues.has(s.manualClientId)) por = "a-mano";
    else {
      const g = categorizeSession(s, ctx);
      if (g.kind === "client" && idsDespues.has(g.id)) {
        const d = decidirEntreEntidades(s, grupo, ctx);
        por = d.clientId === g.id ? d.por : "nombre";
      } else if (g.kind === "orphan" && g.label === etiquetaPorDecidir) por = decidirEntreEntidades(s, grupo, ctx).por;
      else por = "fuera-del-grupo";
    }
    return { s, nuevo, por };
  });
  const enJuego = decisiones.filter((d) => d.por !== "fuera-del-grupo");
  const dueno = new Map(enJuego.map((d) => [d.s.id, d.nuevo]));

  const gente = new Map<string, number>();
  for (const id of ctx.personasDeEntidades.values()) if (idsDespues.has(id)) gente.set(id, (gente.get(id) ?? 0) + 1);
  log(`\n## 2. Las reuniones: ${enJuego.length}, a qué unidad y por qué\n`);
  log(`Gente aprendida del título de las reuniones: ${[...gente].map(([id, n]) => `${nombre(id)} ${n}`).join(" · ") || "(nadie)"}.\n`);
  const columnas: PorQue[] = ["nombre", "gente", "dominio", "a-mano"];
  log(`| Unidad | ${columnas.map((c) => POR_QUE[c]).join(" | ")} | Total |`);
  log(`|---|${columnas.map(() => "---|").join("")}---|`);
  for (const f of fichas) {
    const de = enJuego.filter((d) => d.nuevo === f.id);
    log(`| ${f.despues.name} | ${columnas.map((c) => de.filter((d) => d.por === c).length).join(" | ")} | **${de.length}** |`);
  }
  const porDecidir = enJuego.filter((d) => d.nuevo === null);
  const motivos = new Map<string, number>();
  for (const d of porDecidir) motivos.set(POR_DE_REUNION[d.por], (motivos.get(POR_DE_REUNION[d.por]) ?? 0) + 1);
  log(`| **Por decidir** | ${[...motivos].map(([m, n]) => `${m}: ${n}`).join(" · ") || "—"} | | | | **${porDecidir.length}** |`);

  const cambian = enJuego.filter((d) => d.nuevo !== d.s.resolvedClientId);
  const seMueven = cambian.filter((d) => d.nuevo !== null);
  log(`\n### Cambian de ficha: ${seMueven.length}\n`);
  for (const d of seMueven) {
    const desde = d.s.resolvedClientId ? nombre(d.s.resolvedClientId) : "sin dueña";
    log(`- ${fecha(d.s.date)} · ${d.s.title.trim()} · ${desde} → **${nombre(d.nuevo)}** (${POR_DE_REUNION[d.por]})`);
  }
  const internos = ctx.internalDomains;
  const deAfuera = (ps: string[]) => [...new Set(ps.map((p) => p.split("@")[1]?.toLowerCase() ?? "").filter((d) => d && !internos.has(d)))].join(", ");
  log(`\n### Por decidir (quedan a la vista en /sessions para asignarlas a mano): ${porDecidir.length}\n`);
  const vinculosDe = new Map<string, { proyecto: string; aMano: boolean }[]>();
  for (const v of await prisma.sessionProject.findMany({
    where: { sessionId: { in: porDecidir.map((d) => d.s.id) }, included: true },
    select: { sessionId: true, source: true, reviewedAt: true, project: { select: { name: true } } },
  })) {
    vinculosDe.set(v.sessionId, [...(vinculosDe.get(v.sessionId) ?? []), { proyecto: v.project.name.trim(), aMano: v.source === "manual" || !!v.reviewedAt }]);
  }
  for (const d of porDecidir) {
    const vs = vinculosDe.get(d.s.id) ?? [];
    const hoy = vs.length ? ` · hoy en ${vs.map((v) => `«${v.proyecto}»${v.aMano ? " (lo puso una persona)" : ""}`).join(", ")}` : "";
    log(`- ${fecha(d.s.date)} · ${d.s.title.trim()} · ${POR_DE_REUNION[d.por]} · ${deAfuera(d.s.participants) || "(solo gente de Smarteam)"}${hoy} · \`${d.s.id}\``);
  }
  const aManoQueQuedan = enJuego.filter((d) => d.por === "a-mano");
  if (aManoQueQuedan.length) {
    log(`\n### Asignadas a mano (no se tocan): ${aManoQueQuedan.length}\n`);
    for (const d of aManoQueQuedan) {
      const sinMano = categorizeSession({ ...d.s, manualClientId: null }, ctx);
      const diria = sinMano.kind === "client" ? sinMano.id : null;
      const nueva = manoReuniones.has(d.s.id) ? " (nueva, de scripts/lib/unidades.ts)" : "";
      const aviso = diria && diria !== d.s.manualClientId ? ` · ⚠ el resolver diría «${nombre(diria)}»` : "";
      log(`- ${fecha(d.s.date)} · ${d.s.title.trim()} · «${nombre(d.s.manualClientId)}»${nueva}${aviso}`);
    }
  }
  if (rescatadas.length) {
    log(`\n### De otra ficha: perderían a su dueña por las siglas, y la conservan a mano: ${rescatadas.length}\n`);
    for (const s of rescatadas) log(`- ${fecha(s.date)} · ${s.title.trim()} · «${nombre(s.resolvedClientId)}»`);
    if (rescatadas.length > TOPE_DE_RESCATES) {
      log(`  ⚠ Son más de ${TOPE_DE_RESCATES}: no son las siglas. ¿HubSpot caído? El --apply no sigue.`);
      if (APPLY) abortar("Demasiadas reuniones de afuera cambiarían.");
    }
  }
  const fuera = decisiones.filter((d) => d.por === "fuera-del-grupo");
  if (fuera.length) {
    log(`\n### El resolver las saca de la empresa (no se tocan: es otra deriva, la mira INV2): ${fuera.length}\n`);
    for (const d of fuera) log(`- ${fecha(d.s.date)} · ${d.s.title.trim()} · hoy «${nombre(d.s.resolvedClientId)}», diría «${nombre(d.nuevo)}»`);
  }

  /* ── 3. Proyectos, propuestas y preventas ── */
  const primarios = await prisma.sessionProject.findMany({
    where: { projectId: { in: proyectosCrudos.map((p) => p.id) }, isPrimary: true, included: true },
    select: { sessionId: true, projectId: true },
  });
  const reunionesDe = new Map<string, (string | null)[]>();
  for (const v of primarios) {
    if (!dueno.has(v.sessionId)) continue;
    reunionesDe.set(v.projectId, [...(reunionesDe.get(v.projectId) ?? []), dueno.get(v.sessionId) ?? null]);
  }
  const destinosP = destinosDeProyectos(
    proyectosCrudos.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId, esDeLaCuenta: p.serviceType === SENTINEL_SERVICE_TYPE })),
    grupo,
    ctx,
    manoProyectos,
    reunionesDe,
  );
  const proyectoA = new Map(destinosP.map((d) => [d.id, d]));

  const [propuestasCrudas, preventasCrudas] = await Promise.all([
    prisma.businessCase.findMany({ where: { clientId: { in: idsAntes } }, select: { id: true, name: true, clientId: true, exploracionId: true, hubspotCompanyId: true } }),
    prisma.exploracionDeVenta.findMany({ where: { clientId: { in: idsAntes } }, select: { id: true, clientId: true, projectId: true } }),
  ]);
  const sesionesDePropuestas = await prisma.businessCaseSession.findMany({
    where: { businessCaseId: { in: propuestasCrudas.map((b) => b.id) }, included: true },
    select: { businessCaseId: true, sessionId: true },
  });
  const duenoFinal = (id: string) => (dueno.has(id) ? (dueno.get(id) ?? null) : (nuevoDe.get(id) ?? null));
  const preventaPorId = new Map(preventasCrudas.map((e) => [e.id, e]));
  const destinosBC = destinosDePropuestas(
    propuestasCrudas.map((b) => ({
      id: b.id,
      name: b.name,
      clientId: b.clientId,
      proyectoDeLaPreventa: (b.exploracionId && preventaPorId.get(b.exploracionId)?.projectId) || null,
      reuniones: sesionesDePropuestas.filter((x) => x.businessCaseId === b.id).map((x) => duenoFinal(x.sessionId)),
    })),
    grupo,
    ctx,
    manoPropuestas,
    proyectoA,
  );
  const propuestaA = new Map(destinosBC.map((d) => [d.id, d]));
  const destinosE = destinosDePreventas(
    preventasCrudas.map((e) => {
      const bc = propuestasCrudas.find((b) => b.exploracionId === e.id);
      const proyecto = proyectosCrudos.find((p) => p.id === e.projectId);
      return { id: e.id, nombre: bc ? `preventa de «${bc.name}»` : proyecto ? `preventa de «${proyecto.name}»` : `preventa ${e.id}`, clientId: e.clientId, projectId: e.projectId, propuestaId: bc?.id ?? null };
    }),
    manoPreventas,
    propuestaA,
    proyectoA,
  );

  const tablaDeDestinos = (titulo: string, ds: Destino[]) => {
    log(`\n## ${titulo}\n`);
    if (!ds.length) return log("(ninguno)");
    log("| Qué | Hoy | Va a | Por qué | ¿Confirmar? |");
    log("|---|---|---|---|---|");
    for (const d of ds) {
      const conf = d.confirmar ? (d.a !== d.de ? "**sí: no se mueve sin `aMano`**" : "sí (se queda)") : "";
      const cuentas = d.reuniones ? Object.entries(d.reuniones).map(([id, n]) => `${n} ${id ? `de ${nombre(id)}` : "por decidir"}`).join(", ") : "";
      const detalle = [d.detalle, cuentas].filter(Boolean).join("; ");
      log(`| ${celda(d.nombre)} \`${d.id}\` | ${nombre(d.de)} | ${d.a === d.de ? "se queda" : `**${nombre(d.a)}**`} | ${POR_QUE[d.por]}${detalle ? ` (${celda(detalle)})` : ""} | ${conf} |`);
    }
  };
  tablaDeDestinos("3. Proyectos", destinosP);
  tablaDeDestinos("4. Propuestas", destinosBC);
  tablaDeDestinos("5. Preventas", destinosE);
  const bloqueados = [...destinosP, ...destinosBC, ...destinosE].filter(bloquea);
  /* Lo que espera confirmación NO se mueve: para el resto del plan, se queda donde está (`destinoEfectivo`). */

  /* ── 4. Vínculos y filas ── */
  const proyectosDespues: ProyectoDelGrupo[] = proyectosCrudos.map((p) => {
    const esDeLaCuenta = p.serviceType === SENTINEL_SERVICE_TYPE;
    return { id: p.id, clientId: destinoEfectivo(proyectoA.get(p.id)!), esDeLaCuenta, esDeTrabajoActivo: !esDeLaCuenta && p.status === "active" };
  });
  const nombreDelProyecto = new Map(proyectosCrudos.map((p) => [p.id, p.name]));
  const vinculos = await prisma.sessionProject.findMany({
    where: { sessionId: { in: [...dueno.keys()] } },
    select: { id: true, sessionId: true, projectId: true, source: true, isPrimary: true },
  });
  const planV = planDeVinculos(vinculos, dueno, proyectosDespues);
  const ahora = new Date();
  const fechaDe = new Map(sesiones.map((s) => [s.id, s.date]));
  const pasadas = new Map([...dueno].filter(([id]) => (fechaDe.get(id) ?? ahora) <= ahora));
  const faltan = vinculosQueFaltan(vinculos, planV, pasadas, proyectosDespues);
  const moverV = planV.filter((p) => p.accion === "mover");
  const soltarV = planV.filter((p) => p.accion === "soltar");
  const promoverV = planV.filter((p) => p.accion === "hacer-principal");
  const titulo = new Map(sesiones.map((s) => [s.id, s.title.trim()]));
  const vinculoPorId = new Map(vinculos.map((v) => [v.id, v]));
  log(`\n## 6. Vínculos reunión–proyecto (${vinculos.length} de estas reuniones)\n`);
  log(`- Se mueven al proyecto equivalente: ${moverV.length}`);
  for (const p of moverV) log(`  - ${titulo.get(vinculoPorId.get(p.id)!.sessionId)}: ${nombreDelProyecto.get(p.de)} → ${nombreDelProyecto.get(p.a)}`);
  const soltarPorMotivo = new Map<string, number>();
  for (const p of soltarV) soltarPorMotivo.set(p.motivo, (soltarPorMotivo.get(p.motivo) ?? 0) + 1);
  log(`- Se sueltan: ${soltarV.length}${soltarV.length ? ` (${[...soltarPorMotivo].map(([m, n]) => `${m}: ${n}`).join(" · ")})` : ""}`);
  for (const p of soltarV.filter((x) => x.motivo !== "ya-tiene-el-equivalente")) {
    const v = vinculoPorId.get(p.id)!;
    log(`  - ${titulo.get(v.sessionId)}: ${nombreDelProyecto.get(v.projectId) ?? "(proyecto de otra ficha)"}${v.source === "manual" ? " (lo puso una persona)" : ""} · ${p.motivo}`);
  }
  log(`- Pasan a principal: ${promoverV.length}`);
  const faltanPorProyecto = new Map<string, number>();
  for (const f of faltan) faltanPorProyecto.set(f.projectId, (faltanPorProyecto.get(f.projectId) ?? 0) + 1);
  log(`- Se crean (reuniones sin vínculo con el único proyecto de trabajo de su ficha): ${faltan.length}${faltan.length ? ` (${[...faltanPorProyecto].map(([id, n]) => `${nombreDelProyecto.get(id)}: ${n}`).join(" · ")})` : ""}`);

  const idsDeProyectos = proyectosCrudos.map((p) => p.id);
  const filtroPor: Record<(typeof LLAVES_DE_FILA)[number], string[]> = {
    projectId: idsDeProyectos,
    sessionId: [...dueno.keys()],
    exploracionId: preventasCrudas.map((e) => e.id),
    businessCaseId: propuestasCrudas.map((b) => b.id),
  };
  const mapaA = (ds: Destino[]) => new Map(ds.map((d) => [d.id, destinoEfectivo(d)]));
  const planesDeFilas: { tabla: string; plan: PlanDeFilaSeparada[]; total: number }[] = [];
  for (const tabla of TABLAS_QUE_CUELGAN) {
    const cols = ESQUEMA.get(tabla)!;
    const llaves = LLAVES_DE_FILA.filter((k) => cols.has(k));
    const or = llaves.filter((k) => filtroPor[k].length).map((k) => ({ [k]: { in: filtroPor[k] } }));
    if (!or.length) continue;
    const filas = (await delegado(prisma, tabla).findMany({
      where: { clientId: { in: idsAntes }, OR: or },
      select: { id: true, clientId: true, ...Object.fromEntries(llaves.map((k) => [k, true])) },
    })) as unknown as FilaParaSeparar[];
    if (!filas.length) continue;
    const plan = destinosDeFilas(filas, {
      fichasDelGrupo: idsDespues,
      proyectoA: mapaA(destinosP),
      preventaA: mapaA(destinosE),
      propuestaA: mapaA(destinosBC),
      dueno,
      proyectos: proyectosDespues,
      projectIdObligatorio: cols.get("projectId") === false,
    });
    if (plan.length) planesDeFilas.push({ tabla, plan, total: filas.length });
  }
  /* Lo que cuelga en otra ficha de una reunión que pasa al grupo: no se mueve, se lista para revisarlo a mano. */
  const llegan = seMueven.filter((d) => !d.s.resolvedClientId || !idsDeLaSeparacion.has(d.s.resolvedClientId)).map((d) => d.s.id);
  const enOtraFicha: { tabla: string; n: number; fichas: string[] }[] = [];
  if (llegan.length) {
    for (const tabla of TABLAS_QUE_CUELGAN) {
      if (!ESQUEMA.get(tabla)!.has("sessionId")) continue;
      const filas = (await delegado(prisma, tabla).findMany({
        where: { sessionId: { in: llegan }, clientId: { notIn: idsAntes } },
        select: { id: true, clientId: true },
      })) as unknown as { id: string; clientId: string }[];
      if (filas.length) enOtraFicha.push({ tabla, n: filas.length, fichas: [...new Set(filas.map((f) => f.clientId))] });
    }
  }

  log("\n## 7. Lo que cuelga con `clientId` (tareas, hechos, alertas, handoff…)\n");
  if (!planesDeFilas.length) log("(nada que mover)");
  else {
    log("| Tabla | Se mueven | Por qué | Se quedan |");
    log("|---|---|---|---|");
  }
  for (const { tabla, plan } of planesDeFilas) {
    const mueven = plan.filter((p) => p.accion === "mover");
    const por = new Map<string, number>();
    for (const p of mueven) if (p.accion === "mover") por.set(p.por, (por.get(p.por) ?? 0) + 1);
    const quedan = new Map<string, number>();
    for (const p of plan) if (p.accion === "queda") quedan.set(p.motivo, (quedan.get(p.motivo) ?? 0) + 1);
    log(`| ${tabla} | ${mueven.length} | ${[...por].map(([m, n]) => `con su ${m}: ${n}`).join(" · ")} | ${[...quedan].map(([m, n]) => `${m}: ${n}`).join(" · ")} |`);
  }
  for (const [t, por] of Object.entries(NO_SE_MUEVEN).slice(4)) log(`- ${t}: no se mueve — ${por}`);
  if (enOtraFicha.length) {
    log("\n### ⚠ Se quedan en otra ficha (revisar a mano)\n");
    log("Salieron de reuniones que ahora pasan a esta empresa, pero cuelgan de otra ficha. No se mueven: sería mover datos");
    log("entre dos clientes. Decidir a mano si son de esta empresa.\n");
    for (const x of enOtraFicha) log(`- ${x.tabla}: ${x.n} (en ${x.fichas.map((id) => nombre(id)).join(", ")})`);
  }

  const fichasQueCambian = fichas.filter(fichaCambia);
  const proyectosQueSeMueven = destinosP.filter(seMueve);
  const propuestasQueSeMueven = destinosBC.filter(seMueve);
  const preventasQueSeMueven = destinosE.filter(seMueve);
  const filasAMover = planesDeFilas.reduce((n, p) => n + p.plan.filter((x) => x.accion === "mover").length, 0);
  const nuevasAMano = enJuego.filter((d) => manoReuniones.has(d.s.id) && d.s.manualAntes !== manoReuniones.get(d.s.id));

  log("\n## En resumen\n");
  log(`- Fichas que cambian: ${fichasQueCambian.length} · reuniones que cambian de dueña: ${cambian.length} (por decidir: ${porDecidir.length}) · asignaciones a mano nuevas: ${nuevasAMano.length} + ${rescatadas.length} de afuera`);
  log(`- Proyectos que se mueven: ${proyectosQueSeMueven.length} · propuestas: ${propuestasQueSeMueven.length} · preventas: ${preventasQueSeMueven.length} · filas: ${filasAMover}`);
  log(`- Vínculos: ${moverV.length} se mueven, ${soltarV.length} se sueltan, ${promoverV.length} pasan a principal, ${faltan.length} se crean`);
  if (bloqueados.length) {
    log(`\n⚠ ${bloqueados.length} cosa(s) que Nexus propone mover sin que lo diga el título ni una persona: NO se mueven hasta que una persona las ponga en \`aMano\` (scripts/lib/unidades.ts):`);
    for (const d of bloqueados) log(`  - ${d.nombre.trim()} \`${d.id}\` → ${nombre(d.a)} (${POR_QUE[d.por]})`);
  }
  /* Una reunión por decidir con un vínculo que tocó una persona: soltarlo tiraría su decisión. Frena el --apply. */
  const conCandado = await prisma.sessionProject.findMany({
    where: { sessionId: { in: porDecidir.map((d) => d.s.id) } },
    select: {
      sessionId: true, projectId: true, source: true, reviewedAt: true, included: true, handoffOverride: true, timelineOverride: true,
      diagnosisOverride: true, planningOverride: true, implementationOverride: true, kickoffOverride: true, explorationOverride: true,
      techRequirementsOverride: true, deliveryOverride: true,
    },
  });
  const esperan = porDecidirConVinculoDeUnaPersona(
    dueno,
    conCandado.map((v) => ({ sessionId: v.sessionId, projectId: v.projectId, conCandado: isLockedLink(v), excluido: !v.included })),
    proyectosDespues,
  );
  if (esperan.length) {
    log(`\n⚠ ${esperan.length} reunión(es) por decidir con un vínculo que puso, revisó o excluyó una persona. El --apply NO sigue hasta que una persona las asigne en \`aMano.reuniones\` (scripts/lib/unidades.ts):`);
    for (const e of esperan) {
      const sugerencia = e.sugerida ? `sugerida: ${fichas.find((f) => f.id === e.sugerida)?.clave ?? nombre(e.sugerida)} (${nombre(e.sugerida)})` : "sin sugerencia";
      log(`  - "${e.sessionId}": «${titulo.get(e.sessionId)}» · ${e.proyectos.map((p) => `«${nombreDelProyecto.get(p)?.trim()}»`).join(", ")} · ${sugerencia}`);
    }
  }

  if (!APPLY) {
    const { dir } = planDeRespaldo(["x"], { script: nombreDelScript(), ahora });
    mkdirSync(dir, { recursive: true });
    const ruta = join(dir, `${clave}-simulacro.md`);
    writeFileSync(ruta, lineas.join("\n") + "\n", "utf8");
    console.log(`\n[tabla] ${ruta}`);
    console.log(`Para aplicarlo (después del SQL y del deploy): ALLOW_PROD_WRITE=1 SIN_RESPALDO=1 npx tsx scripts/separar-en-unidades.ts --empresa ${clave} --apply`);
    return;
  }

  if (esperan.length) abortar(`Hay ${esperan.length} reunión(es) por decidir con un vínculo de una persona: asígnalas en aMano.reuniones antes de aplicar.`);
  const nada =
    !fichasQueCambian.length && !cambian.length && !rescatadas.length && !nuevasAMano.length && !proyectosQueSeMueven.length &&
    !propuestasQueSeMueven.length && !preventasQueSeMueven.length && !planV.length && !faltan.length && !filasAMover;
  if (nada) {
    console.log("\n✓ Ya está separado y todo está donde dice el resolver. Nada que escribir.");
    return;
  }

  /* ── 5. Escribir, con el respaldo de cada fila que se toca ── */
  const filasCompletas: Record<string, unknown[]> = {};
  for (const { tabla, plan } of planesDeFilas) {
    const ids = plan.filter((p) => p.accion === "mover").map((p) => p.id);
    if (ids.length) filasCompletas[tabla] = await delegado(prisma, tabla).findMany({ where: { id: { in: ids } } });
  }
  const idsExistentes = fichas.flatMap((f) => (f.antes ? [f.id] : []));
  const ruta = guardarRespaldoJson({
    separacion: sep,
    fichas: await prisma.client.findMany({ where: { id: { in: idsExistentes } } }),
    proyectos: proyectosQueSeMueven,
    propuestas: await prisma.businessCase.findMany({ where: { id: { in: propuestasQueSeMueven.map((d) => d.id) } } }),
    preventas: preventasQueSeMueven,
    reuniones: [...cambian, ...nuevasAMano].map((d) => ({ id: d.s.id, resolvedClientId: d.s.resolvedClientId, manualClientId: d.s.manualAntes })),
    rescatadas: rescatadas.map((s) => ({ id: s.id, resolvedClientId: s.resolvedClientId, manualClientId: s.manualClientId })),
    vinculos: await prisma.sessionProject.findMany({ where: { id: { in: planV.map((p) => p.id) } } }),
    vinculosCreados: faltan,
    analisisDeVenta: await prisma.analisisDeVenta.findMany({ where: { sessionId: { in: cambian.map((d) => d.s.id) } } }),
    resumenesDeLaCuenta: await prisma.csAccountBrief.findMany({ where: { clientId: { in: idsExistentes } } }),
    filas: filasCompletas,
  });
  console.log(`\n[respaldo] ${ruta}`);

  const primeraVez = fichas.some((f) => !f.esPrincipal && f.antes?.comparteDominioConId !== sep.principal.id);
  const fichaDeLaPrincipal = (await prisma.client.findUnique({ where: { id: sep.principal.id }, select: { ficha: true } }))?.ficha as Record<string, unknown> | null;
  const hecho = await prisma.$transaction(
    async (tx) => {
      const out: string[] = [];
      /* Las fichas: las nuevas nacen primero, y su id reemplaza al del simulacro en todo lo que sigue. */
      const idReal = new Map<string, string>();
      const principal = porId.get(sep.principal.id)!;
      for (const f of fichasQueCambian) {
        const { name, company, emailDomains, siglas, hubspotCompanyId, comparteDominioConId } = f.despues;
        if (!f.antes) {
          const creada = await tx.client.create({
            data: { name, company, emailDomains: emailDomains ?? [], siglas: siglas ?? [], comparteDominioConId, kind: principal.kind, source: "manual" },
            select: { id: true },
          });
          idReal.set(f.id, creada.id);
          out.push(`ficha nueva «${name}» (${creada.id})`);
        } else {
          await tx.client.update({ where: { id: f.id }, data: { name, emailDomains: emailDomains ?? [], siglas: siglas ?? [], hubspotCompanyId, comparteDominioConId } });
          out.push(`«${f.antes.name}» → «${name}»`);
        }
      }
      const id = (x: string | null) => (x ? (idReal.get(x) ?? x) : null);
      if (fichas.some((f) => !f.antes && !idReal.has(f.id))) throw new Error("una unidad nueva no se creó");

      for (const d of proyectosQueSeMueven) await tx.project.update({ where: { id: d.id }, data: { clientId: id(d.a)! } });
      for (const d of propuestasQueSeMueven) {
        /* La propuesta toma la empresa de HubSpot de su unidad (ninguna, si no tiene): con la de la principal, regenerarla
           metería en el prompt la actividad de HubSpot de toda la empresa (el TEC, 29 oct). */
        const empresa = fichas.find((f) => f.id === d.a)?.despues.hubspotCompanyId ?? null;
        await tx.businessCase.update({ where: { id: d.id }, data: { clientId: id(d.a)!, hubspotCompanyId: empresa } });
      }
      for (const d of preventasQueSeMueven) await tx.exploracionDeVenta.update({ where: { id: d.id }, data: { clientId: id(d.a)! } });
      if (proyectosQueSeMueven.length + propuestasQueSeMueven.length + preventasQueSeMueven.length) {
        out.push(`proyectos ${proyectosQueSeMueven.length} · propuestas ${propuestasQueSeMueven.length} · preventas ${preventasQueSeMueven.length}`);
      }

      for (const s of rescatadas) await asignarDuenioManual(s.id, s.resolvedClientId, { origen: "adopcion", actorEmail: null, db: tx });
      for (const d of nuevasAMano) await asignarDuenioManual(d.s.id, id(d.s.manualClientId), { origen: "humano", actorEmail: null, db: tx });
      const porValor = new Map<string | null, string[]>();
      for (const d of cambian) porValor.set(id(d.nuevo), [...(porValor.get(id(d.nuevo)) ?? []), d.s.id]);
      for (const [valor, ids] of porValor) await tx.firefliesSession.updateMany({ where: { id: { in: ids } }, data: { resolvedClientId: valor } });
      out.push(`reuniones ${cambian.length} (a mano: ${nuevasAMano.length} + ${rescatadas.length} de afuera)`);

      for (const p of moverV) await tx.sessionProject.update({ where: { id: p.id }, data: { projectId: p.a } });
      if (soltarV.length) await tx.sessionProject.deleteMany({ where: { id: { in: soltarV.map((p) => p.id) } } });
      if (promoverV.length) await tx.sessionProject.updateMany({ where: { id: { in: promoverV.map((p) => p.id) } }, data: { isPrimary: true } });
      if (faltan.length) {
        const rationale = `Único proyecto de trabajo de la ficha (separación de ${sep.empresa} en unidades, ${fecha(ahora)})`;
        await tx.sessionProject.createMany({ data: faltan.map((f) => ({ ...f, ...VINCULO_NUEVO, rationale })), skipDuplicates: true });
      }
      out.push(`vínculos: ${moverV.length} movidos, ${soltarV.length} soltados, ${promoverV.length} a principal, ${faltan.length} creados`);

      for (const { tabla, plan } of planesDeFilas) {
        const grupos = new Map<string, string[]>();
        for (const p of plan) {
          if (p.accion !== "mover") continue;
          const k = JSON.stringify([id(p.clientId), p.projectId]);
          grupos.set(k, [...(grupos.get(k) ?? []), p.id]);
        }
        let n = 0;
        const conProyecto = ESQUEMA.get(tabla)!.has("projectId");
        for (const [k, ids] of grupos) {
          const [clientId, projectId] = JSON.parse(k) as [string, string | null];
          const r = await delegado(tx, tabla).updateMany({ where: { id: { in: ids } }, data: conProyecto ? { clientId, projectId } : { clientId } });
          n += r.count;
        }
        if (n) out.push(`${tabla} ${n}`);
      }

      /* Lo que se redactó con la cuenta unida: el resumen queda desactualizado (no se borra) y la propuesta pendiente de
         «Información del cliente» de la principal se descarta la primera vez (cita reuniones de todas las unidades). */
      const resumen = await tx.csAccountBrief.updateMany({ where: { clientId: { in: idsExistentes } }, data: { staleAt: ahora } });
      if (resumen.count) out.push(`resúmenes de la cuenta desactualizados: ${resumen.count}`);
      if (primeraVez && fichaDeLaPrincipal?.propuesta) {
        await tx.client.update({ where: { id: sep.principal.id }, data: { ficha: { ...fichaDeLaPrincipal, propuesta: null } as Prisma.InputJsonValue } });
        out.push("propuesta pendiente de «Información del cliente» descartada");
      }
      return out;
    },
    { timeout: 180_000 },
  );
  /* El análisis de venta de la dueña anterior ya no vale (S3, INV57): lo mismo que hace el resolver al cambiar de dueño. */
  await import("@/lib/analizador-venta/ajenos")
    .then((m) => m.soltarAnalisisDeVentaAjenos(cambian.map((d) => d.s.id)))
    .catch((e) => console.warn("⚠ no se pudo soltar el análisis de venta ajeno:", e instanceof Error ? e.message : e));
  console.log(`\n✓ Separado: ${hecho.join(" · ")}.`);
  console.log("Después: npm run check:invariants (INV1 e INV2 tienen que dar verde) y revisa /sessions › «Por decidir».");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
