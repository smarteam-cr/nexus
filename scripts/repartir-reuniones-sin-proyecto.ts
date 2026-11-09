/**
 * scripts/repartir-reuniones-sin-proyecto.ts — LAS REUNIONES DE UNA FICHA QUE NO TIENEN PROYECTO, a su proyecto, con
 * simulacro y tabla (etapa U6, 2026-11-07).
 *
 * El caso es kölbi: un cliente con tres proyectos (Ventas, Marketing, InfoClic) y 145 reuniones sin proyecto, de
 * septiembre de 2025 a octubre de 2026. Plan: docs/empresas-con-dominio-compartido-plan.md, parte 2, etapa U6;
 * DECISIONS «Una empresa con varias unidades» (decisión 5: kölbi es un cliente con proyectos, no unidades).
 *
 * El orden, el mismo del clasificador (lib/sessions/classify-session-project.ts):
 *   1. El TÍTULO: si nombra a UN solo proyecto de la ficha (lib/sessions/proyecto-por-titulo.ts), es de ese.
 *   2. La IA de siempre, solo con `--con-ia` (llama a Claude por cada reunión que el título no decide).
 *   3. Lo DUDOSO (la IA no propone nada, o lo propone con confianza menor a 0,6) no se escribe: queda en la tabla para
 *      asignarlo a mano en la ficha del cliente.
 *
 * Simulacro por defecto, en SOLO LECTURA: ni el medidor de la IA puede anotar (cada intento deja un aviso). Deja la
 * tabla en `backups/<fecha>-repartir-reuniones-sin-proyecto/<ficha>-con-ia-simulacro.md` (o `-solo-titulo-`) y lo que
 * propone en `<ficha>-con-ia.plan.json`. El `--apply` escribe EXACTAMENTE ese plan (no vuelve a llamar a la IA): lo que
 * una persona vio y confirmó.
 *
 *   npx tsx scripts/repartir-reuniones-sin-proyecto.ts --cliente cmo2esfqu000s8sij55rp7wmi             (solo el título)
 *   npx tsx scripts/repartir-reuniones-sin-proyecto.ts --cliente cmo2esfqu000s8sij55rp7wmi --con-ia     (≈ US$2, 30 min)
 *   ALLOW_PROD_WRITE=1 SIN_RESPALDO=1 npx tsx scripts/repartir-reuniones-sin-proyecto.ts --apply --plan <ruta del .plan.json>
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PIDE_APPLY = process.argv.includes("--apply");
/* ⛔ El simulacro no escribe ni por error: la conexión nace de solo lectura (pg lee PGOPTIONS al abrir cada conexión). */
if (!PIDE_APPLY) {
  process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on"].filter(Boolean).join(" ");
}

import { imprimirDestino, nombreDelScript, planDeRespaldo, resolverApply } from "./lib/guard";
import { guardarRespaldoJson } from "./lib/respaldo-json";
import { prisma } from "@/lib/db/prisma";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import { proyectoQueNombraElTitulo } from "@/lib/sessions/proyecto-por-titulo";
import { classifySessionToProjects, type ClassifyProposal } from "@/lib/sessions/classify-session-project";

const APPLY = resolverApply({ tablas: ["SessionProject"] });

/** Con menos confianza que esto, la propuesta de la IA es dudosa: no se escribe, se asigna a mano. */
const CONFIANZA_MINIMA = 0.6;

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}

type Via = "titulo" | "unico" | "ia" | "dudosa" | "para-la-ia";
const VIA: Record<Via, string> = {
  titulo: "por el título",
  unico: "el único proyecto",
  ia: "la IA",
  dudosa: "dudosa: a mano",
  "para-la-ia": "para la IA (corre con --con-ia)",
};

interface Propuesta {
  sessionId: string;
  fecha: string;
  titulo: string;
  via: Via;
  /** Lo que se escribiría: el principal primero. Vacío si es dudosa o queda para la IA. */
  vinculos: ClassifyProposal[];
  porQue: string;
}

interface Plan {
  clientId: string;
  cliente: string;
  hecho: string;
  propuestas: Propuesta[];
}

const lineas: string[] = [];
const log = (s = "") => {
  lineas.push(s);
  console.log(s);
};
const celda = (s: string) => s.trim().replace(/\|/g, "\\|");

async function main() {
  imprimirDestino();
  if (APPLY) return aplicar();
  const clientId = argumento("--cliente");
  if (!clientId) {
    console.error("⛔ Falta --cliente <id de la ficha>.");
    process.exit(1);
  }
  const conIa = process.argv.includes("--con-ia");
  const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, company: true, siglas: true } });
  if (!cliente) throw new Error(`No existe la ficha ${clientId}.`);
  const proyectos = await prisma.project.findMany({ where: proyectoClasificableWhere({ clientId }), select: { id: true, name: true }, orderBy: { name: "asc" } });
  const nombreDelProyecto = new Map(proyectos.map((p) => [p.id, p.name.trim()]));
  const ahora = new Date();
  const sinProyecto = await prisma.firefliesSession.findMany({
    where: {
      resolvedClientId: clientId,
      date: { lte: ahora },
      projects: { none: { included: true, project: { clientId, esPrueba: false } } },
    },
    select: { id: true, title: true, date: true },
    orderBy: { date: "asc" },
  });

  log(`# Reuniones de «${cliente.name}» sin proyecto — SIMULACRO (no escribe)${conIa ? ", con la IA" : ", solo el título"}`);
  log(`\nProyectos a los que se les puede colgar una reunión: ${proyectos.map((p) => `«${p.name.trim()}»`).join(" · ")}.`);
  log(`Reuniones que ya pasaron y no tienen proyecto: **${sinProyecto.length}**.\n`);
  if (proyectos.length < 2) log("⚠ Con un solo proyecto, el clasificador las vincula solo (no hace falta este script).");

  const propuestas: Propuesta[] = [];
  for (const s of sinProyecto) {
    const base = { sessionId: s.id, fecha: s.date.toISOString().slice(0, 10), titulo: s.title.trim() };
    /* El clasificador en simulacro: el título primero (sin Claude) y, si no decide, la IA, solo con --con-ia. Respeta lo
       que una persona excluyó para esta reunión. */
    const r = await classifySessionToProjects(s.id, clientId, { dryRun: true, soloTitulo: !conIa });
    const vinculos = [...(r.proposals ?? [])].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    const principal = vinculos[0];
    if (r.status === "skipped" && !conIa) {
      const delTitulo = proyectoQueNombraElTitulo(s.title, proyectos, cliente);
      const varios = delTitulo.nombrados.length > 1 ? `el título nombra a ${delTitulo.nombrados.map((n) => `«${nombreDelProyecto.get(n.proyectoId)}»`).join(" y ")}` : "el título no nombra un proyecto entero";
      propuestas.push({ ...base, via: "para-la-ia", vinculos: [], porQue: varios });
    } else if (r.status !== "ok") {
      propuestas.push({ ...base, via: "dudosa", vinculos: [], porQue: `el clasificador no pudo: ${r.reason ?? r.status}` });
    } else if ((r.via === "titulo" || r.via === "unico") && principal) {
      propuestas.push({ ...base, via: r.via, vinculos, porQue: principal.rationale ?? "" });
    } else if (!principal || (principal.confidence ?? 0) < CONFIANZA_MINIMA) {
      const porQue = principal ? `la IA dice «${nombreDelProyecto.get(principal.projectId)}» con ${principal.confidence}: ${principal.rationale ?? ""}` : "la IA no propone ningún proyecto";
      propuestas.push({ ...base, via: "dudosa", vinculos: [], porQue });
    } else {
      propuestas.push({ ...base, via: "ia", vinculos, porQue: `${principal.confidence}: ${principal.rationale ?? ""}` });
    }
  }

  /* ── La tabla ── */
  const decididas: Via[] = conIa ? ["titulo", "unico", "ia"] : ["titulo", "unico"];
  const sinDecidir: Via[] = conIa ? ["dudosa"] : ["dudosa", "para-la-ia"];
  log(`| Proyecto | ${decididas.map((v) => VIA[v]).join(" | ")} | Total |`);
  log(`|---|${decididas.map(() => "---|").join("")}---|`);
  for (const p of proyectos) {
    const suyas = propuestas.filter((x) => decididas.includes(x.via) && x.vinculos[0]?.projectId === p.id);
    log(`| ${celda(p.name)} | ${decididas.map((v) => suyas.filter((x) => x.via === v).length).join(" | ")} | **${suyas.length}** |`);
  }
  for (const v of sinDecidir) log(`| *${VIA[v]}* | ${decididas.map(() => "").join(" | ")} | **${propuestas.filter((x) => x.via === v).length}** |`);

  const trimestre = new Date(ahora.getTime() - 92 * 86_400_000);
  const recientesSinDecidir = propuestas.filter((x) => (x.via === "dudosa" || x.via === "para-la-ia") && new Date(x.fecha) >= trimestre);
  log(`\nDel último trimestre (desde ${trimestre.toISOString().slice(0, 10)}): ${propuestas.filter((x) => new Date(x.fecha) >= trimestre).length} sin proyecto; quedarían sin decidir ${recientesSinDecidir.length}.`);

  for (const v of ["titulo", "unico", "ia", "dudosa", "para-la-ia"] as Via[]) {
    const de = propuestas.filter((x) => x.via === v);
    if (!de.length) continue;
    log(`\n## ${VIA[v]}: ${de.length}\n`);
    for (const x of de) {
      const destino = x.vinculos.length
        ? x.vinculos.map((vv) => `${vv.isPrimary ? "**" : ""}${nombreDelProyecto.get(vv.projectId)}${vv.isPrimary ? "**" : " (secundario)"}`).join(", ")
        : "";
      log(`- ${x.fecha} · ${x.titulo}${destino ? ` → ${destino}` : ""} · ${x.porQue.replace(/\s+/g, " ").slice(0, 220)} · \`${x.sessionId}\``);
    }
  }

  const { dir } = planDeRespaldo(["x"], { script: nombreDelScript(), ahora });
  mkdirSync(dir, { recursive: true });
  const md = join(dir, `${clientId}-${conIa ? "con-ia" : "solo-titulo"}-simulacro.md`);
  writeFileSync(md, lineas.join("\n") + "\n", "utf8");
  const plan: Plan = { clientId, cliente: cliente.name, hecho: ahora.toISOString(), propuestas };
  const json = join(dir, `${clientId}-${conIa ? "con-ia" : "solo-titulo"}.plan.json`);
  writeFileSync(json, JSON.stringify(plan, null, 2), "utf8");
  console.log(`\n[tabla] ${md}\n[plan]  ${json}`);
  console.log(`Para aplicarlo, después de confirmar la tabla: ALLOW_PROD_WRITE=1 SIN_RESPALDO=1 npx tsx scripts/repartir-reuniones-sin-proyecto.ts --apply --plan ${json}`);
}

/** Escribe el plan que una persona confirmó: solo lo del título y lo de la IA con confianza; lo dudoso no se toca. */
async function aplicar() {
  const ruta = argumento("--plan");
  if (!ruta) {
    console.error("⛔ El --apply escribe un plan confirmado: --plan <ruta del .plan.json que dejó el simulacro>.");
    process.exit(1);
  }
  const plan = JSON.parse(readFileSync(ruta, "utf8")) as Plan;
  const aEscribir = plan.propuestas.filter((p) => (p.via === "titulo" || p.via === "unico" || p.via === "ia") && p.vinculos.length > 0);
  /* Los proyectos a los que HOY se les puede colgar una reunión de la ficha: uno que se mudó de ficha, se cerró o se
     marcó de prueba desde el simulacro no recibe nada (una reunión de A en un proyecto de B es lo que prohíbe INV1). */
  const vigentes = new Set(
    (await prisma.project.findMany({ where: proyectoClasificableWhere({ clientId: plan.clientId }), select: { id: true } })).map((p) => p.id),
  );
  const principalDe = (p: Propuesta) => p.vinculos.find((v) => v.isPrimary)?.projectId ?? p.vinculos[0]!.projectId;
  const conProyectoQueYaNoEs = aEscribir.filter((p) => !vigentes.has(principalDe(p)));
  /* Solo las que SIGUEN sin proyecto y siguen siendo de la ficha: lo que alguien vinculó o movió mientras tanto, se respeta. */
  const siguen = new Set(
    (
      await prisma.firefliesSession.findMany({
        where: {
          id: { in: aEscribir.map((p) => p.sessionId) },
          resolvedClientId: plan.clientId,
          projects: { none: { included: true, project: { clientId: plan.clientId, esPrueba: false } } },
        },
        select: { id: true },
      })
    ).map((s) => s.id),
  );
  const tocadas = await prisma.sessionProject.findMany({ where: { sessionId: { in: [...siguen] } } });
  const respaldo = guardarRespaldoJson({ plan: ruta, vinculosQueYaEstaban: tocadas });
  console.log(`[respaldo] ${respaldo}`);
  let reuniones = 0;
  let vinculos = 0;
  for (const p of aEscribir) {
    if (!siguen.has(p.sessionId) || !vigentes.has(principalDe(p))) continue;
    await prisma.$transaction(async (tx) => {
      for (const v of p.vinculos.filter((x) => vigentes.has(x.projectId))) {
        /* Un vínculo apagado por una persona (included=false) no se reabre: el upsert no lo toca. */
        const ya = await tx.sessionProject.findUnique({ where: { sessionId_projectId: { sessionId: p.sessionId, projectId: v.projectId } } });
        if (ya) continue;
        await tx.sessionProject.create({
          data: { sessionId: p.sessionId, projectId: v.projectId, isPrimary: v.isPrimary, source: "agent", confidence: v.confidence, rationale: v.rationale },
        });
        vinculos++;
      }
    });
    reuniones++;
  }
  console.log(`✓ ${reuniones} reunión(es) de «${plan.cliente}» con proyecto (${vinculos} vínculos). Saltadas por haber cambiado: ${aEscribir.length - reuniones}.`);
  for (const p of conProyectoQueYaNoEs) console.log(`  ⚠ ${p.fecha} · ${p.titulo}: su proyecto ya no es de «${plan.cliente}» o se cerró (no se escribe)`);
  console.log(`Quedan a mano: ${plan.propuestas.filter((p) => p.via === "dudosa" || p.via === "para-la-ia").length} (la tabla del simulacro las lista).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
