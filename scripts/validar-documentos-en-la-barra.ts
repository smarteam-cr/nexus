/**
 * scripts/validar-documentos-en-la-barra.ts — ¿LO QUE YA ESTÁ ESCRITO SE VE CON EL CÓDIGO DE ESTA RAMA? SOLO LECTURA.
 *
 * Toma las filas de la base del `.env` (producción) y les pasa la MISMA lógica pura que usa la barra lateral
 * (lib/flow/dropdown-rows.ts, lib/flow/reparto-del-riel.ts, lib/pieces/). Repetible: cuando cambie la barra (SmartLoop), se
 * vuelve a correr y dice lo mismo con la lógica nueva. Lee con SQL directo y en una sesión de solo lectura: el cliente
 * Prisma de la rama pide columnas que producción todavía no tiene.
 *
 *   npx tsx scripts/validar-documentos-en-la-barra.ts [--desde <sha del deploy>] [--salida reporte.json]
 *
 * Desde una PC, nunca desde el VPS: el pooler de transacciones (puerto 6543) no respeta el candado de solo lectura. Las reglas
 * de los cuestionarios y de la exploración viven en components/clients/ProjectCanvasPanel.tsx y acá están copiadas: si cambian
 * allá, hay que cambiarlas acá.
 *
 * Revisa cuatro cosas:
 *   1. Cada documento con contenido de cada proyecto activo: a la vista, plegado o INVISIBLE (sin fila).
 *   2. Lo que entra en el deploy (`--desde`, por defecto el sha de /api/health): que nada escriba fechas, fases ni tareas.
 *   3. Los SQL del deploy: que sean aditivos. Y las planificaciones con rutinas u olas: que sigan teniendo esas secciones.
 *   4. Los enlaces publicados: que cada uno siga llevando a su documento.
 *
 * Sale con código 1 si algo quedó invisible, si un SQL no es aditivo o si algo escribe el cronograma.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

import { buildPieceRows, type CanvasParaFila, type PieceRow, type RowState } from "@/lib/flow/dropdown-rows";
import { estadoEnElRiel, repartirElRiel } from "@/lib/flow/reparto-del-riel";
import { deriveCanvasesConContenido } from "@/lib/pieces/piece-content";
import { mismoDato } from "@/lib/pieces/kickoff-sin-tocar";
import { CANVAS_DEF_BY_SLUG } from "@/lib/canvas/canvas-defs";
import { pieceBySlug } from "@/lib/pieces/registry";
import { PIEZAS_DE_UN_SERVICIO_RECURRENTE, PIEZAS_PROPIAS_DEL_CICLO } from "@/lib/servicios/ciclo";
import { resolvePipeline, SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { SECCIONES_MUDADAS_A_LA_ADOPCION, PLANIFICACION_TEMPLATE } from "@/components/landing/configs/planificacion.defs";
import { CLAVE_DE_LA_PLANTILLA } from "@/lib/entregables/registro";

const PIEZA_CUESTIONARIOS = "questionnaires";

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

interface Canvas extends CanvasParaFila {
  projectId: string;
  sections: unknown;
  disabledAt: Date | null;
  disabledReason: string | null;
  businessCaseId: string | null;
}

interface Proyecto {
  id: string;
  name: string;
  status: string;
  serviceType: string | null;
  hubspotPipelineId: string | null;
  hubspotOwnerEmail: string | null;
  piezasOcultas: string[] | null;
  clientId: string;
  cuenta: string;
}

interface Documento {
  cuenta: string;
  proyecto: string;
  dueno: string | null;
  documento: string;
  donde: "a la vista" | "plegado en «sin anclar»" | "INVISIBLE";
  motivo?: string;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL.");
  const local = /localhost|127\.0\.0\.1/.test(url);
  if (new URL(url).port === "6543") throw new Error("Por el pooler de transacciones (6543) el candado de solo lectura no vale: corre esto desde una PC.");
  const db = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } });
  await db.connect();
  // ⛔ Toda la sesión es de solo lectura: un error de este script no puede escribir.
  await db.query("SET default_transaction_read_only = on");
  const host = new URL(url).host;
  console.log(`Leyendo ${host} (solo lectura)\n`);

  const proyectos = (
    await db.query<Proyecto>(`
      SELECT p.id, p.name, p.status, p."serviceType", p."hubspotPipelineId", p."hubspotOwnerEmail", p."piezasOcultas", p."clientId", c.name AS cuenta
      FROM "Project" p JOIN "Client" c ON c.id = p."clientId"
      WHERE p.status = 'active'`)
  ).rows;
  const ids = proyectos.map((p) => p.id);
  const canvases = (await db.query<Canvas>(`SELECT * FROM "ProjectCanvas" WHERE "projectId" = ANY($1) ORDER BY "order" ASC, "createdAt" ASC`, [ids])).rows;
  const bloques = (
    await db.query<{ canvasId: string; key: string; source: string; data: unknown; slug: string | null }>(
      `SELECT s."canvasId", s.key, b.source, b.data, pc.slug
       FROM "CanvasBlock" b JOIN "CanvasSection" s ON s.id = b."sectionId" JOIN "ProjectCanvas" pc ON pc.id = s."canvasId"
       WHERE pc."projectId" = ANY($1)`,
      [ids],
    )
  ).rows;
  const fases = new Set(
    (await db.query<{ projectId: string }>(`SELECT DISTINCT t."projectId" FROM "ProjectTimeline" t JOIN "TimelinePhase" f ON f."timelineId" = t.id WHERE t."projectId" = ANY($1)`, [ids])).rows.map((r) => r.projectId),
  );
  const exploraciones = (
    await db.query<{ projectId: string; contenido: unknown }>(`SELECT "projectId", contenido FROM "ExploracionDeVenta" WHERE "projectId" = ANY($1) AND "archivadaEn" IS NULL`, [ids])
  ).rows;
  const columnasCuestionario = (await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name = 'Cuestionario'`)).rows.map((r) => r.column_name);
  const cuestionarios = (
    await db.query<{ projectId: string; n: number }>(
      `SELECT "projectId", count(*)::int AS n FROM "Cuestionario" WHERE "projectId" = ANY($1)${columnasCuestionario.includes("archivadoAt") ? ` AND "archivadoAt" IS NULL` : ""}${columnasCuestionario.includes("canvasId") ? ` AND "canvasId" IS NULL` : ""} GROUP BY 1`,
      [ids],
    )
  ).rows;
  const nCuestionarios = new Map(cuestionarios.map((c) => [c.projectId, c.n]));
  const liliana = (await db.query<{ email: string }>(`SELECT email FROM "TeamMember" WHERE name ILIKE 'liliana%'`).catch(() => ({ rows: [] }))).rows.map((r) => r.email.toLowerCase());

  const documentos: Documento[] = [];
  const contenedores: Array<{ cuenta: string; documento: string }> = [];
  const apagados: Array<{ cuenta: string; proyecto: string; documento: string }> = [];

  for (const p of proyectos) {
    const delProyecto = canvases.filter((c) => c.projectId === p.id);
    const cuyosIds = new Set(delProyecto.map((c) => c.id));
    const susBloques = bloques.filter((b) => cuyosIds.has(b.canvasId));
    const conContenido = deriveCanvasesConContenido({
      canvases: delProyecto,
      seccionesConBloques: susBloques.map((b) => ({ canvasId: b.canvasId, key: b.key })),
      canvasesConBloqueGenerado: [...new Set(susBloques.filter((b) => b.source !== "HUMAN").map((b) => b.canvasId))],
      timelineTieneFases: fases.has(p.id),
    });
    const tocados = new Set(
      delProyecto.filter((c) => Array.isArray(c.sections) && (c.sections as Array<{ key?: unknown } | null>).some((s) => s?.key === CLAVE_DE_LA_PLANTILLA)).map((c) => c.id),
    );
    for (const b of susBloques) {
      if (!b.slug || conContenido.has(b.canvasId)) continue;
      if (!mismoDato(b.data, CANVAS_DEF_BY_SLUG[b.slug]?.sections.find((s) => s.key === b.key)?.defaultData)) tocados.add(b.canvasId);
    }

    if (p.serviceType === SENTINEL_SERVICE_TYPE) {
      for (const c of delProyecto) if (conContenido.has(c.id) && c.slug !== "client-info") contenedores.push({ cuenta: p.cuenta, documento: c.slug ?? c.name });
      continue;
    }

    const vivos = delProyecto.filter((c) => !c.disabledAt && c.slug !== "handoff");
    const esRecurrente = !!resolvePipeline(p.hubspotPipelineId)?.servicioRecurrente;
    const sueltos = nCuestionarios.get(p.id) ?? 0;
    const estadoCuestionarios: RowState = sueltos ? "generada" : "vacia";
    const filas: PieceRow[] = buildPieceRows(
      vivos.map((c) => ({ ...c, hasContent: conContenido.has(c.id), tocado: tocados.has(c.id) })),
      {
        sinCanvas: { [PIEZA_CUESTIONARIOS]: estadoCuestionarios, ...(esRecurrente ? Object.fromEntries(PIEZAS_PROPIAS_DEL_CICLO.map((s) => [s, "vacia" as const])) : {}) },
        piezasDelServicio: esRecurrente ? PIEZAS_DE_UN_SERVICIO_RECURRENTE : undefined,
      },
    );
    const exploracionAbierta = exploraciones.some((e) => e.projectId === p.id);
    const ocultas = p.piezasOcultas ?? [];
    const riel = filas.map((row) => ({
      ...row,
      oculta: ocultas.includes(row.slug),
      // Como components/clients/ProjectCanvasPanel.tsx: los cuestionarios y las piezas del ciclo tienen su regla.
      estado:
        row.slug === PIEZA_CUESTIONARIOS
          ? sueltos
            ? ("generada" as const)
            : ("sin_crear" as const)
          : (PIEZAS_PROPIAS_DEL_CICLO as readonly string[]).includes(row.slug)
            ? ("pendiente" as const)
            : estadoEnElRiel(row.slug === "exploration" && exploracionAbierta ? { ...row, conNombre: true } : row, { conVacias: esRecurrente }),
    }));
    const { existentes, ocultas: plegadas } = repartirElRiel(riel);
    const ubicar = (porFila: (f: (typeof riel)[number]) => boolean): Documento["donde"] =>
      existentes.some(porFila) ? "a la vista" : plegadas.some(porFila) ? "plegado en «sin anclar»" : "INVISIBLE";
    const base = { cuenta: p.cuenta, proyecto: p.name, dueno: p.hubspotOwnerEmail };

    for (const c of delProyecto) {
      if (!conContenido.has(c.id)) continue;
      const nombre = pieceBySlug(c.slug ?? "")?.label ?? c.titulo ?? c.name;
      if (c.disabledAt) {
        apagados.push({ cuenta: p.cuenta, proyecto: p.name, documento: nombre });
        continue;
      }
      if (c.slug === "handoff") continue; // Tiene su lugar arriba del panel: no es una fila de la barra.
      const donde = ubicar((f) => f.canvasId === c.id);
      documentos.push({
        ...base,
        documento: nombre,
        donde,
        ...(donde === "INVISIBLE"
          ? { motivo: c.slug && !pieceBySlug(c.slug) ? `pieza que ya no existe («${c.slug}»)` : esRecurrente ? "servicio recurrente: la barra no lista esta pieza" : "sin fila en la barra" }
          : {}),
      });
    }
    if (fases.has(p.id) && !delProyecto.some((c) => c.slug === "timeline" && conContenido.has(c.id))) {
      documentos.push({ ...base, documento: "Cronograma", donde: ubicar((f) => f.slug === "timeline") });
    }
    if (exploracionAbierta && !delProyecto.some((c) => c.slug === "exploration" && conContenido.has(c.id))) {
      const conAlgo = exploraciones.some((e) => e.projectId === p.id && JSON.stringify(e.contenido ?? {}).length > 400);
      if (conAlgo) documentos.push({ ...base, documento: "Exploración (lienzo)", donde: ubicar((f) => f.slug === "exploration") });
    }
    if (sueltos) documentos.push({ ...base, documento: "Cuestionarios", donde: ubicar((f) => f.slug === PIEZA_CUESTIONARIOS) });
  }

  const invisibles = documentos.filter((d) => d.donde === "INVISIBLE");
  const plegados = documentos.filter((d) => d.donde !== "INVISIBLE" && d.donde !== "a la vista");
  const porNombre = documentos.filter((d) => /cemaco/i.test(d.cuenta) || (d.dueno && liliana.includes(d.dueno.toLowerCase())));
  console.log(`1. DOCUMENTOS: ${documentos.length} con contenido en ${proyectos.length} proyectos activos · a la vista ${documentos.length - invisibles.length - plegados.length} · plegados ${plegados.length} · INVISIBLES ${invisibles.length}`);
  for (const d of invisibles) console.log(`   ✗ ${d.cuenta} › ${d.proyecto} › ${d.documento} — ${d.motivo}`);
  for (const d of plegados) console.log(`   · plegado: ${d.cuenta} › ${d.proyecto} › ${d.documento}`);
  console.log(`   Cemaco y los proyectos de Liliana Moreno (${porNombre.length} documentos):`);
  for (const d of porNombre) console.log(`     ${d.donde === "a la vista" ? "✓" : "✗"} ${d.cuenta} › ${d.proyecto} › ${d.documento} — ${d.donde}${d.motivo ? ` (${d.motivo})` : ""}`);
  if (contenedores.length) console.log(`   En «Información del cliente», sin barra de proyecto, igual que hoy: ${contenedores.map((c) => `${c.cuenta} (${c.documento})`).join(", ")}`);
  if (apagados.length) console.log(`   Apagados a propósito, igual que hoy: ${apagados.map((a) => `${a.cuenta} › ${a.documento}`).join(", ")}`);

  // ── 2 y 3. Lo que entra en el deploy ─────────────────────────────────────────────────────────────────────────────────
  const desde =
    arg("desde") ??
    (await fetch("https://nexus.smarteamcr.com/api/health")
      .then((r) => r.json() as Promise<{ sha?: string }>)
      .then((j) => j.sha ?? null)
      .catch(() => null));
  if (!desde) throw new Error("Pasa --desde <sha>: no se pudo leer el sha de producción.");
  const git = (c: string) => execSync(`git ${c}`, { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 });
  // Las pruebas siembran fases y fechas en su base: no son lo que entra al deploy.
  const lineasNuevas = git(`diff ${desde}...HEAD -- . ":(exclude)*.test.ts"`).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  const escribeCronograma = lineasNuevas.filter(
    (l) =>
      /(timelinePhase|timelineTask)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(l) ||
      /projectTimeline\.(update|updateMany|upsert)\b/.test(l) ||
      /\banchorStartDate\s*[:=][^=]/.test(l) ||
      /(UPDATE|DELETE FROM|INSERT INTO)\s+"(TimelinePhase|TimelineTask|ProjectTimeline)"/i.test(l),
  );
  console.log(`\n2. CRONOGRAMAS (${desde}..HEAD): ${escribeCronograma.length} líneas nuevas que escriben fechas, fases o tareas`);
  for (const l of escribeCronograma) console.log(`   ✗ ${l.slice(0, 160)}`);

  const sqls = git(`diff --name-only --diff-filter=AM ${desde}...HEAD -- scripts/sql`).split("\n").filter(Boolean);
  const NO_ADITIVO = /\b(DROP\s+(TABLE|COLUMN|TYPE)|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN|DROP\s+CONSTRAINT|RENAME\s+(TO|COLUMN))\b/i;
  const sinComentarios = (s: string) => s.replace(/--.*$/gm, "");
  const noAditivos: string[] = [];
  const updates: string[] = [];
  console.log(`\n3. SQL DEL DEPLOY: ${sqls.length} archivos`);
  for (const f of sqls) {
    const texto = sinComentarios(readFileSync(f, "utf8"));
    for (const linea of texto.split("\n")) {
      // Renombrar un ÍNDICE no toca datos (el del 2026-10-30 lo hace para conservar el nombre de la regla).
      if (NO_ADITIVO.test(linea) && !/ALTER\s+INDEX/i.test(linea)) noAditivos.push(`${f}: ${linea.trim()}`);
      if (/^\s*UPDATE\s/i.test(linea)) updates.push(`${f}: ${linea.trim()}`);
    }
  }
  for (const n of noAditivos) console.log(`   ✗ no aditivo: ${n}`);
  for (const u of updates) console.log(`   · escribe filas (mirar que sea solo en columnas nuevas): ${u}`);
  if (!noAditivos.length) console.log("   ✓ Nada borra, renombra ni cambia columnas o tablas.");

  const defsDeLaPlanificacion = new Set(PLANIFICACION_TEMPLATE.sections.map((s) => s.key));
  const mudadas = new Set<string>(SECCIONES_MUDADAS_A_LA_ADOPCION);
  const conRutinas = bloques.filter((b) => b.slug === "planning" && mudadas.has(b.key) && JSON.stringify(b.data ?? {}).length > 60);
  const nombreDe = (canvasId: string) => {
    const c = canvases.find((x) => x.id === canvasId);
    const p = proyectos.find((x) => x.id === c?.projectId);
    return `${p?.cuenta} › ${p?.name}`;
  };
  console.log(`   Planificaciones con rutinas u olas: ${conRutinas.length} secciones`);
  for (const b of conRutinas) {
    const c = canvases.find((x) => x.id === b.canvasId);
    const oculta = Array.isArray(c?.sections) && (c.sections as Array<{ key?: string; hidden?: boolean } | null>).some((s) => s?.key === b.key && s?.hidden);
    console.log(`   ${defsDeLaPlanificacion.has(b.key) && !oculta ? "✓" : "✗"} ${nombreDe(b.canvasId)}: ${b.key}${oculta ? " (oculta)" : ""}`);
  }

  // ── 4. Los enlaces publicados ────────────────────────────────────────────────────────────────────────────────────────
  const cambiosExternos = git(`diff --name-only ${desde}...HEAD -- app/external app/api/external app/print middleware.ts lib/external`).split("\n").filter(Boolean);
  const accesos = (
    await db.query<{ total: number; vivos: number }>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE "revokedAt" IS NULL)::int AS vivos FROM "ProjectExternalAccess"`).catch(() => ({ rows: [{ total: 0, vivos: 0 }] }))
  ).rows[0];
  const docs = (
    await db.query<{ id: string; cuenta: string; projectId: string | null; disabledAt: Date | null; slug: string | null; publicado: boolean }>(`
      SELECT a.id, c.name AS cuenta, pc."projectId", pc."disabledAt", pc.slug, (a."revokedAt" IS NULL) AS publicado
      FROM "AccesoAlDocumento" a JOIN "ProjectCanvas" pc ON pc.id = a."canvasId" JOIN "Client" c ON c.id = a."clientId"`)
  ).rows;
  const docsVivos = docs.filter((d) => d.publicado);
  const rotos = docsVivos.filter((d) => d.disabledAt);
  console.log(`\n4. ENLACES: ${accesos?.vivos ?? 0} accesos de proyecto vivos · ${docsVivos.length} enlaces de documento vivos · ${rotos.length} a un documento apagado`);
  console.log(`   Archivos de la superficie externa que cambian: ${cambiosExternos.join(", ") || "ninguno"}`);
  for (const r of rotos) console.log(`   ✗ ${r.cuenta}: enlace a un documento apagado`);

  const salida = arg("salida");
  if (salida) writeFileSync(salida, JSON.stringify({ desde, documentos, contenedores, apagados, escribeCronograma, noAditivos, updates, accesos, enlaces: docsVivos.length }, null, 1));
  await db.end();
  const mal = invisibles.length + escribeCronograma.length + noAditivos.length + rotos.length;
  console.log(mal ? `\n✗ ${mal} cosas por revisar.` : "\n✓ Nada queda invisible y nada de esto toca lo ya generado.");
  process.exit(mal ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
