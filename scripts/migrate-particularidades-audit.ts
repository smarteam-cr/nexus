/**
 * scripts/migrate-particularidades-audit.ts
 *
 * AUDITORÍA (solo lee y exporta — NO borra, NO aplica, NO convierte).
 *
 * Bajo el eje DESTINO (ver docs/DECISIONS.md), estas particularidades ya NO se crearían:
 *   - kind = SOLICITUD (un insumo del cliente es una tarea party=CLIENTE, no una particularidad).
 *   - kind = ATRASO con weeksImpact NULL (un atraso sin corrimiento cuantificado no es una desviación).
 *
 * Este script las LISTA con el contexto para decidir CASO POR CASO qué hacer con cada una
 * (convertir a tarea party=CLIENTE, cuantificar el ATRASO, dejarla, o borrarla a mano). En especial:
 *   - `visibleExternal`: si es true, el cliente YA la ve → borrar removería contenido visible.
 *   - `clientTaskMatch`: heurística — ¿hay una tarea party=CLIENTE en el cronograma que se le parezca?
 *     (si NO, borrarla perdería el insumo, que no está capturado en ningún otro lado.)
 *
 * NO muta producción. Exporta un JSON legible + imprime la tabla por stdout.
 *
 * Uso: npx tsx scripts/migrate-particularidades-audit.ts
 *      AUDIT_OUT=/ruta/salida.json npx tsx scripts/migrate-particularidades-audit.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const STOP = new Set([
  "para", "que", "con", "los", "las", "del", "una", "por", "sobre", "entre", "como", "sus",
  "the", "and", "for", "con", "sin", "más", "menos", "este", "esta", "esos", "esas",
]);

/** Tokens significativos (minúsculas, sin acentos, ≥4 chars, sin stopwords). */
function tokens(s: string): Set<string> {
  const norm = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/gi, " ");
  return new Set(
    norm
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}

async function main() {
  const parts = await prisma.particularidad.findMany({
    where: { OR: [{ kind: "SOLICITUD" }, { AND: [{ kind: "ATRASO" }, { weeksImpact: null }] }] },
    select: {
      id: true,
      kind: true,
      party: true,
      title: true,
      weeksImpact: true,
      visibleExternal: true,
      occurredAt: true,
      timeline: { select: { id: true, projectId: true, project: { select: { name: true } } } },
    },
    orderBy: { occurredAt: "desc" },
  });

  // Tareas party=CLIENTE por timeline (para el match), cargadas una vez por timeline involucrado.
  const timelineIds = [...new Set(parts.map((p) => p.timeline?.id).filter((x): x is string => !!x))];
  const clientTasksByTimeline = new Map<string, string[]>();
  for (const tlId of timelineIds) {
    const tl = await prisma.projectTimeline.findUnique({
      where: { id: tlId },
      select: { phases: { select: { tasks: { where: { party: "CLIENTE" }, select: { title: true } } } } },
    });
    clientTasksByTimeline.set(tlId, tl?.phases.flatMap((ph) => ph.tasks.map((t) => t.title)) ?? []);
  }

  const rows = parts.map((p) => {
    const tlId = p.timeline?.id ?? null;
    const clientTasks = tlId ? clientTasksByTimeline.get(tlId) ?? [] : [];
    const ptTokens = tokens(p.title);
    // Heurística de equivalencia: una tarea party=CLIENTE comparte ≥2 tokens significativos.
    let bestMatch: { title: string; shared: number } | null = null;
    for (const t of clientTasks) {
      const shared = [...tokens(t)].filter((w) => ptTokens.has(w)).length;
      if (shared >= 2 && (!bestMatch || shared > bestMatch.shared)) bestMatch = { title: t, shared };
    }
    return {
      id: p.id,
      project: p.timeline?.project?.name ?? "(?)",
      projectId: p.timeline?.projectId ?? null,
      kind: p.kind,
      party: p.party,
      title: p.title,
      weeksImpact: p.weeksImpact,
      visibleExternal: p.visibleExternal,
      occurredAt: p.occurredAt.toISOString().slice(0, 10),
      reason: p.kind === "SOLICITUD" ? "SOLICITUD (deprecado)" : "ATRASO sin weeksImpact",
      clientTaskMatch: bestMatch ? bestMatch.title : null,
      clientTasksInProject: clientTasks,
    };
  });

  const outPath = process.env.AUDIT_OUT ?? join(tmpdir(), "particularidades-audit.json");
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, rows }, null, 2), "utf8");

  // Reporte legible por stdout.
  console.log(`\n=== AUDITORÍA de particularidades a revisar: ${rows.length} ===`);
  console.log(`(SOLICITUD deprecado + ATRASO sin weeksImpact) — NADA se borró ni aplicó.\n`);
  for (const r of rows) {
    const vis = r.visibleExternal ? "⚠ VISIBLE al cliente" : "solo interna";
    const match = r.clientTaskMatch ? `↔ tarea CLIENTE: «${r.clientTaskMatch}»` : "SIN tarea CLIENTE equivalente";
    console.log(`• [${r.project}] ${r.reason} | ${vis} | ${match}`);
    console.log(`    «${r.title}»`);
  }
  const noHome = rows.filter((r) => !r.clientTaskMatch).length;
  const visible = rows.filter((r) => r.visibleExternal).length;
  console.log(`\nResumen: ${rows.length} a revisar · ${noHome} sin tarea CLIENTE equivalente · ${visible} visibles al cliente.`);
  console.log(`Archivo exportado: ${outPath}`);
  console.log(`\nNo se hizo ningún cambio. Decidí caso por caso (convertir a tarea / cuantificar el ATRASO / dejar / borrar a mano).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
