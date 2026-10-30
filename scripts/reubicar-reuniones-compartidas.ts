/**
 * scripts/reubicar-reuniones-compartidas.ts — cada reunión de un grupo que comparte dominio va a SU entidad, con todo
 * lo que cuelga de ella (2026-10-29, el TEC: «TEC · AE» y «TEC · TAE»).
 *
 * La regla es la del resolver único (lib/sessions/categorize.ts › `decidirEntreEntidades`): el nombre de la reunión,
 * después la gente de cada entidad, y si no hay pista, POR DECIDIR (`resolvedClientId` null, a la vista en /sessions
 * para asignarla a mano). Este script NO decide nada por su cuenta: llama al resolver y escribe lo que dice.
 *
 * Lo que mueve, por cada reunión del grupo (las de `resolvedClientId` o `manualClientId` en una de sus fichas, y las de
 * afuera que el resolver trae: las siglas «AE» y «TAE» valen también para las reuniones internas, «Hand Off | AE»):
 *   · `resolvedClientId` → la entidad nueva (o null si queda por decidir). Lo asignado a mano (`manualClientId`) no se
 *     toca: gana siempre.
 *   · sus vínculos con proyectos (`SessionProject`): al proyecto equivalente de la ficha nueva; los de una reunión por
 *     decidir se sueltan (no alimenta a ningún proyecto hasta que una persona la asigne). La que no quede vinculada al
 *     único proyecto de trabajo de su ficha se vincula, como hace el clasificador: el proyecto lee por vínculo.
 *   · lo que dejó escrito con `clientId` (cada tabla con `clientId` y `sessionId`, leída del schema): hechos, tareas,
 *     pendientes… a la ficha nueva y su proyecto equivalente. Lo de una reunión por decidir se queda y se lista.
 *   La minuta, la lectura y el texto cuelgan solo de la reunión: viajan solos.
 *
 * Una reunión de OTRA ficha que el resolver dejaría sin dueña por las siglas (un título que nombra a dos, «El AE, Bluesat
 * y Ministerio…», empata) conserva a su dueña con `manualClientId`: este script no le quita contexto a nadie de afuera.
 * Se lista, y una persona la puede cambiar en /sessions.
 *
 * ⚠ ORDEN: el SQL 2026-10-29-dominio-compartido.sql → el deploy → scripts/separar-tec.ts → ESTE. Antes de separar (o
 * antes del SQL) el simulacro SIMULA la separación en memoria (scripts/lib/separacion-tec.ts) y lo dice arriba; el
 * `--apply` exige que la separación ya esté aplicada. Después del deploy, no antes (KNOWN-ERRORS: producción
 * re-resuelve con el código desplegado y pisaría un backfill hecho con otro).
 *
 *   npx tsx scripts/reubicar-reuniones-compartidas.ts                                              (simulacro)
 *   ALLOW_PROD_WRITE=1 SIN_RESPALDO=1 npx tsx scripts/reubicar-reuniones-compartidas.ts --apply    (respaldo en JSON)
 * Se puede correr dos veces: la segunda no encuentra nada que mover.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply, imprimirDestino } from "./lib/guard";
import { guardarRespaldoJson } from "./lib/respaldo-json";
import {
  SEPARACION_TEC,
  clientIdTrasSeparar,
  clienteSeparado,
  columnasDelEsquema,
  comparteDominioGuardado,
} from "./lib/separacion-tec";
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
import { buildCategorizeCtx, buildHubspotDomainMap, resolveSessionClientId } from "@/lib/sessions/resolve-client";
import { asignarDuenioManual } from "@/lib/sessions/duenio-manual";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { pierdeSuDuena, planDeFilas, planDeVinculos, vinculosQueFaltan, type ProyectoDelGrupo } from "@/lib/sessions/reubicar-entre-entidades";

const ESQUEMA = columnasDelEsquema();

/** Tablas con `clientId` y `sessionId` que NO van con la reunión, y por qué. Toda otra tabla así se mueve. */
const NO_VAN_CON_LA_REUNION: Readonly<Record<string, string>> = {
  PropuestaDeEmpresa: "es la propuesta de dueño para la reunión: la decide una persona en /sessions",
  AnalisisDeVenta: "el de la dueña anterior se suelta (soltarAnalisisDeVentaAjenos, INV57), no se muda",
};
const TABLAS_POR_REUNION = [...ESQUEMA]
  .filter(([m, cols]) => cols.has("clientId") && cols.has("sessionId") && !(m in NO_VAN_CON_LA_REUNION))
  .map(([m]) => m);

const APPLY = resolverApply({ tablas: ["FirefliesSession", "SessionProject", "AnalisisDeVenta", ...TABLAS_POR_REUNION] });

/** Más que esto no son las siglas: es HubSpot caído u otra deriva, y el `--apply` no sigue. */
const TOPE_DE_RESCATES = 10;

/** Lo mismo que escribe el clasificador en su atajo de «un solo proyecto» (classify-session-project.ts). */
const VINCULO_NUEVO = {
  isPrimary: true,
  source: "agent",
  confidence: 0.7,
  rationale: "Único proyecto de trabajo de la ficha (separación del TEC, 2026-10-29)",
};

type Fila = { id: string; clientId: string; projectId?: string | null; sessionId: string | null };
type Delegado = {
  findMany(a: { where: Record<string, unknown>; select?: Record<string, boolean> }): Promise<Record<string, unknown>[]>;
  updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
};
const delegado = (db: unknown, modelo: string) =>
  (db as Record<string, Delegado>)[modelo.charAt(0).toLowerCase() + modelo.slice(1)]!;

type Por = "a-mano" | "nombre" | "gente" | "dos-nombres" | "gente-de-varias" | "sin-pista" | "fuera-del-grupo";
const POR: Record<Por, string> = {
  "a-mano": "asignada a mano",
  nombre: "por el nombre",
  gente: "por la gente",
  "dos-nombres": "el nombre dice las dos",
  "gente-de-varias": "hay gente de las dos",
  "sin-pista": "sin nombre ni gente conocida",
  "fuera-del-grupo": "el resolver la saca del grupo",
};

const fecha = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  imprimirDestino();
  console.log(APPLY ? "=== APPLY (escribe) ===" : "=== SIMULACRO (no escribe) ===");

  /* ── 1. El contexto del resolver: el real, o la separación del TEC simulada en memoria ── */
  const comparte = await comparteDominioGuardado();
  const separado = comparte.get(SEPARACION_TEC.entidadId) === SEPARACION_TEC.duenaId;
  let ctx: CategorizeContext;
  if (separado) {
    ctx = await buildCategorizeCtx();
  } else {
    if (APPLY) {
      console.error("\n⛔ El TEC todavía no está separado: primero scripts/separar-tec.ts --apply (después del SQL y del deploy).");
      process.exit(1);
    }
    console.log("⚠ El TEC todavía no está separado: SIMULO la separación (scripts/lib/separacion-tec.ts) para mostrar el reparto.");
    const [clientesCrudos, categories] = await Promise.all([
      prisma.client.findMany({
        orderBy: ORDEN_DE_CLIENTES_PARA_ATRIBUIR,
        select: { id: true, name: true, company: true, emailDomains: true, hubspotCompanyId: true, siglas: true },
      }),
      prisma.sessionCategory.findMany({ select: { id: true, name: true, slug: true, domains: true, kind: true, color: true } }),
    ]);
    const clients = clientesCrudos.map((c) => clienteSeparado({ ...c, comparteDominioConId: comparte.get(c.id) ?? null }));
    ctx = {
      clients,
      categories,
      hubspotCompaniesByDomain: new Map(),
      internalDomains: buildInternalDomainsSet(categories),
      clientsByHubspotCompanyId: new Map(
        clients.filter((c) => c.hubspotCompanyId).map((c) => [c.hubspotCompanyId!, { id: c.id, name: c.name, company: c.company }]),
      ),
      ambiguousNameTokens: computeAmbiguousNameTokens(clients),
    };
  }
  const delGrupo = ctx.clients.filter((c) => entidadesDelDominio(c.id, ctx));
  if (delGrupo.length === 0) {
    console.log("\n✓ No hay fichas que compartan dominio. Nada que reubicar.");
    return;
  }
  const idsDelGrupo = delGrupo.map((c) => c.id);
  const nombreDe = new Map(ctx.clients.map((c) => [c.id, c.name]));
  const nombre = (id: string | null) => (id ? (nombreDe.get(id) ?? id) : "POR DECIDIR");

  const todas = await prisma.firefliesSession.findMany({
    select: { id: true, title: true, date: true, participants: true, manualClientId: true, resolvedClientId: true },
    orderBy: { date: "asc" },
  });
  if (!separado) ctx.personasDeEntidades = aprenderPersonasDeEntidades(todas, ctx);
  ctx.hubspotCompaniesByDomain = await buildHubspotDomainMap(todas, ctx.internalDomains);
  /* Las del grupo y las que el resolver trae de afuera: las siglas también deciden las reuniones internas (pasos 2 y 6). */
  const enElGrupo = new Set(idsDelGrupo);
  const nuevoDe = new Map(todas.map((s) => [s.id, resolveSessionClientId(s, ctx)]));
  /* Las que ya están sin dueña pero siguen vinculadas a un proyecto del grupo: la re-resolución de producción pudo
     dejarlas por decidir en el rato entre los dos scripts, y sus vínculos todavía hay que soltarlos. */
  const vinculadas = new Set(
    (await prisma.sessionProject.findMany({ where: { project: { clientId: { in: idsDelGrupo } } }, select: { sessionId: true } })).map((v) => v.sessionId),
  );
  const sesiones = todas.filter((s) => {
    if ((s.resolvedClientId && enElGrupo.has(s.resolvedClientId)) || (s.manualClientId && enElGrupo.has(s.manualClientId))) return true;
    if (!s.resolvedClientId && !s.manualClientId && vinculadas.has(s.id)) return true;
    const nuevo = nuevoDe.get(s.id);
    return !!nuevo && enElGrupo.has(nuevo);
  });
  /* Reuniones de otra ficha que perderían a su dueña por las siglas: se conservan (ver el encabezado). */
  const rescatadas = todas.filter((s) => pierdeSuDuena(s, nuevoDe.get(s.id) ?? null, enElGrupo));
  console.log(`\nFichas del grupo: ${delGrupo.map((c) => `«${c.name}»`).join(" · ")}`);
  const gentePorEntidad = new Map<string, number>();
  for (const id of (ctx.personasDeEntidades ?? new Map<string, string>()).values()) gentePorEntidad.set(id, (gentePorEntidad.get(id) ?? 0) + 1);
  console.log(`Gente conocida de cada entidad: ${[...gentePorEntidad].map(([id, n]) => `${nombre(id)} ${n}`).join(" · ") || "(nadie)"}`);

  /* ── 2. Lo que dice el resolver de cada reunión ── */
  const internos = ctx.internalDomains;
  const deAfuera = (ps: string[]) => ps.filter((p) => !internos.has(p.split("@")[1]?.toLowerCase() ?? "")).join(", ");
  const decisiones = sesiones.map((s) => {
    const nuevo = nuevoDe.get(s.id) ?? null;
    let por: Por;
    if (s.manualClientId && idsDelGrupo.includes(s.manualClientId)) por = "a-mano";
    else {
      const g = categorizeSession(s, ctx);
      if (g.kind === "client" && idsDelGrupo.includes(g.id)) {
        const d = decidirEntreEntidades(s, entidadesDelDominio(g.id, ctx)!, ctx);
        por = d.clientId === g.id ? d.por as Por : "nombre";
      } else if (g.kind === "orphan" && g.label.startsWith("Por decidir")) {
        /* El grupo de ESTA reunión: el de la ficha que tiene su dominio (puede haber más de un grupo). */
        const duena = delGrupo.find((c) => g.domain && effectiveDomainsForClient(c).includes(g.domain));
        const grupo = duena ? entidadesDelDominio(duena.id, ctx) : null;
        por = grupo ? (decidirEntreEntidades(s, grupo, ctx).por as Por) : "sin-pista";
      } else por = "fuera-del-grupo";
    }
    return { s, nuevo, por };
  });

  const resumen = new Map<string, number>();
  for (const d of decisiones) {
    const k = `${nombre(d.nuevo)} · ${POR[d.por]}`;
    resumen.set(k, (resumen.get(k) ?? 0) + 1);
  }
  console.log(`\n── ${sesiones.length} reuniones, según el resolver ──`);
  for (const [k, n] of [...resumen].sort()) console.log(`  ${String(n).padStart(4)}  ${k}`);

  const cambian = decisiones.filter((d) => d.por !== "fuera-del-grupo" && d.nuevo !== d.s.resolvedClientId);
  const entran = cambian.filter((d) => !d.s.resolvedClientId || !enElGrupo.has(d.s.resolvedClientId));
  const porDecidir = decisiones.filter((d) => d.nuevo === null && d.por !== "fuera-del-grupo");
  const fuera = decisiones.filter((d) => d.por === "fuera-del-grupo");

  const seMueven = cambian.filter((x) => x.nuevo !== null);
  console.log(`\n── Cambian de ficha: ${seMueven.length} (${entran.length} entran de afuera del grupo) ──`);
  for (const d of seMueven) {
    const desde = d.s.resolvedClientId ? nombre(d.s.resolvedClientId) : "sin dueña";
    console.log(`  ${fecha(d.s.date)}  ${d.s.title}  ·  ${desde} → ${nombre(d.nuevo)} (${POR[d.por]})`);
  }
  console.log(`\n── Por decidir (para asignar a mano en /sessions): ${porDecidir.length} ──`);
  for (const d of porDecidir) console.log(`  ${fecha(d.s.date)}  ${d.s.title}  ·  ${POR[d.por]}  ·  ${deAfuera(d.s.participants) || "(sin gente de afuera)"}`);
  const aMano = decisiones.filter((d) => d.por === "a-mano");
  if (aMano.length) {
    console.log(`\n── Asignadas a mano (no se tocan): ${aMano.length} ──`);
    for (const d of aMano) {
      const sinMano = categorizeSession({ ...d.s, manualClientId: null }, ctx);
      const diria = sinMano.kind === "client" ? sinMano.id : null;
      const aviso = diria && diria !== d.s.manualClientId ? `  ⚠ el resolver diría «${nombre(diria)}»` : "";
      console.log(`  ${fecha(d.s.date)}  ${d.s.title}  ·  «${nombre(d.s.manualClientId)}»${aviso}`);
    }
  }
  if (rescatadas.length) {
    console.log(`\n── De otra ficha: perderían a su dueña por las siglas, y la conservan a mano: ${rescatadas.length} ──`);
    for (const s of rescatadas) console.log(`  ${fecha(s.date)}  ${s.title}  ·  «${nombre(s.resolvedClientId)}»`);
    if (rescatadas.length > TOPE_DE_RESCATES) {
      console.log(`  ⚠ Son más de ${TOPE_DE_RESCATES}: no son las siglas. ¿HubSpot caído? El --apply no sigue.`);
      if (APPLY) process.exit(1);
    }
  }
  if (fuera.length) {
    console.log(`\n── El resolver las saca del grupo (no se tocan: es otra deriva, la mira INV2): ${fuera.length} ──`);
    for (const d of fuera) console.log(`  ${fecha(d.s.date)}  ${d.s.title}  ·  hoy «${nombre(d.s.resolvedClientId)}», diría «${nombre(d.nuevo)}»`);
  }

  /* ── 3. Lo que cuelga de cada reunión ── */
  const dueno = new Map(decisiones.filter((d) => d.por !== "fuera-del-grupo").map((d) => [d.s.id, d.nuevo]));
  const idsDeSesion = [...dueno.keys()];
  const proyectosCrudos = await prisma.project.findMany({
    where: { clientId: { in: idsDelGrupo } },
    select: { id: true, name: true, clientId: true, status: true, serviceType: true },
  });
  const proyectos: (ProyectoDelGrupo & { name: string })[] = proyectosCrudos.map((p) => {
    const esDeLaCuenta = p.serviceType === SENTINEL_SERVICE_TYPE;
    return {
      id: p.id,
      name: p.name,
      clientId: separado ? p.clientId : clientIdTrasSeparar({ clientId: p.clientId, projectId: p.id }),
      esDeLaCuenta,
      esDeTrabajoActivo: !esDeLaCuenta && p.status === "active",
    };
  });
  const nombreDelProyecto = new Map(proyectos.map((p) => [p.id, p.name]));
  console.log("\n── Proyectos del grupo ──");
  for (const p of proyectos) console.log(`  · «${nombre(p.clientId)}» · ${p.name}${p.esDeLaCuenta ? " (de la cuenta)" : ""}`);

  const vinculos = await prisma.sessionProject.findMany({
    where: { sessionId: { in: idsDeSesion } },
    select: { id: true, sessionId: true, projectId: true, source: true, isPrimary: true },
  });
  const planV = planDeVinculos(vinculos, dueno, proyectos);
  const ahora = new Date();
  const pasadas = new Map(sesiones.filter((s) => s.date <= ahora).map((s) => [s.id, dueno.get(s.id) ?? null]));
  const faltan = vinculosQueFaltan(vinculos, planV, pasadas, proyectos);
  const vinculoPorId = new Map(vinculos.map((v) => [v.id, v]));
  const titulo = new Map(sesiones.map((s) => [s.id, s.title]));
  const moverV = planV.filter((p) => p.accion === "mover");
  const soltarV = planV.filter((p) => p.accion === "soltar");
  const promoverV = planV.filter((p) => p.accion === "hacer-principal");
  console.log(`\n── Vínculos con proyectos (${vinculos.length} de estas reuniones) ──`);
  console.log(`  Se mueven al proyecto equivalente: ${moverV.length}`);
  for (const p of moverV) {
    const v = vinculoPorId.get(p.id)!;
    console.log(`    · ${titulo.get(v.sessionId)}: ${nombreDelProyecto.get(p.de)} → ${nombreDelProyecto.get(p.a)}${v.source === "manual" ? " (lo puso una persona)" : ""}`);
  }
  const soltarPorMotivo = new Map<string, number>();
  for (const p of soltarV) soltarPorMotivo.set(p.motivo, (soltarPorMotivo.get(p.motivo) ?? 0) + 1);
  console.log(`  Se sueltan: ${soltarV.length}${soltarV.length ? `  (${[...soltarPorMotivo].map(([m, n]) => `${m}: ${n}`).join(" · ")})` : ""}`);
  for (const p of soltarV.filter((x) => x.motivo !== "ya-tiene-el-equivalente")) {
    const v = vinculoPorId.get(p.id)!;
    console.log(`    · ${titulo.get(v.sessionId)}: ${nombreDelProyecto.get(v.projectId) ?? "(proyecto de otra ficha)"}${v.source === "manual" ? " (lo puso una persona)" : ""} · ${p.motivo}`);
  }
  console.log(`  Pasan a principal: ${promoverV.length} (perdían su vínculo principal)`);
  const faltanPorProyecto = new Map<string, number>();
  for (const f of faltan) faltanPorProyecto.set(f.projectId, (faltanPorProyecto.get(f.projectId) ?? 0) + 1);
  console.log(`  Se crean (reuniones sin vínculo con el proyecto de su ficha): ${faltan.length}`);
  for (const [id, n] of faltanPorProyecto) console.log(`    · ${nombreDelProyecto.get(id)}: ${n}`);

  const planesDeFilas: { tabla: string; filas: Fila[]; plan: ReturnType<typeof planDeFilas> }[] = [];
  for (const tabla of TABLAS_POR_REUNION) {
    const cols = ESQUEMA.get(tabla)!;
    const conProyecto = cols.has("projectId");
    const crudas = (await delegado(prisma, tabla).findMany({
      where: { sessionId: { in: idsDeSesion } },
      select: { id: true, clientId: true, sessionId: true, ...(conProyecto ? { projectId: true } : {}) },
    })) as Fila[];
    const filas = crudas
      .map((f) => ({ ...f, clientId: separado ? f.clientId : clientIdTrasSeparar(f), projectId: f.projectId ?? null }))
      .filter((f) => enElGrupo.has(f.clientId));
    if (filas.length === 0) continue;
    const plan = planDeFilas(filas, dueno, proyectos, conProyecto && cols.get("projectId") === false, enElGrupo);
    planesDeFilas.push({ tabla, filas, plan });
  }
  console.log("\n── Lo que dejaron escrito estas reuniones ──");
  for (const { tabla, filas, plan } of planesDeFilas) {
    const mueven = plan.filter((p) => p.accion === "mover").length;
    const quedan = plan.filter((p) => p.accion === "queda");
    const motivos = new Map<string, number>();
    for (const q of quedan) if (q.accion === "queda") motivos.set(q.motivo, (motivos.get(q.motivo) ?? 0) + 1);
    console.log(
      `  · ${tabla}: ${filas.length} · se mueven ${mueven}` +
        (quedan.length ? ` · se quedan ${quedan.length} (${[...motivos].map(([m, n]) => `${m}: ${n}`).join(", ")})` : ""),
    );
  }
  for (const [t, por] of Object.entries(NO_VAN_CON_LA_REUNION)) console.log(`  · ${t}: no se mueve — ${por}`);

  const filasAMover = planesDeFilas.reduce((n, p) => n + p.plan.filter((x) => x.accion === "mover").length, 0);
  if (cambian.length === 0 && rescatadas.length === 0 && planV.length === 0 && faltan.length === 0 && filasAMover === 0) {
    console.log("\n✓ Todo está donde dice el resolver. Nada que escribir.");
    return;
  }
  if (!APPLY) {
    console.log("\nPara aplicarlo (después del deploy y de separar-tec):");
    console.log("  ALLOW_PROD_WRITE=1 SIN_RESPALDO=1 npx tsx scripts/reubicar-reuniones-compartidas.ts --apply");
    return;
  }

  /* ── 4. Escribir, con el respaldo de cada fila que se toca ── */
  const filasCompletas: Record<string, unknown[]> = {};
  for (const { tabla, plan } of planesDeFilas) {
    const ids = plan.filter((p) => p.accion === "mover").map((p) => p.id);
    if (ids.length) filasCompletas[tabla] = await delegado(prisma, tabla).findMany({ where: { id: { in: ids } } });
  }
  const ruta = guardarRespaldoJson({
    reuniones: cambian.map((d) => ({ id: d.s.id, resolvedClientId: d.s.resolvedClientId })),
    rescatadas: rescatadas.map((s) => ({ id: s.id, resolvedClientId: s.resolvedClientId, manualClientId: s.manualClientId })),
    vinculos: await prisma.sessionProject.findMany({ where: { id: { in: planV.map((p) => p.id) } } }),
    vinculosCreados: faltan,
    analisisDeVenta: await prisma.analisisDeVenta.findMany({ where: { sessionId: { in: cambian.map((d) => d.s.id) } } }),
    filas: filasCompletas,
  });
  console.log(`\n[respaldo] ${ruta}`);

  const hecho = await prisma.$transaction(
    async (tx) => {
      for (const s of rescatadas) {
        await asignarDuenioManual(s.id, s.resolvedClientId, { origen: "adopcion", actorEmail: null, db: tx });
      }
      const porValor = new Map<string | null, string[]>();
      for (const d of cambian) porValor.set(d.nuevo, [...(porValor.get(d.nuevo) ?? []), d.s.id]);
      for (const [valor, ids] of porValor) {
        await tx.firefliesSession.updateMany({ where: { id: { in: ids } }, data: { resolvedClientId: valor } });
      }
      for (const p of moverV) await tx.sessionProject.update({ where: { id: p.id }, data: { projectId: p.a } });
      if (soltarV.length) await tx.sessionProject.deleteMany({ where: { id: { in: soltarV.map((p) => p.id) } } });
      if (promoverV.length) await tx.sessionProject.updateMany({ where: { id: { in: promoverV.map((p) => p.id) } }, data: { isPrimary: true } });
      if (faltan.length) await tx.sessionProject.createMany({ data: faltan.map((f) => ({ ...f, ...VINCULO_NUEVO })), skipDuplicates: true });
      const out: string[] = [];
      for (const { tabla, plan } of planesDeFilas) {
        const grupos = new Map<string, string[]>();
        for (const p of plan) {
          if (p.accion !== "mover") continue;
          const k = JSON.stringify([p.clientId, p.projectId]);
          grupos.set(k, [...(grupos.get(k) ?? []), p.id]);
        }
        let n = 0;
        const conProyecto = ESQUEMA.get(tabla)!.has("projectId");
        for (const [k, ids] of grupos) {
          const [clientId, projectId] = JSON.parse(k) as [string, string | null];
          const r = await delegado(tx, tabla).updateMany({
            where: { id: { in: ids } },
            data: conProyecto ? { clientId, projectId } : { clientId },
          });
          n += r.count;
        }
        if (n) out.push(`${tabla} ${n}`);
      }
      return out;
    },
    { timeout: 120_000 },
  );
  /* El análisis de venta de la dueña anterior ya no vale (S3, INV57): lo mismo que hace el resolver al cambiar de dueño. */
  await import("@/lib/analizador-venta/ajenos")
    .then((m) => m.soltarAnalisisDeVentaAjenos(cambian.map((d) => d.s.id)))
    .catch((e) => console.warn("⚠ no se pudo soltar el análisis de venta ajeno:", e instanceof Error ? e.message : e));
  console.log(
    `\n✓ ${cambian.length} reunión(es) reubicadas · vínculos: ${moverV.length} movidos, ${soltarV.length} soltados, ${faltan.length} creados · ${hecho.join(" · ") || "sin filas que mover"}.`,
  );
  console.log("Después: npm run check:invariants (INV1 e INV2 tienen que dar verde).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
