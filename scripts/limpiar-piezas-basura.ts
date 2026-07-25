/**
 * scripts/limpiar-piezas-basura.ts — LIMPIEZA de las tres decisiones de negocio de F2.
 *
 *   A) Borrar los canvases de Diagnóstico y Planificación que están vacíos. Se decidió
 *      que dejen de crearse solos (se generaban en los 118 proyectos y tienen contenido
 *      en 1 cada uno), y que los existentes se retiren porque son ruido en el dropdown.
 *   B) Borrar los proyectos "Proyecto principal" que quedaron como cáscara vacía.
 *   C) Activar la pieza técnica en los proyectos con alcance técnico que se quedaron sin
 *      ella (la condición se evaluaba UNA vez, durante el handoff).
 *
 * ── VACÍO NO ES "0 BLOQUES" ────────────────────────────────────────────────────
 * Contar solo bloques haría desaparecer trabajo real. Un canvas también "tiene algo"
 * si el CSE renombró un título de cara al cliente, si acomodó la grilla, si tiene
 * cards asociadas o si YA SE PUBLICÓ al cliente (el snapshot es lo que el cliente ve;
 * borrarlo rompe un link que puede estar en el correo de alguien). Este script exige
 * que TODAS esas señales estén en cero, y lista una por una las que no lo estén para
 * que la decisión de tocarlas sea a mano.
 *
 * Uso:
 *   npx tsx scripts/limpiar-piezas-basura.ts            → DRY-RUN (no escribe nada)
 *   npx tsx scripts/limpiar-piezas-basura.ts --apply    → aplica
 *   ... --solo=piezas|proyectos|tecnica                 → una parte a la vez
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import { hasTechnicalScope } from "../lib/tags/catalog";
import { slugForCanvas } from "../lib/pieces/registry";
import {
  DESARROLLO_CANVAS,
  KICKOFF_CANALES_DEFAULT,
  KICKOFF_CIERRE_DEFAULT,
  DESARROLLO_CIERRE_DEFAULT,
  EXPLORACION_CIERRE_DEFAULT,
} from "../lib/canvas/canvas-defs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const APPLY = process.argv.includes("--apply");
const SOLO = process.argv.find((a) => a.startsWith("--solo="))?.split("=")[1] ?? "todo";
const hace = (parte: string) => SOLO === "todo" || SOLO === parte;

const SENTINEL = "__strategy__";
/**
 * "Proyecto real" = todo lo que no es el pseudo-proyecto de Información del cliente.
 * OJO con la forma ingenua `{ serviceType: { not: SENTINEL } }`: en SQL `NULL <> 'x'`
 * es NULL, así que descarta también los 44 proyectos con serviceType NULL — que SÍ son
 * proyectos. Escrito mal, este script reportaría 0 candidatos y parecería que no hay
 * nada que limpiar.
 */
const PROYECTO_REAL: Prisma.ProjectWhereInput = {
  OR: [{ serviceType: null }, { serviceType: { not: SENTINEL } }],
};
/** Las piezas que se retiran del dropdown por decisión de negocio. */
const PIEZAS_A_RETIRAR = ["diagnosis", "planning"];

/** Señales de que un canvas tiene algo adentro. Todas en cero = cáscara. */
interface Senales {
  bloques: number;
  cards: number;
  titulosEditados: number;
  grillaAcomodada: number;
  publicado: boolean;
}
const vacio = (s: Senales) =>
  s.bloques === 0 && s.cards === 0 && s.titulosEditados === 0 && s.grillaAcomodada === 0 && !s.publicado;
const describir = (s: Senales) =>
  [
    s.bloques && `${s.bloques} bloques con texto`,
    s.cards && `${s.cards} cards`,
    s.titulosEditados && `${s.titulosEditados} títulos editados`,
    s.grillaAcomodada && `${s.grillaAcomodada} grillas acomodadas`,
    s.publicado && "PUBLICADO al cliente",
  ]
    .filter(Boolean)
    .join(", ");

/**
 * Los valores con los que NACE un bloque de plantilla. Un bloque que sigue igual a su
 * default no es trabajo de nadie: es el andamiaje del seed.
 *
 * Esto no es un detalle: los 43 "Proyecto principal" tienen 215 bloques entre todos, y
 * los 215 son exactamente estos — `{"members":[]}`, `{"intro":"","options":[],...}` y el
 * bloque de canales con los datos de contacto de Smarteam que trae la plantilla. Contarlos
 * como contenido daba "43 proyectos con contenido" y frenaba una limpieza legítima;
 * ignorar el `data` a secas habría borrado trabajo real en otro proyecto.
 */
/**
 * Comparación CANÓNICA (llaves ordenadas). Postgres devuelve el JSON con el orden de
 * llaves con que se guardó, que no es el del objeto literal en TypeScript: el bloque de
 * cierre guardado sale `eyebrow, subhead, headline, …` y la constante es
 * `eyebrow, headline, subhead, …`. Comparados con JSON.stringify a secas se ven
 * DISTINTOS y cada bloque de plantilla pasaría por trabajo humano.
 */
function canonico(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`)
    .join(",")}}`;
}

const DEFAULTS = new Set(
  [KICKOFF_CANALES_DEFAULT, KICKOFF_CIERRE_DEFAULT, DESARROLLO_CIERRE_DEFAULT, EXPLORACION_CIERRE_DEFAULT].map(canonico),
);

/** ¿Hay alguna hoja con algo escrito? (string no vacío, número, o true). */
function tieneHojaConAlgo(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return true;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.some(tieneHojaConAlgo);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).some(tieneHojaConAlgo);
  return false;
}

/** Un bloque cuenta como CONTENIDO si alguien escribió algo que la plantilla no traía. */
function bloqueTieneSustancia(b: { content: string | null; data: unknown }): boolean {
  if ((b.content ?? "").trim().length > 0) return true;
  if (b.data == null) return false;
  if (DEFAULTS.has(canonico(b.data))) return false; // idéntico a la plantilla
  return tieneHojaConAlgo(b.data);
}

async function senalesDe(canvasIds: string[]): Promise<Map<string, Senales>> {
  const m = new Map<string, Senales>();
  for (const id of canvasIds) m.set(id, { bloques: 0, cards: 0, titulosEditados: 0, grillaAcomodada: 0, publicado: false });

  const secciones = await prisma.canvasSection.findMany({
    where: { canvasId: { in: canvasIds } },
    select: {
      canvasId: true,
      titleOverride: true,
      eyebrowOverride: true,
      layout: true,
      blocks: { select: { content: true, data: true } },
    },
  });
  for (const s of secciones) {
    const t = m.get(s.canvasId)!;
    t.bloques += s.blocks.filter(bloqueTieneSustancia).length;
    if (s.titleOverride || s.eyebrowOverride) t.titulosEditados++;
    if (s.layout && Array.isArray(s.layout) && s.layout.length > 0) t.grillaAcomodada++;
  }

  const cards = await prisma.clientContextCard.groupBy({
    by: ["canvasId"],
    where: { canvasId: { in: canvasIds } },
    _count: { _all: true },
  });
  for (const c of cards) if (c.canvasId) m.get(c.canvasId)!.cards = c._count._all;

  const pubs = await prisma.projectCanvas.findMany({
    where: { id: { in: canvasIds }, publishedSnapshot: { not: Prisma.DbNull } },
    select: { id: true },
  });
  for (const p of pubs) m.get(p.id)!.publicado = true;

  return m;
}

// ── A) Piezas que se retiran ────────────────────────────────────────────────────
async function limpiarPiezas() {
  const canvases = await prisma.projectCanvas.findMany({
    where: { projectId: { not: null }, slug: { in: PIEZAS_A_RETIRAR } },
    select: { id: true, slug: true, name: true, project: { select: { name: true, client: { select: { name: true } } } } },
  });
  console.log(`\n══ A) Piezas a retirar (${PIEZAS_A_RETIRAR.join(", ")}): ${canvases.length} canvases`);
  const senales = await senalesDe(canvases.map((c) => c.id));

  const borrables = canvases.filter((c) => vacio(senales.get(c.id)!));
  const conAlgo = canvases.filter((c) => !vacio(senales.get(c.id)!));
  console.log(`   vacíos (se borran)     : ${borrables.length}`);
  console.log(`   CON contenido (se dejan): ${conAlgo.length}`);
  for (const c of conAlgo) {
    const p = c.project;
    console.log(`     · ${c.name} — ${p?.client?.name ?? "?"} / ${p?.name ?? "?"}  → ${describir(senales.get(c.id)!)}`);
  }

  if (!APPLY) return;
  const r = await prisma.projectCanvas.deleteMany({ where: { id: { in: borrables.map((c) => c.id) } } });
  console.log(`   ✔ borrados: ${r.count}`);
}

// ── B) Proyectos cáscara ────────────────────────────────────────────────────────
async function limpiarProyectos() {
  const candidatos = await prisma.project.findMany({
    where: { name: "Proyecto principal", ...PROYECTO_REAL },
    select: {
      id: true,
      name: true,
      status: true,
      hubspotServiceId: true,
      hubspotDealId: true,
      tags: true,
      client: { select: { name: true } },
      canvases: { select: { id: true } },
      _count: { select: { sessions: true, canvases: true } },
    },
  });
  console.log(`\n══ B) Proyectos "Proyecto principal": ${candidatos.length}`);

  // Un proyecto solo se borra si NINGUNA de sus piezas tiene contenido y no está
  // atado a nada de afuera (HubSpot, sesiones, cronograma, handoff, cobranza).
  const todosLosCanvas = candidatos.flatMap((p) => p.canvases.map((c) => c.id));
  const senales = await senalesDe(todosLosCanvas);
  // BusinessCase NO se chequea por projectId: esa FK todavía no existe (la agrega F5).
  // Hoy una propuesta se ata al proyecto por cliente + deal de HubSpot, y el deal ya se
  // mira más abajo — un proyecto sin deal no puede tener propuesta colgando.
  const [conTimeline, conHandoff] = await Promise.all([
    prisma.projectTimeline.findMany({ where: { projectId: { in: candidatos.map((p) => p.id) } }, select: { projectId: true } }),
    prisma.handoff.findMany({ where: { projectId: { in: candidatos.map((p) => p.id) } }, select: { projectId: true } }),
  ]);
  const conAlgoExterno = new Set([
    ...conTimeline.map((t) => t.projectId),
    ...conHandoff.map((h) => h.projectId),
  ]);

  const borrables: typeof candidatos = [];
  const seDejan: Array<{ p: (typeof candidatos)[number]; motivo: string }> = [];
  for (const p of candidatos) {
    const motivos: string[] = [];
    if (p._count.sessions > 0) motivos.push(`${p._count.sessions} sesiones`);
    if (p.hubspotServiceId) motivos.push("ligado a servicio de HubSpot");
    if (p.hubspotDealId) motivos.push("ligado a deal de HubSpot");
    if ((p.tags ?? []).length > 0) motivos.push(`tags [${p.tags.join(", ")}]`);
    if (conAlgoExterno.has(p.id)) motivos.push("tiene cronograma/handoff/propuesta");
    const conContenido = p.canvases.filter((c) => !vacio(senales.get(c.id)!));
    if (conContenido.length)
      motivos.push(conContenido.map((c) => `${c.id.slice(-6)}: ${describir(senales.get(c.id)!)}`).join(" | "));
    if (motivos.length) seDejan.push({ p, motivo: motivos.join(" · ") });
    else borrables.push(p);
  }
  console.log(`   cáscaras (se borran)   : ${borrables.length}  (${borrables.reduce((n, p) => n + p._count.canvases, 0)} canvases)`);
  console.log(`   con algo (se dejan)    : ${seDejan.length}`);
  for (const { p, motivo } of seDejan) console.log(`     · ${p.client?.name ?? "?"} → ${motivo}`);

  if (!APPLY) return;
  const ids = borrables.map((p) => p.id);
  // Las corridas de agente NO se van con el proyecto: `AgentRun.projectId` cascadea, así
  // que borrar el proyecto se llevaría la bitácora. Se desvinculan primero (el campo es
  // nullable) y quedan colgando del CLIENTE, que es donde tienen sentido igual. Es una
  // sola fila hoy — un handoff de abril sobre una cáscara — pero la bitácora es
  // justamente lo que F3 viene a construir: no se tira historia para limpiar ruido.
  const sueltas = await prisma.agentRun.updateMany({
    where: { projectId: { in: ids } },
    data: { projectId: null },
  });
  if (sueltas.count) console.log(`   · corridas de agente preservadas (sueltas del proyecto): ${sueltas.count}`);
  // Cascada del schema: Project → ProjectCanvas → CanvasSection → CanvasBlock.
  const r = await prisma.project.deleteMany({ where: { id: { in: ids } } });
  console.log(`   ✔ proyectos borrados: ${r.count}`);
}

// ── C) Activar la pieza técnica donde falta ─────────────────────────────────────
async function activarTecnica() {
  const proyectos = await prisma.project.findMany({
    where: PROYECTO_REAL,
    select: { id: true, name: true, tags: true, client: { select: { name: true } }, canvases: { select: { slug: true, name: true } } },
  });
  const faltantes = proyectos.filter(
    (p) => hasTechnicalScope(p.tags ?? []) && !p.canvases.some((c) => slugForCanvas(c) === "tech-requirements"),
  );
  console.log(`\n══ C) Proyectos con alcance técnico SIN la pieza: ${faltantes.length}`);
  for (const p of faltantes) console.log(`     · ${p.client?.name ?? "?"} / ${p.name}`);

  if (!APPLY) return;
  // Se crea la pieza VACÍA (fila + secciones canónicas). NO se dispara el agente: la
  // generación borra todos los bloques de cada sección, así que dispararla en lote
  // sobre 13 proyectos sería escribir contenido que nadie pidió ni revisó.
  const { createDesarrolloCanvas } = await import("../lib/canvas/default-canvases");
  let n = 0;
  for (const p of faltantes) {
    await createDesarrolloCanvas(p.id);
    n++;
  }
  console.log(`   ✔ piezas "${DESARROLLO_CANVAS.name}" creadas (vacías): ${n}`);
}

async function main() {
  console.log(APPLY ? "MODO: APLICAR (escribe en la base)" : "MODO: DRY-RUN (no escribe nada)");
  if (hace("piezas")) await limpiarPiezas();
  if (hace("proyectos")) await limpiarProyectos();
  if (hace("tecnica")) await activarTecnica();
  if (!APPLY) console.log("\nNada se escribió. Repetir con --apply para aplicar.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
